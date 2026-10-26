"use client";

import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconChevronDown,
  IconDeviceFloppy,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconTopologyStar3,
} from "@tabler/icons-react";
import { api, ApiError } from "@/lib/fetcher";
import {
  STEP_TYPES,
  defaultStepConfig,
  newStepId,
  type AIAgentDTO,
  type StepType,
  type WooStoreDTO,
  type WorkflowDTO,
  type WorkflowStep,
  type WorkflowTrigger,
} from "@/lib/workflows/types";
import { validateWorkflow, type WorkflowErrors } from "@/lib/workflows/validate";
import type { ChannelDto } from "@/components/channels/types";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { STEP_META, TRIGGER_META, stepSummary, triggerSummary } from "./meta";
import { StepConfig, TriggerConfig, type BuilderRefs } from "./NodeConfig";
import { RunsPanel } from "./RunsPanel";
import classes from "./workflows.module.css";

// ───────────────────────── canvas ─────────────────────────

interface CanvasApi {
  insertAt: (index: number, type: StepType) => void;
  readOnly: boolean;
}
const CanvasCtx = createContext<CanvasApi>({ insertAt: () => undefined, readOnly: true });

type WfNodeData = {
  kicker: string;
  title: string;
  summary: string;
  color: string;
  icon: (typeof STEP_META)[StepType]["icon"];
  errors: number;
  selected: boolean;
};

