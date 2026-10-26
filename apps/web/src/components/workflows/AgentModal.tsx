"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Divider, Group, Modal, Paper, Select, Stack, Switch, Text, Textarea, TextInput } from "@mantine/core";
import { IconFlask } from "@tabler/icons-react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/fetcher";
import type { AIAgentDTO } from "@/lib/workflows/types";
import { useBrand } from "@/components/shell/BrandContext";
import { notifyError, notifySuccess } from "@/components/ui/notify";

export interface AgentModelsResponse {
  defaultModel: string;
  configured: boolean;
  options: Array<{ value: string; label: string }>;
}

/** Human label for a stored agent model ("default" → the server's configured model). */
export function agentModelLabel(model: string, models?: AgentModelsResponse): string {
  const opt = models?.options.find((o) => o.value === model);
  if (opt) return opt.label.split(" — ")[0]!;
  if (model === "default") return "Default model";
  return model;
}

const SAMPLE_INPUT = "Article: Five small habits that make remote teams faster\n\nAsync updates, clear owners and a weekly demo day help distributed teams ship more with fewer meetings.";

/** Create / edit an AI agent, with an inline "Test" (1 credit). `agent=null` → create. */
export function AgentModal({
  opened,
  agent,
  onClose,
  onSaved,
}: {
  opened: boolean;
  agent: AIAgentDTO | null;
  onClose: () => void;
  onSaved?: (a: AIAgentDTO) => void;
}) {
  const b = useBrand();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const { data: models } = useSWR<AgentModelsResponse>(`/api/brands/${b.brandId}/ai-agents/models`);
  const [model, setModel] = useState("default");
  const [imageGen, setImageGen] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState(SAMPLE_INPUT);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ text: string; offline: boolean } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setName(agent?.name ?? "");
    setPrompt(agent?.prompt ?? "");
    setModel(agent?.model ?? "default");
    setImageGen(agent?.imageGen ?? false);
    setWebSearch(agent?.webSearch ?? false);
    setResult(null);
    setSavedId(agent?.id ?? null);
  }, [opened, agent]);

  const listKey = `/api/brands/${b.brandId}/ai-agents`;
  const save = async (): Promise<AIAgentDTO | null> => {
    if (!name.trim() || !prompt.trim()) {
      notifyError(new Error("Give the agent a name and instructions"));
      return null;
    }
    setSaving(true);
    try {
      const body = { name, prompt, model, imageGen, webSearch };
      const id = savedId;
      const a = id ? await api<AIAgentDTO>(`${listKey}/${id}`, "PATCH", body) : await api<AIAgentDTO>(listKey, "POST", body);
      setSavedId(a.id);
      await mutate(listKey);
      onSaved?.(a);
      return a;
    } catch (e) {
      notifyError(e);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const a = await save();
    if (!a) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await api<{ text: string; offline: boolean }>(`${listKey}/${a.id}/test`, "POST", { input: testInput });
      setResult(r);
      mutate(`/api/brands/${b.brandId}/credits`);
    } catch (e) {
      notifyError(e);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" centered title={<Text fw={600}>{agent ? "Edit AI agent" : "New AI agent"}</Text>}>
      <Stack>
        <TextInput label="Name" placeholder="e.g. Blog-to-LinkedIn writer" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <Textarea
          label="Standing instructions"
          description="How the agent should treat every input it receives. Your brand voice, audience and words to avoid are added automatically."
          placeholder="Summarize the input into a friendly LinkedIn post with a strong first line, three short paragraphs and a question at the end."
          autosize
          minRows={4}
          maxRows={10}
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
        />
        <Select
          label="Model"
          description={models && !models.configured ? "No AI provider is configured — tests and runs use the offline demo writer." : undefined}
          data={(() => {
            const opts = models?.options ?? [{ value: "default", label: "Default model" }];
            // Keep a previously saved model visible even if the provider changed.
            return opts.some((o) => o.value === model) ? opts : [...opts, { value: model, label: `${model} (uses default model with the current provider)` }];
          })()}
          value={model}
          onChange={(v) => v && setModel(v)}
          allowDeselect={false}
        />
        <Group grow>
          <Switch label="Generate images" description="Also create an image for each output" checked={imageGen} onChange={(e) => setImageGen(e.currentTarget.checked)} />
          <Switch label="Web search" description="Look things up while writing (Claude models only)" checked={webSearch} onChange={(e) => setWebSearch(e.currentTarget.checked)} />
        </Group>

        <Divider label="Try it" labelPosition="left" />
        <Textarea label="Test input" autosize minRows={2} maxRows={6} value={testInput} onChange={(e) => setTestInput(e.currentTarget.value)} />
        {result && (
          <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-default-hover)">
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Output
              </Text>
              {result.offline && (
                <Badge size="xs" variant="light" color="gray">
                  Offline demo mode
                </Badge>
              )}
            </Group>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {result.text}
            </Text>
          </Paper>
        )}
        <Group justify="space-between">
          <Button variant="light" leftSection={<IconFlask size={16} />} onClick={test} loading={testing} disabled={!testInput.trim()}>
            Test · 1 credit
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
            <Button
              loading={saving}
              onClick={async () => {
                const a = await save();
                if (a) {
                  notifySuccess(agent ? "Agent updated" : "Agent created");
                  onClose();
                }
              }}
            >
              Save agent
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
