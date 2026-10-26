"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ActionIcon, Avatar, Badge, Button, Card, Group, Indicator, Menu, SimpleGrid, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPlug, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import type { Network } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { ConnectChannelModal } from "./ConnectChannelModal";
import { NETWORK_META, NetworkIcon } from "./networkMeta";
import type { ChannelDto } from "./types";

const HEALTH = {
  OK: { color: "teal", label: "Connected" },
  NEEDS_RECONNECT: { color: "orange", label: "Reconnect needed" },
  ERROR: { color: "red", label: "Error" },
} as const;

function errorText(e: unknown): string | null {
  if (!e) return null;
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return null;
}

export function ChannelsView({ flash }: { flash: { connected?: string; skipped?: string; error?: string } }) {
  const b = useBrand();
  const router = useRouter();
  const key = `/api/brands/${b.brandId}/channels`;
  const { data, error, isLoading, mutate } = useSWR<ChannelDto[]>(key);
  const [modal, setModal] = useState<{ open: boolean; network?: Network | null }>({ open: false });
  const canConnect = b.can("channels.connect");

  useEffect(() => {
    if (flash.error) notifications.show({ color: "red", title: "Couldn't connect", message: flash.error });
    else if (flash.connected) {
      const n = Number(flash.connected);
      notifySuccess(
        `${n} channel${n === 1 ? "" : "s"} connected` + (flash.skipped ? ` · ${flash.skipped} skipped because of your plan's channel limit` : ""),
        "All set",
      );
    }
    if (flash.error || flash.connected) router.replace(`/app/${b.brandId}/channels`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = (c: ChannelDto) =>
    modals.openConfirmModal({
      title: `Disconnect ${c.name}?`,
      centered: true,
      children: (
        <Text size="sm">
          Scheduled posts for this {NETWORK_META[c.network].label} channel will no longer be published. Posts already published stay on{" "}
          {NETWORK_META[c.network].label}.
        </Text>
      ),
      labels: { confirm: "Disconnect", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await mutate(
            async (cur) => {
              await api(`${key}/${c.id}`, "DELETE");
              return cur?.filter((x) => x.id !== c.id);
            },
            { revalidate: false },
          );
          notifySuccess(`${c.name} disconnected`);
        } catch (e) {
          notifyError(e);
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Channels"
        description="Social accounts this brand publishes to."
        actions={
          canConnect && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true })}>
              Connect channel
            </Button>
          )
        }
      />
      {isLoading && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={96} radius="lg" />
          ))}
        </SimpleGrid>
      )}
      {error && <Text c="red">Couldn&apos;t load channels.</Text>}
      {data && data.length === 0 && (
        <EmptyState
          icon={<IconPlug size={28} />}
          title="Connect your first channel"
          description="Link Facebook, Instagram, LinkedIn, X, Bluesky and more to schedule and publish posts from one place."
          action={
            canConnect && (
              <Button mt="sm" leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true })}>
                Connect channel
              </Button>
            )
          }
        />
      )}
      {data && data.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {data.map((c) => {
            const h = HEALTH[c.health];
            const err = errorText(c.lastError);
            return (
              <Card key={c.id} withBorder radius="lg" padding="md">
                <Group wrap="nowrap" justify="space-between" align="flex-start">
                  <Group wrap="nowrap" gap="sm" style={{ minWidth: 0 }}>
                    <Indicator inline label={<NetworkIcon network={c.network} size={18} />} position="bottom-end" offset={6} withBorder={false} color="transparent" size={18}>
                      <Avatar src={c.avatarUrl} radius="xl" size={44}>
                        {c.name.charAt(0)}
                      </Avatar>
                    </Indicator>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={600} size="sm" truncate>
                        {c.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {NETWORK_META[c.network].label}
                        {c.username ? ` · @${c.username}` : ""}
                      </Text>
                    </Stack>
                  </Group>
                  {canConnect && (
                    <Menu position="bottom-end" shadow="md">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Channel actions">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconRefresh size={14} />} onClick={() => setModal({ open: true, network: c.network })}>
                          Reconnect
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => disconnect(c)}>
                          Disconnect
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
                <Group mt="md" justify="space-between">
                  <Tooltip label={err} disabled={!err} multiline w={260}>
                    <Badge color={h.color} variant="light">
                      {h.label}
                    </Badge>
                  </Tooltip>
                  {c.health !== "OK" && canConnect && (
                    <Button size="xs" variant="light" color="orange" leftSection={<IconRefresh size={14} />} onClick={() => setModal({ open: true, network: c.network })}>
                      Reconnect
                    </Button>
                  )}
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
      <ConnectChannelModal
        brandId={b.brandId}
        opened={modal.open}
        initialNetwork={modal.network}
        onClose={() => setModal({ open: false })}
        onConnected={() => mutate()}
      />
    </>
  );
}
