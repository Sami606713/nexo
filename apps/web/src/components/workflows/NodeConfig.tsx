"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { IconAlertTriangle, IconCheck, IconCopy, IconPlus, IconTrash, IconVariable, type Icon } from "@tabler/icons-react";
import { NETWORK_LABELS, type Network } from "@postline/core";
import { api } from "@/lib/fetcher";
import {
  STEP_OUTPUTS,
  TRIGGER_TYPES,
  TRIGGER_VARIABLES,
  defaultTriggerConfig,
  type AIAgentDTO,
  type TriggerType,
  type WooStoreDTO,
  type WorkflowDTO,
  type WorkflowStep,
  type WorkflowTrigger,
} from "@/lib/workflows/types";
import type { ChannelDto } from "@/components/channels/types";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { dayjs } from "@/components/posts/tz";
import { STEP_META, TRIGGER_META } from "./meta";
import { AgentModal } from "./AgentModal";

export interface BuilderRefs {
  agents: AIAgentDTO[];
  channels: ChannelDto[];
  stores: WooStoreDTO[];
  reloadAgents: () => void;
  reloadStores: () => void;
}

export interface Variable {
  token: string;
  label: string;
  group: string;
}

export function availableVariables(trigger: WorkflowTrigger, steps: WorkflowStep[], beforeIndex: number): Variable[] {
  const out: Variable[] = TRIGGER_VARIABLES[trigger.type].map((v) => ({ token: `{{trigger.${v.key}}}`, label: v.label, group: "Trigger" }));
  steps.slice(0, Math.max(0, beforeIndex)).forEach((s, i) => {
    for (const o of STEP_OUTPUTS[s.type] ?? []) out.push({ token: `{{steps.${s.id}.${o.key}}}`, label: o.label, group: `${i + 1}. ${STEP_META[s.type].label}` });
  });
  out.push({ token: "{{brand.name}}", label: "Brand name", group: "Brand" });
  return out;
}

