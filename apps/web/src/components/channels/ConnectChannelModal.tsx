"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import type { Network } from "@postline/core";
import { api } from "@/lib/fetcher";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { NetworkIcon } from "./networkMeta";
import { oauthStartUrl, type ConnectResponse, type NetworkOption, type PendingTarget } from "./types";
import classes from "./ConnectChannelModal.module.css";

type Step = { kind: "pick-network" } | { kind: "form"; net: NetworkOption } | { kind: "pick-targets"; net: NetworkOption; token: string; targets: PendingTarget[] };

export function ConnectChannelModal({
  brandId,
  opened,
  onClose,
  onConnected,
  initialNetwork,
}: {
  brandId: string;
  opened: boolean;
  onClose: () => void;
  onConnected: () => void;
  /** Open directly on this network (Reconnect). */
  initialNetwork?: Network | null;
}) {
  const { data: networks, error, isLoading } = useSWR<NetworkOption[]>(opened ? `/api/brands/${brandId}/channels/networks` : null);
  const [step, setStep] = useState<Step>({ kind: "pick-network" });
  const [redirecting, setRedirecting] = useState<Network | null>(null);

  const choose = (net: NetworkOption) => {
    if (net.connectKind === "oauth2") {
      setRedirecting(net.network);
      window.location.href = oauthStartUrl(net.network, brandId);
    } else setStep({ kind: "form", net });
  };

  useEffect(() => {
    if (!opened) {
      setStep({ kind: "pick-network" });
      setRedirecting(null);
      return;
    }
    if (initialNetwork && networks) {
      const n = networks.find((x) => x.network === initialNetwork);
      if (n) choose(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialNetwork, networks]);

  const done = (r: ConnectResponse) => {
    if ("pending" in r) return;
    notifySuccess(
      `${r.connected} channel${r.connected === 1 ? "" : "s"} connected` + (r.skipped ? ` · ${r.skipped} skipped (plan limit)` : ""),
    );
    onConnected();
    onClose();
  };

  const title =
    step.kind === "pick-network" ? "Connect a channel" : step.kind === "form" ? `Connect ${step.net.label}` : `Choose ${step.net.label} accounts`;

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>} size="lg" centered>
      {step.kind === "pick-network" && (
        <>
          {error && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
              Couldn&apos;t load networks.
            </Alert>
          )}
          {isLoading && (
            <SimpleGrid cols={{ base: 2, sm: 3 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} h={92} radius="md" />
              ))}
            </SimpleGrid>
          )}
          {networks && networks.length === 0 && (
            <Text c="dimmed" ta="center" py="xl">
              No networks are configured yet. Add network app credentials to your environment.
            </Text>
          )}
          {networks && networks.length > 0 && (
            <SimpleGrid cols={{ base: 2, sm: 3 }}>
              {networks.map((n) => (
                <UnstyledButton key={n.network} className={classes.tile} onClick={() => choose(n)} disabled={!!redirecting}>
                  <Stack align="center" gap={8}>
                    <NetworkIcon network={n.network} size={36} />
                    <Text size="sm" fw={500} ta="center">
                      {n.label}
                    </Text>
                    {redirecting === n.network ? (
                      <Badge size="xs" variant="light">
                        Redirecting…
                      </Badge>
                    ) : n.connectKind === "oauth2" ? (
                      <Badge size="xs" variant="light" color="gray" rightSection={<IconExternalLink size={10} />}>
                        Sign in
                      </Badge>
                    ) : null}
                  </Stack>
                </UnstyledButton>
              ))}
            </SimpleGrid>
          )}
        </>
      )}
      {step.kind === "form" && (
        <CredentialsForm
          brandId={brandId}
          net={step.net}
          onBack={() => setStep({ kind: "pick-network" })}
          onResult={(r) => ("pending" in r ? setStep({ kind: "pick-targets", net: step.net, token: r.token, targets: r.targets }) : done(r))}
        />
      )}
      {step.kind === "pick-targets" && (
        <TargetPicker brandId={brandId} net={step.net} token={step.token} targets={step.targets} onBack={() => setStep({ kind: "form", net: step.net })} onDone={done} />
      )}
    </Modal>
  );
}

function CredentialsForm({ brandId, net, onBack, onResult }: { brandId: string; net: NetworkOption; onBack: () => void; onResult: (r: ConnectResponse) => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<Record<string, string>>({
    initialValues: Object.fromEntries(net.credentialFields.map((f) => [f.name, ""])),
    validate: Object.fromEntries(
      net.credentialFields.map((f) => [f.name, (v: string) => (f.required !== false && !v?.trim() ? `${f.label} is required` : null)]),
    ),
  });
  const submit = form.onSubmit(async (fields) => {
    setLoading(true);
    try {
      onResult(await api<ConnectResponse>(`/api/brands/${brandId}/channels/connect/${net.network.toLowerCase()}`, "POST", { fields }));
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  });
  return (
    <form onSubmit={submit}>
      <Stack>
        <Group gap="sm">
          <NetworkIcon network={net.network} size={32} />
          <Text size="sm" c="dimmed">
            {net.connectKind === "webhook" ? "Paste the webhook details below." : "Enter the account details below. They're stored encrypted."}
          </Text>
        </Group>
        {net.credentialFields.map((f) =>
          f.type === "password" ? (
            <PasswordInput key={f.name} label={f.label} placeholder={f.placeholder} description={f.help} withAsterisk={f.required !== false} {...form.getInputProps(f.name)} />
          ) : (
            <TextInput key={f.name} label={f.label} placeholder={f.placeholder} description={f.help} withAsterisk={f.required !== false} {...form.getInputProps(f.name)} />
          ),
        )}
        <Group justify="space-between" mt="sm">
          <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
            Back
          </Button>
          <Button type="submit" loading={loading}>
            Connect
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function TargetPicker({
  brandId,
  net,
  token,
  targets,
  onBack,
  onDone,
}: {
  brandId: string;
  net: NetworkOption;
  token: string;
  targets: PendingTarget[];
  onBack: () => void;
  onDone: (r: ConnectResponse) => void;
}) {
  const [selected, setSelected] = useState<string[]>(targets.map((t) => t.externalId));
  const [loading, setLoading] = useState(false);
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        We found {targets.length} accounts. Select the ones to connect to this brand.
      </Text>
      <Checkbox.Group value={selected} onChange={setSelected}>
        <Stack gap="xs">
          {targets.map((t) => (
            <Checkbox.Card key={t.externalId} value={t.externalId} radius="md" p="sm" withBorder>
              <Group wrap="nowrap">
                <Checkbox.Indicator />
                <Avatar src={t.avatarUrl} radius="xl" size={32}>
                  {t.name.charAt(0)}
                </Avatar>
                <div>
                  <Text size="sm" fw={500}>
                    {t.name}
                  </Text>
                  {t.username && (
                    <Text size="xs" c="dimmed">
                      @{t.username}
                    </Text>
                  )}
                </div>
              </Group>
            </Checkbox.Card>
          ))}
        </Stack>
      </Checkbox.Group>
      <Group justify="space-between">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={!selected.length}
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              onDone(await api<ConnectResponse>(`/api/brands/${brandId}/channels/connect/${net.network.toLowerCase()}`, "POST", { token, externalIds: selected }));
            } catch (e) {
              notifyError(e);
            } finally {
              setLoading(false);
            }
          }}
        >
          Connect {selected.length || ""}
        </Button>
      </Group>
    </Stack>
  );
}
