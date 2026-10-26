"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { IconDots, IconMailForward, IconSend, IconTrash, IconUserPlus, IconUsers } from "@tabler/icons-react";
import type { Role } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";

interface MemberDto {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}
interface InviteDto {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin", description: "Everything except deleting the brand" },
  { value: "MANAGER", label: "Manager", description: "Create and schedule posts, connect channels" },
  { value: "CLIENT", label: "Client", description: "Review and approve posts" },
];
const ROLE_COLORS: Record<Role, string> = { OWNER: "violet", ADMIN: "indigo", MANAGER: "teal", CLIENT: "gray" };
const roleLabel = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

export function TeamSettings() {
  const b = useBrand();
  const manage = b.can("members.manage");
  const membersKey = `/api/brands/${b.brandId}/members`;
  const invitesKey = `/api/brands/${b.brandId}/invites`;
  const members = useSWR<MemberDto[]>(membersKey);
  const invites = useSWR<InviteDto[]>(manage ? invitesKey : null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const changeRole = async (m: MemberDto, role: Role) => {
    try {
      await api(`${membersKey}/${m.id}`, "PATCH", { role });
      await members.mutate();
      notifySuccess(`${m.user.name ?? m.user.email} is now ${roleLabel(role)}`);
    } catch (e) {
      notifyError(e);
    }
  };

  const remove = (m: MemberDto) => {
    const self = m.user.id === b.user.id;
    modals.openConfirmModal({
      title: self ? "Leave this brand?" : `Remove ${m.user.name ?? m.user.email}?`,
      centered: true,
      children: <Text size="sm">{self ? "You'll lose access to this brand." : "They'll immediately lose access to this brand."}</Text>,
      labels: { confirm: self ? "Leave" : "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${membersKey}/${m.id}`, "DELETE");
          if (self) window.location.href = "/app";
          else {
            await members.mutate();
            notifySuccess("Member removed");
          }
        } catch (e) {
          notifyError(e);
        }
      },
    });
  };

  const resend = async (i: InviteDto) => {
    try {
      await api(`${invitesKey}/${i.id}/resend`, "POST");
      await invites.mutate();
      notifySuccess(`Invitation re-sent to ${i.email}`);
    } catch (e) {
      notifyError(e);
    }
  };
  const revoke = (i: InviteDto) =>
    modals.openConfirmModal({
      title: "Revoke invitation?",
      centered: true,
      children: <Text size="sm">The invite link sent to {i.email} will stop working.</Text>,
      labels: { confirm: "Revoke", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api(`${invitesKey}/${i.id}`, "DELETE");
          await invites.mutate();
          notifySuccess("Invitation revoked");
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite teammates and clients, and control what they can do."
        actions={
          manage && (
            <Button leftSection={<IconUserPlus size={16} />} onClick={() => setInviteOpen(true)}>
              Invite member
            </Button>
          )
        }
      />
      <Card withBorder radius="lg" padding={0}>
        {members.isLoading ? (
          <Stack p="md">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={40} />
            ))}
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Member</Table.Th>
                  <Table.Th w={200}>Role</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members.data?.map((m) => {
                  const self = m.user.id === b.user.id;
                  const editable = manage && m.role !== "OWNER" && !self;
                  return (
                    <Table.Tr key={m.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar src={m.user.image} radius="xl" size={34} color="indigo">
                            {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
                          </Avatar>
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={500} truncate>
                              {m.user.name ?? m.user.email} {self && <Text span c="dimmed" size="xs">(you)</Text>}
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {m.user.email}
                            </Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {editable ? (
                          <Select
                            size="xs"
                            allowDeselect={false}
                            value={m.role}
                            data={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                            onChange={(v) => v && v !== m.role && changeRole(m, v as Role)}
                          />
                        ) : (
                          <Badge variant="light" color={ROLE_COLORS[m.role]}>
                            {roleLabel(m.role)}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {m.role !== "OWNER" && (manage || self) && (
                          <Tooltip label={self ? "Leave brand" : "Remove member"}>
                            <ActionIcon variant="subtle" color="red" onClick={() => remove(m)} aria-label="Remove">
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {manage && (
        <>
          <Title order={4} mt="xl" mb="sm">
            Pending invitations
          </Title>
          {invites.isLoading ? (
            <Skeleton h={60} radius="lg" />
          ) : !invites.data?.length ? (
            <EmptyState
              icon={<IconUsers size={26} />}
              title="No pending invitations"
              description="Invite teammates to plan and write posts, or clients to approve them."
              action={
                <Button variant="light" mt="xs" leftSection={<IconUserPlus size={16} />} onClick={() => setInviteOpen(true)}>
                  Invite member
                </Button>
              }
            />
          ) : (
            <Card withBorder radius="lg" padding={0}>
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th w={60} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {invites.data.map((i) => (
                      <Table.Tr key={i.id}>
                        <Table.Td>
                          <Text size="sm">{i.email}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={ROLE_COLORS[i.role]}>
                            {roleLabel(i.role)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {i.expired ? (
                            <Badge color="red" variant="light">
                              Expired
                            </Badge>
                          ) : (
                            <Text size="xs" c="dimmed">
                              Expires {new Date(i.expiresAt).toLocaleDateString()}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Menu position="bottom-end" shadow="md">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" aria-label="Invite actions">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconMailForward size={14} />} onClick={() => resend(i)}>
                                Resend
                              </Menu.Item>
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => revoke(i)}>
                                Revoke
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>
          )}
          <InviteModal
            opened={inviteOpen}
            onClose={() => setInviteOpen(false)}
            onInvited={() => invites.mutate()}
            invitesKey={invitesKey}
          />
        </>
      )}
    </>
  );
}

function InviteModal({ opened, onClose, onInvited, invitesKey }: { opened: boolean; onClose: () => void; onInvited: () => void; invitesKey: string }) {
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: { email: "", role: "MANAGER" },
    validate: { email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email") },
  });
  const submit = form.onSubmit(async (v) => {
    setLoading(true);
    try {
      await api(invitesKey, "POST", v);
      notifySuccess(`Invitation sent to ${v.email}`);
      form.reset();
      onInvited();
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  });
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>Invite a team member</Text>} centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Email" placeholder="teammate@company.com" data-autofocus {...form.getInputProps("email")} />
          <Select
            label="Role"
            allowDeselect={false}
            data={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            renderOption={({ option }) => (
              <div>
                <Text size="sm">{option.label}</Text>
                <Text size="xs" c="dimmed">
                  {ROLE_OPTIONS.find((r) => r.value === option.value)?.description}
                </Text>
              </div>
            )}
            {...form.getInputProps("role")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} leftSection={<IconSend size={16} />}>
              Send invite
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