/** Textarea / input with clickable variable chips that insert at the cursor. */
function TemplateField({
  label,
  description,
  value,
  onChange,
  variables,
  multiline = true,
  placeholder,
  minRows = 3,
  error,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  variables: Variable[];
  multiline?: boolean;
  placeholder?: string;
  minRows?: number;
  error?: string;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const groups = [...new Set(variables.map((v) => v.group))];
  return (
    <Stack gap={6}>
      {multiline ? (
        <Textarea
          ref={ref}
          label={label}
          description={description}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          autosize
          minRows={minRows}
          maxRows={12}
          placeholder={placeholder}
          error={error}
          styles={{ input: { fontFamily: "var(--mantine-font-family)" } }}
        />
      ) : (
        <TextInput ref={ref} label={label} description={description} value={value} onChange={(e) => onChange(e.currentTarget.value)} placeholder={placeholder} error={error} />
      )}
      <Stack gap={4}>
        {groups.map((g) => (
          <Group key={g} gap={4}>
            <Text size="10px" c="dimmed" tt="uppercase" fw={600} w="100%">
              {g}
            </Text>
            {variables
              .filter((v) => v.group === g)
              .map((v) => (
                <Tooltip key={v.token} label={v.token} openDelay={400}>
                  <Badge
                    component="button"
                    type="button"
                    variant="light"
                    color={g === "Trigger" ? "violet" : g === "Brand" ? "gray" : "blue"}
                    radius="sm"
                    size="sm"
                    leftSection={<IconVariable size={10} />}
                    style={{ cursor: "pointer", textTransform: "none" }}
                    onClick={() => insert(v.token)}
                  >
                    {v.label}
                  </Badge>
                </Tooltip>
              ))}
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function channelOptions(channels: ChannelDto[]) {
  return channels.map((c) => ({ value: c.id, label: `${c.name} · ${NETWORK_LABELS[c.network as Network] ?? c.network}` }));
}

function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
      <Stack gap={2}>
        {errors.map((e) => (
          <Text key={e} size="xs">
            {e}
          </Text>
        ))}
      </Stack>
    </Alert>
  );
}

function PanelHeader({ icon: Icon, color, title, subtitle, onDelete }: { icon: Icon; color: string; title: string; subtitle: string; onDelete?: () => void }) {
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon size={36} radius="md" variant="light" color={color}>
          <Icon size={18} />
        </ThemeIcon>
        <div>
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </div>
      </Group>
      {onDelete && (
        <Tooltip label="Remove this action">
          <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label="Remove action">
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

// ───────────────────────── Trigger ─────────────────────────

export function TriggerConfig({
  workflow,
  trigger,
  onChange,
  errors,
  refs,
  readOnly,
}: {
  workflow: WorkflowDTO;
  trigger: WorkflowTrigger;
  onChange: (t: WorkflowTrigger) => void;
  errors: string[];
  refs: BuilderRefs;
  readOnly: boolean;
}) {
  const b = useBrand();
  const [wooOpen, setWooOpen] = useState(false);
  const meta = TRIGGER_META[trigger.type];
  const c = trigger.config ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...trigger, config: { ...c, ...patch } });

  return (
    <Stack gap="md">
      <PanelHeader icon={meta.icon} color={meta.color} title="Trigger" subtitle="What starts this workflow" />
      <Select
        label="When this happens"
        data={TRIGGER_TYPES.map((t) => ({ value: t, label: TRIGGER_META[t].label }))}
        value={trigger.type}
        allowDeselect={false}
        disabled={readOnly}
        onChange={(v) => v && v !== trigger.type && onChange({ type: v as TriggerType, config: defaultTriggerConfig(v as TriggerType) })}
        description={meta.description}
      />
      <Divider />

      {trigger.type === "schedule" && (
        <>
          <SegmentedControl
            fullWidth
            value={str(c.mode) || "daily"}
            onChange={(v) => set({ mode: v })}
            data={[
              { value: "daily", label: "Daily at a time" },
              { value: "interval", label: "Every…" },
            ]}
          />
          {(str(c.mode) || "daily") === "daily" ? (
            <TimeInput label="Time of day" description={`In your brand time zone (${b.timezone})`} value={str(c.time) || "09:00"} onChange={(e) => set({ time: e.currentTarget.value })} />
          ) : (
            <Group grow align="flex-start">
              <NumberInput label="Every" min={1} max={999} value={Number(c.every) || 1} onChange={(v) => set({ every: Number(v) || 1 })} />
              <Select
                label="Unit"
                allowDeselect={false}
                value={str(c.unit) || "hours"}
                onChange={(v) => set({ unit: v })}
                data={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                  { value: "days", label: "Days" },
                ]}
              />
            </Group>
          )}
        </>
      )}

      {trigger.type === "rss" && (
        <>
          <TextInput label="Feed URL" placeholder="https://example.com/feed.xml" value={str(c.url)} onChange={(e) => set({ url: e.currentTarget.value.trim() })} description="RSS 2.0 or Atom" />
          <Select
            label="Check for new items"
            allowDeselect={false}
            value={String(Number(c.intervalMinutes) || 60)}
            onChange={(v) => set({ intervalMinutes: Number(v) })}
            data={[
              { value: "60", label: "Every hour" },
              { value: "90", label: "Every 90 minutes" },
              { value: "120", label: "Every 2 hours" },
            ]}
          />
          <Text size="xs" c="dimmed">
            When you switch the workflow on, items already in the feed are recorded and skipped — only articles published afterwards start a run.
          </Text>
          {workflow.state.rss?.lastPolledAt && (
            <Text size="xs" c={workflow.state.rss.lastError ? "red" : "dimmed"}>
              Last checked {dayjs(workflow.state.rss.lastPolledAt).fromNow()}
              {workflow.state.rss.lastError ? ` — ${workflow.state.rss.lastError}` : ""}
            </Text>
          )}
        </>
      )}

      {trigger.type === "webhook" && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Your private webhook URL
          </Text>
          <Group gap={6} wrap="nowrap">
            <Code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workflow.webhookUrl}</Code>
            <CopyButton value={workflow.webhookUrl}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy"}>
                  <ActionIcon variant="light" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy URL">
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size="xs" c="dimmed">
            Call it with GET or POST. Query parameters and JSON body fields become variables — e.g. a body {"{"}&quot;title&quot;: &quot;…&quot;{"}"} is available as{" "}
            <Code>{"{{trigger.title}}"}</Code>. Keep the URL secret; it works only while the workflow is on (max 60 calls/minute).
          </Text>
          <Code block style={{ fontSize: 11 }}>{`curl -X POST ${workflow.webhookUrl} \\\n  -H "content-type: application/json" \\\n  -d '{"title":"New arrival","message":"Fresh stock just landed","url":"https://example.com"}'`}</Code>
        </Stack>
      )}

      {trigger.type === "woo_product" && (
        <>
          <Select
            label="WooCommerce store"
            placeholder={refs.stores.length ? "Select a store" : "No store connected yet"}
            data={refs.stores.map((s) => ({ value: s.id, label: s.url.replace(/^https?:\/\//, "") }))}
            value={str(c.storeId) || null}
            onChange={(v) => set({ storeId: v ?? "" })}
          />
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setWooOpen(true)} w="fit-content" disabled={readOnly}>
            Connect a store
          </Button>
          <Text size="xs" c="dimmed">
            We check the store every 5 minutes. Each newly published product starts one run with its name, price, description, link and images.
          </Text>
          <WooStoreModal
            opened={wooOpen}
            onClose={() => setWooOpen(false)}
            onSaved={(s) => {
              refs.reloadStores();
              set({ storeId: s.id });
            }}
          />
        </>
      )}

      {(trigger.type === "new_comment" || trigger.type === "new_mention" || trigger.type === "new_dm") && (
        <>
          <Select
            label="Channel"
            placeholder={trigger.type === "new_comment" ? "Select a channel" : "Any channel"}
            clearable={trigger.type !== "new_comment"}
            data={channelOptions(refs.channels)}
            value={str(c.channelId) || null}
            onChange={(v) => set({ channelId: v ?? "" })}
          />
          {trigger.type === "new_comment" && (
            <TextInput
              label="Only comments on this post (optional)"
              description="Paste the post's network ID to watch a single post. Leave empty to watch every post on the channel."
              placeholder="e.g. 112345678901234567"
              value={str(c.postExternalId)}
              onChange={(e) => set({ postExternalId: e.currentTarget.value.trim() })}
            />
          )}
          <Text size="xs" c="dimmed">
            Runs when the inbox syncs a new {trigger.type === "new_dm" ? "direct message" : trigger.type === "new_mention" ? "mention" : "comment"}. Turn on the inbox for the channel in{" "}
            <Anchor component={Link} href={`/app/${b.brandId}/channels`} size="xs">
              Channels
            </Anchor>
            .
          </Text>
        </>
      )}
      <Errors errors={errors} />
    </Stack>
  );
}

// ───────────────────────── Steps ─────────────────────────

export function StepConfig({
  step,
  index,
  trigger,
  steps,
  onChange,
  onDelete,
  errors,
  refs,
  readOnly,
}: {
  step: WorkflowStep;
  index: number;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  onChange: (s: WorkflowStep) => void;
  onDelete: () => void;
  errors: string[];
  refs: BuilderRefs;
  readOnly: boolean;
}) {
  const b = useBrand();
  const [agentModal, setAgentModal] = useState(false);
  const meta = STEP_META[step.type];
  const c = step.config ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...step, config: { ...c, ...patch } });
  const vars = availableVariables(trigger, steps, index);
  const hasAiImageBefore = steps.slice(0, index).some((s) => s.type === "ai_agent");

  return (
    <Stack gap="md">
      <PanelHeader icon={meta.icon} color={meta.color} title={`${index + 1}. ${meta.label}`} subtitle={meta.description} onDelete={readOnly ? undefined : onDelete} />
      <Divider />

      {step.type === "ai_agent" && (
        <>
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              style={{ flex: 1 }}
              label="Agent"
              placeholder={refs.agents.length ? "Select an agent" : "Create your first agent"}
              data={refs.agents.map((a) => ({ value: a.id, label: a.name }))}
              value={str(c.agentId) || null}
              onChange={(v) => set({ agentId: v ?? "" })}
            />
            <Tooltip label="New agent">
              <ActionIcon size={36} variant="light" onClick={() => setAgentModal(true)} aria-label="New agent" disabled={readOnly}>
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {str(c.agentId) && refs.agents.find((a) => a.id === str(c.agentId)) && (
            <Text size="xs" c="dimmed" lineClamp={3}>
              {refs.agents.find((a) => a.id === str(c.agentId))!.prompt}
            </Text>
          )}
          <TemplateField
            label="Input"
            description="What the agent should work with. Combine fixed text and variables."
            value={str(c.input)}
            onChange={(v) => set({ input: v })}
            variables={vars}
            minRows={4}
          />
          <Switch
            label="Also generate an image"
            description="Creates one square image from the generated text and passes it to later steps"
            checked={!!c.generateImage}
            onChange={(e) => set({ generateImage: e.currentTarget.checked })}
          />
          <Anchor component={Link} href={`/app/${b.brandId}/workflows/agents`} size="xs">
            Manage agents
          </Anchor>
          <AgentModal
            opened={agentModal}
            agent={null}
            onClose={() => setAgentModal(false)}
            onSaved={(a) => {
              refs.reloadAgents();
              set({ agentId: a.id });
            }}
          />
        </>
      )}

      {step.type === "create_post" && (
        <>
          <TemplateField label="Caption" value={str(c.caption)} onChange={(v) => set({ caption: v })} variables={vars} minRows={4} placeholder="Write the caption or insert a variable" />
          <MultiSelect
            label="Channels"
            placeholder={refs.channels.length ? "Choose channels" : "No channels connected"}
            data={channelOptions(refs.channels)}
            value={Array.isArray(c.channelIds) ? (c.channelIds as string[]) : []}
            onChange={(v) => set({ channelIds: v })}
            searchable
            clearable
          />
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Then
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={str(c.behavior) || "add_to_drafts"}
              onChange={(v) => set({ behavior: v })}
              data={[
                { value: "add_to_drafts", label: "Save as draft" },
                { value: "schedule_next_slot", label: "Next free slot" },
                { value: "publish_now", label: "Publish now" },
              ]}
            />
            <Text size="xs" c="dimmed">
              {str(c.behavior) === "publish_now"
                ? "Publishes immediately. If a network rejects the post, it's saved as a draft instead."
                : str(c.behavior) === "schedule_next_slot"
                  ? "Queues the post at the channel's next free posting slot (9:00, 13:00 or 18:00 if no slots are set)."
                  : "Lands in the planner as a draft so your team can review it first."}
            </Text>
          </Stack>
          <TemplateField
            label="Image URLs (optional)"
            description="One or more public image links, separated by spaces or new lines"
            value={str(c.mediaUrls)}
            onChange={(v) => set({ mediaUrls: v })}
            variables={vars}
            multiline={false}
            placeholder="{{trigger.image}}"
          />
          {hasAiImageBefore && (
            <Switch label="Attach images generated by earlier AI steps" checked={c.useStepImage !== false} onChange={(e) => set({ useStepImage: e.currentTarget.checked })} />
          )}
        </>
      )}

      {(step.type === "reply_comment" || step.type === "send_dm") && (
        <>
          <TemplateField
            label={step.type === "reply_comment" ? "Reply" : "Message"}
            value={str(c.text)}
            onChange={(v) => set({ text: v })}
            variables={vars}
            minRows={3}
          />
          <Text size="xs" c="dimmed">
            {step.type === "reply_comment"
              ? "Posted as a public reply to the comment or mention that started the run."
              : "Sent in the same direct-message thread that started the run."}{" "}
            Test runs don&apos;t send anything.
          </Text>
        </>
      )}

      {step.type === "filter" && (
        <>
          <TemplateField label="Check this text" value={str(c.subject)} onChange={(v) => set({ subject: v })} variables={vars} multiline={false} />
          <Select
            label="Continue only if it"
            allowDeselect={false}
            value={str(c.op) || "contains"}
            onChange={(v) => set({ op: v })}
            data={[
              { value: "contains", label: "contains" },
              { value: "not_contains", label: "does not contain" },
            ]}
          />
          <TextInput label="Word or phrase" description="Not case-sensitive. Separate alternatives with commas." placeholder="price, cost" value={str(c.value)} onChange={(e) => set({ value: e.currentTarget.value })} />
          <Text size="xs" c="dimmed">
            When the condition isn&apos;t met, the run stops here and is marked “Filtered”.
          </Text>
        </>
      )}

      {step.type === "delay" && (
        <Group grow align="flex-start">
          <NumberInput label="Wait" min={1} max={720} value={Number(c.amount) || 1} onChange={(v) => set({ amount: Number(v) || 1 })} />
          <Select
            label="Unit"
            allowDeselect={false}
            value={str(c.unit) || "minutes"}
            onChange={(v) => set({ unit: v })}
            data={[
              { value: "minutes", label: "Minutes" },
              { value: "hours", label: "Hours" },
            ]}
          />
        </Group>
      )}

      <Errors errors={errors} />
    </Stack>
  );
}

// ───────────────────────── Woo store ─────────────────────────

export function WooStoreModal({ opened, onClose, onSaved }: { opened: boolean; onClose: () => void; onSaved: (s: WooStoreDTO) => void }) {
  const b = useBrand();
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      const s = await api<WooStoreDTO>(`/api/brands/${b.brandId}/woo-stores`, "POST", { url, consumerKey: key, consumerSecret: secret });
      notifySuccess("Store connected");
      onSaved(s);
      onClose();
      setKey("");
      setSecret("");
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} centered title={<Text fw={600}>Connect a WooCommerce store</Text>}>
      <Stack>
        <Text size="sm" c="dimmed">
          In WordPress go to WooCommerce → Settings → Advanced → REST API and create a key with <b>Read</b> access.
        </Text>
        <TextInput label="Store URL" placeholder="https://shop.example.com" value={url} onChange={(e) => setUrl(e.currentTarget.value)} data-autofocus />
        <TextInput label="Consumer key" placeholder="ck_…" value={key} onChange={(e) => setKey(e.currentTarget.value)} />
        <PasswordInput label="Consumer secret" placeholder="cs_…" value={secret} onChange={(e) => setSecret(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          Keys are encrypted and only used to read published products.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={submit} disabled={!url || !key || !secret}>
            Verify & connect
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