function StepMenu({ index, children }: { index: number; children: React.ReactNode }) {
  const { insertAt, readOnly } = useContext(CanvasCtx);
  if (readOnly) return null;
  return (
    <Menu position="right-start" shadow="md" withinPortal width={250}>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Add an action</Menu.Label>
        {STEP_TYPES.map((t) => {
          const m = STEP_META[t];
          const Icon = m.icon;
          return (
            <Menu.Item
              key={t}
              onClick={() => insertAt(index, t)}
              leftSection={
                <ThemeIcon size={26} radius="md" variant="light" color={m.color}>
                  <Icon size={14} />
                </ThemeIcon>
              }
            >
              <Text size="sm" fw={500}>
                {m.label}
              </Text>
              <Text size="xs" c="dimmed">
                {m.description}
              </Text>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

function WfNode({ data }: NodeProps<Node<WfNodeData>>) {
  const Icon = data.icon;
  return (
    <div className={`${classes.node} ${data.selected ? classes.nodeSelected : ""} ${data.errors ? classes.nodeError : ""}`} style={{ position: "relative" }}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {data.errors > 0 && (
        <Tooltip label={`${data.errors} thing${data.errors === 1 ? "" : "s"} to fix`}>
          <div className={classes.errorBadge}>{data.errors}</div>
        </Tooltip>
      )}
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon size={38} radius="md" variant="light" color={data.color}>
          <Icon size={20} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <div className={classes.kicker}>{data.kicker}</div>
          <Text size="sm" fw={600} truncate>
            {data.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {data.summary}
          </Text>
        </div>
      </Group>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

function AddNode({ data }: NodeProps<Node<{ index: number; empty: boolean }>>) {
  const { readOnly } = useContext(CanvasCtx);
  return (
    <div style={{ width: 300, display: "flex", justifyContent: "center" }}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {readOnly ? (
        <Badge variant="default" size="lg" radius="sm">
          End
        </Badge>
      ) : (
        <StepMenu index={data.index}>
          <Button variant="default" radius="xl" size="xs" leftSection={<IconPlus size={14} />} className="nodrag">
            {data.empty ? "Add your first action" : "Add action"}
          </Button>
        </StepMenu>
      )}
    </div>
  );
}

function PlusEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<{ index: number; insertable: boolean }>>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge id={id} path={path} />
      {data?.insertable && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }} className="nodrag nopan">
            <StepMenu index={data.index}>
              <ActionIcon size="sm" radius="xl" variant="default" aria-label="Insert action here">
                <IconPlus size={12} />
              </ActionIcon>
            </StepMenu>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { wf: WfNode, add: AddNode };
const edgeTypes = { plus: PlusEdge };
const GAP = 130;

function Canvas({
  trigger,
  steps,
  errors,
  selected,
  onSelect,
  lookup,
}: {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  errors: WorkflowErrors;
  selected: string;
  onSelect: (id: string) => void;
  lookup: Parameters<typeof triggerSummary>[1] & Parameters<typeof stepSummary>[1];
}) {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const { readOnly } = useContext(CanvasCtx);
  const flow = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    const tm = TRIGGER_META[trigger.type];
    const n: Node[] = [
      {
        id: "trigger",
        type: "wf",
        position: { x: 0, y: 0 },
        data: { kicker: "Trigger", title: tm.label, summary: triggerSummary(trigger, lookup), color: tm.color, icon: tm.icon, errors: errors.trigger.length, selected: selected === "trigger" } satisfies WfNodeData,
      },
    ];
    steps.forEach((s, i) => {
      const m = STEP_META[s.type];
      n.push({
        id: s.id,
        type: "wf",
        position: { x: 0, y: (i + 1) * GAP },
        data: { kicker: `Step ${i + 1}`, title: m.label, summary: stepSummary(s, lookup), color: m.color, icon: m.icon, errors: errors.steps[s.id]?.length ?? 0, selected: selected === s.id } satisfies WfNodeData,
      });
    });
    n.push({ id: "__add", type: "add", position: { x: 0, y: (steps.length + 1) * GAP }, data: { index: steps.length, empty: steps.length === 0 }, selectable: false });
    const ids = n.map((x) => x.id);
    const e: Edge[] = ids.slice(1).map((target, i) => ({
      id: `e-${ids[i]}-${target}`,
      source: ids[i]!,
      target,
      type: "plus",
      data: { index: i, insertable: !readOnly && target !== "__add" },
    }));
    return { nodes: n, edges: e };
  }, [trigger, steps, errors, selected, lookup, readOnly]);

  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.25, maxZoom: 1, duration: 200 }), 30);
    return () => clearTimeout(t);
  }, [steps.length, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={scheme}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      minZoom={0.3}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      panOnScroll
      zoomOnDoubleClick={false}
      onNodeClick={(_e, node) => node.type === "wf" && onSelect(node.id)}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

// ───────────────────────── builder ─────────────────────────

export function WorkflowBuilder({ workflowId }: { workflowId: string }) {
  const b = useBrand();
  const base = `/api/brands/${b.brandId}`;
  const { data: wf, mutate } = useSWR<WorkflowDTO>(`${base}/workflows/${workflowId}`);
  const { data: agents, mutate: reloadAgents } = useSWR<AIAgentDTO[]>(`${base}/ai-agents`);
  const { data: channels } = useSWR<ChannelDto[]>(`${base}/channels`);
  const { data: stores, mutate: reloadStores } = useSWR<WooStoreDTO[]>(`${base}/woo-stores`);
  const readOnly = !b.can("posts.write");

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<WorkflowTrigger | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState("trigger");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [tab, setTab] = useState<string | null>("builder");
  const [customRun, setCustomRun] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Load server state into the editor (first load, and after saving).
  useEffect(() => {
    if (!wf || dirty) return;
    setName(wf.name);
    setTrigger(wf.trigger);
    setSteps(wf.steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wf]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const refs: BuilderRefs = useMemo(
    () => ({ agents: agents ?? [], channels: channels ?? [], stores: stores ?? [], reloadAgents: () => void reloadAgents(), reloadStores: () => void reloadStores() }),
    [agents, channels, stores, reloadAgents, reloadStores],
  );

  const errors = useMemo<WorkflowErrors>(() => {
    if (!trigger) return { ok: false, trigger: [], steps: {}, general: [] };
    return validateWorkflow(trigger, steps, {
      agentIds: agents ? new Set(agents.map((a) => a.id)) : undefined,
      channelIds: channels ? new Set(channels.map((c) => c.id)) : undefined,
      storeIds: stores ? new Set(stores.map((s) => s.id)) : undefined,
    });
  }, [trigger, steps, agents, channels, stores]);

  const lookup = useMemo(
    () => ({
      channelName: (id: string) => channels?.find((c) => c.id === id)?.name,
      storeUrl: (id: string) => stores?.find((s) => s.id === id)?.url,
      agentName: (id: string) => agents?.find((a) => a.id === id)?.name,
    }),
    [channels, stores, agents],
  );

  const edit = useCallback(<T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  }, []);

  const insertAt = useCallback((index: number, type: StepType) => {
    const step: WorkflowStep = { id: newStepId(), type, config: defaultStepConfig(type) };
    if (type === "create_post") step.config.channelIds = (channels ?? []).map((c) => c.id);
    if (type === "ai_agent" && agents?.[0]) step.config.agentId = agents[0].id;
    setSteps((s) => [...s.slice(0, index), step, ...s.slice(index)]);
    setSelected(step.id);
    setDirty(true);
  }, [channels, agents]);

  const removeStep = (id: string) => {
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    modals.openConfirmModal({
      title: `Remove “${STEP_META[s.type].label}”?`,
      centered: true,
      children: <Text size="sm">Later steps that use its output will need new variables.</Text>,
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setSteps((list) => list.filter((x) => x.id !== id));
        setSelected("trigger");
        setDirty(true);
      },
    });
  };

  const save = async (quiet = false): Promise<boolean> => {
    if (!trigger) return false;
    setSaving(true);
    try {
      const res = await api<{ workflow: WorkflowDTO; errors: WorkflowErrors; deactivated: boolean }>(`${base}/workflows/${workflowId}`, "PATCH", {
        name: name.trim() || "Untitled workflow",
        trigger,
        steps,
      });
      setDirty(false);
      await mutate(res.workflow, { revalidate: false });
      if (res.deactivated) notifyError(new Error("Saved, but the workflow was paused because some steps need attention."));
      else if (!quiet) notifySuccess("Workflow saved");
      return true;
    } catch (e) {
      notifyError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (active: boolean) => {
    if (active && !errors.ok) {
      setShowErrors(true);
      setTab("builder");
      const first = errors.trigger.length ? "trigger" : Object.keys(errors.steps)[0];
      if (first) setSelected(first);
      notifyError(new Error("Finish setting up the highlighted steps before turning this workflow on."));
      return;
    }
    setToggling(true);
    try {
      if (dirty && !(await save(true))) return;
      const res = await api<{ workflow: WorkflowDTO }>(`${base}/workflows/${workflowId}/toggle`, "POST", { active });
      await mutate(res.workflow, { revalidate: false });
      notifySuccess(active ? "Workflow is live" : "Workflow paused");
    } catch (e) {
      notifyError(e);
      if (e instanceof ApiError) setShowErrors(true);
    } finally {
      setToggling(false);
    }
  };

  const runNow = async (input?: Record<string, unknown>) => {
    if (dirty && !(await save(true))) return;
    try {
      await api(`${base}/workflows/${workflowId}/run`, "POST", input ? { input } : {});
      notifySuccess("Test run started");
      setTab("runs");
    } catch (e) {
      notifyError(e);
    }
  };

  if (!wf || !trigger) {
    return (
      <Stack>
        <Skeleton h={48} radius="md" />
        <Skeleton h={520} radius="lg" />
      </Stack>
    );
  }

  const selectedIndex = steps.findIndex((s) => s.id === selected);
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;
  const errorCount = errors.trigger.length + errors.general.length + Object.values(errors.steps).reduce((n, e) => n + e.length, 0);

  return (
    <CanvasCtx.Provider value={{ insertAt, readOnly }}>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 260 }}>
            <Tooltip label="All workflows">
              <ActionIcon component={Link} href={`/app/${b.brandId}/workflows`} variant="subtle" color="gray" size="lg" aria-label="Back">
                <IconArrowLeft size={18} />
              </ActionIcon>
            </Tooltip>
            <TextInput
              value={name}
              onChange={(e) => edit(setName)(e.currentTarget.value)}
              variant="unstyled"
              size="lg"
              readOnly={readOnly}
              placeholder="Untitled workflow"
              styles={{ input: { fontWeight: 700, fontSize: 22 } }}
              style={{ flex: 1 }}
              aria-label="Workflow name"
            />
            {dirty && (
              <Badge variant="light" color="orange" size="sm">
                Unsaved
              </Badge>
            )}
          </Group>
          <Group gap="sm">
            <Switch
              size="md"
              checked={wf.active}
              disabled={readOnly || toggling}
              onChange={(e) => toggle(e.currentTarget.checked)}
              label={wf.active ? "Active" : "Off"}
              color="teal"
            />
            {!readOnly && (
              <Button.Group>
                <Button variant="default" leftSection={<IconPlayerPlay size={16} />} onClick={() => runNow()}>
                  Run now
                </Button>
                <Menu position="bottom-end" shadow="md">
                  <Menu.Target>
                    <Button variant="default" px={8} aria-label="More run options">
                      <IconChevronDown size={14} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => runNow()}>Run with latest / sample data</Menu.Item>
                    <Menu.Item onClick={() => setCustomRun(true)}>Run with custom input…</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Button.Group>
            )}
            {!readOnly && (
              <Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => save()} loading={saving} disabled={!dirty}>
                Save
              </Button>
            )}
          </Group>
        </Group>

        <Tabs value={tab} onChange={setTab} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="builder" leftSection={<IconTopologyStar3 size={14} />}>
              Builder
              {errorCount > 0 && (
                <Badge ml={6} size="xs" color="red" variant="filled" circle>
                  {errorCount}
                </Badge>
              )}
            </Tabs.Tab>
            <Tabs.Tab value="runs" leftSection={<IconHistory size={14} />}>
              Runs
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="builder" pt="md">
            {showErrors && !errors.ok && (
              <Alert color="red" variant="light" mb="md" withCloseButton onClose={() => setShowErrors(false)} title="A few things need attention">
                <Text size="sm">Steps with a red badge aren&apos;t fully set up. Select them to see what&apos;s missing.{errors.general.length ? ` ${errors.general.join(". ")}.` : ""}</Text>
              </Alert>
            )}
            <Box className={classes.grid}>
              <div className={classes.canvas}>
                <ReactFlowProvider>
                  <Canvas trigger={trigger} steps={steps} errors={errors} selected={selected} onSelect={setSelected} lookup={lookup} />
                </ReactFlowProvider>
              </div>
              <Card withBorder radius="lg" padding="md" className={classes.panel}>
                {selected === "trigger" || !selectedStep ? (
                  <TriggerConfig workflow={wf} trigger={trigger} onChange={edit(setTrigger)} errors={errors.trigger} refs={refs} readOnly={readOnly} />
                ) : (
                  <StepConfig
                    key={selectedStep.id}
                    step={selectedStep}
                    index={selectedIndex}
                    trigger={trigger}
                    steps={steps}
                    onChange={(s) => edit(setSteps)(steps.map((x) => (x.id === s.id ? s : x)))}
                    onDelete={() => removeStep(selectedStep.id)}
                    errors={errors.steps[selectedStep.id] ?? []}
                    refs={refs}
                    readOnly={readOnly}
                  />
                )}
              </Card>
            </Box>
            <Text size="xs" c="dimmed" mt="xs">
              Each run costs 1 credit, no matter how many actions it has. Click a block to configure it; use + to insert an action.
            </Text>
          </Tabs.Panel>

          <Tabs.Panel value="runs" pt="md">
            <RunsPanel workflowId={workflowId} steps={steps} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
      <CustomRunModal opened={customRun} onClose={() => setCustomRun(false)} onRun={(input) => runNow(input)} />
    </CanvasCtx.Provider>
  );
}

function CustomRunModal({ opened, onClose, onRun }: { opened: boolean; onClose: () => void; onRun: (input: Record<string, unknown>) => void }) {
  const [value, setValue] = useState('{\n  "title": "Test title",\n  "text": "Hello, what is the price?",\n  "authorName": "Jamie"\n}');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      setError(null);
      onRun(parsed as Record<string, unknown>);
      onClose();
    } catch {
      setError("Enter a JSON object, e.g. {\"title\": \"…\"}");
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} centered title={<Text fw={600}>Run with custom input</Text>}>
      <Stack>
        <Text size="sm" c="dimmed">
          These fields become the trigger variables for this test run (e.g. <code>{"{{trigger.title}}"}</code>).
        </Text>
        <Textarea value={value} onChange={(e) => setValue(e.currentTarget.value)} autosize minRows={6} styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }} error={error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={submit}>
            Run
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
