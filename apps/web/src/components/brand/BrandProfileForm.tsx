"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  ColorSwatch,
  Grid,
  Group,
  Modal,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconInfoCircle, IconPhoto, IconPlus, IconSparkles, IconTrash, IconWorld } from "@tabler/icons-react";
import type { BrandFetchResult } from "@postline/core";
import { api } from "@/lib/fetcher";
import { useBrand } from "@/components/shell/BrandContext";
import { creditsKey } from "@/components/shell/CreditsWidget";
import { PageHeader } from "@/components/ui/PageHeader";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { allTimezones, normalizeUrl } from "./timezones";

export interface BrandFormValues {
  name: string;
  website: string;
  description: string;
  voice: string;
  audience: string;
  avoid: string;
  colors: string[];
  logos: string[];
  timezone: string;
  weekStart: string;
}

type FetchField = "name" | "description" | "voice" | "audience" | "colors" | "logos";

function completeness(v: BrandFormValues) {
  const checks = [
    !!v.name.trim(),
    !!v.website.trim(),
    v.description.trim().length >= 20,
    !!v.voice.trim(),
    !!v.audience.trim(),
    v.colors.some(Boolean),
    v.logos.some((l) => l.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function BrandProfileForm({ initial }: { initial: BrandFormValues }) {
  const b = useBrand();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const editable = b.can("brand.settings");
  const timezones = useMemo(() => allTimezones(), []);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [suggestion, setSuggestion] = useState<BrandFetchResult | null>(null);

  const form = useForm<BrandFormValues>({
    initialValues: initial,
    validate: (v) => {
      const errors: Record<string, string> = {};
      if (!v.name.trim()) errors.name = "Name is required";
      if (v.website.trim()) {
        try {
          new URL(normalizeUrl(v.website)!);
        } catch {
          errors.website = "Enter a valid URL";
        }
      }
      v.logos.forEach((l, i) => {
        if (l.trim() && !/^https?:\/\/\S+$/.test(l.trim())) errors[`logos.${i}`] = "Must be an http(s) URL";
      });
      return errors;
    },
  });
  const score = completeness(form.values);

  const save = form.onSubmit(async (v) => {
    setSaving(true);
    try {
      await api(`/api/brands/${b.brandId}`, "PATCH", {
        name: v.name.trim(),
        website: normalizeUrl(v.website),
        description: v.description.trim() || null,
        voice: v.voice.trim() || null,
        audience: v.audience.trim() || null,
        avoid: v.avoid.trim() || null,
        colors: v.colors.filter(Boolean),
        logos: v.logos.map((l) => l.trim()).filter(Boolean).map((url) => ({ url })),
        timezone: v.timezone,
        weekStart: Number(v.weekStart),
      });
      form.resetDirty();
      notifySuccess("Brand profile saved");
      router.refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  });

  const fetchBrand = async () => {
    const website = normalizeUrl(form.values.website);
    if (!website) {
      form.setFieldError("website", "Add your website first");
      return;
    }
    setFetching(true);
    try {
      const r = await api<BrandFetchResult>(`/api/brands/${b.brandId}/fetch-brand`, "POST", { website });
      setSuggestion(r);
    } catch (e) {
      notifyError(e, "Couldn't read your website");
    } finally {
      setFetching(false);
      void mutate(creditsKey(b.brandId));
    }
  };

  const applySuggestion = (fields: FetchField[]) => {
    if (!suggestion) return;
    for (const f of fields) {
      if (f === "colors") form.setFieldValue("colors", Array.from(new Set([...form.values.colors.filter(Boolean), ...suggestion.colors])));
      else if (f === "logos") form.setFieldValue("logos", Array.from(new Set([...form.values.logos.filter(Boolean), ...suggestion.logoUrls])));
      else if (suggestion[f]) form.setFieldValue(f, suggestion[f]!);
    }
    setSuggestion(null);
    notifySuccess("Suggestions applied — review and save.");
  };

  return (
    <form onSubmit={save}>
      <PageHeader
        title={
          <Group gap="sm">
            Brand profile
            <Badge size="lg" variant="light" color={score >= 85 ? "teal" : score >= 50 ? "yellow" : "orange"}>
              {score}% complete
            </Badge>
          </Group>
        }
        description="The AI uses this profile to write posts in your brand's voice."
        actions={
          editable && (
            <Button type="submit" loading={saving} disabled={!form.isDirty()}>
              Save changes
            </Button>
          )
        }
      />
      <Progress value={score} size="xs" mb="xl" color={score >= 85 ? "teal" : score >= 50 ? "yellow" : "orange"} />
      {!editable && (
        <Alert icon={<IconInfoCircle size={18} />} variant="light" mb="lg">
          Only owners and admins can edit the brand profile.
        </Alert>
      )}
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder radius="lg" padding="lg">
              <Stack>
                <Title order={5}>Basics</Title>
                <TextInput label="Brand name" withAsterisk {...form.getInputProps("name")} />
                <Group align="flex-end" gap="sm" wrap="nowrap">
                  <TextInput style={{ flex: 1 }} label="Website" placeholder="acme.com" leftSection={<IconWorld size={16} />} {...form.getInputProps("website")} />
                  {editable && (
                    <Tooltip label="Read your website with AI and suggest a profile (1 credit)">
                      <Button variant="light" leftSection={<IconSparkles size={16} />} loading={fetching} onClick={fetchBrand}>
                        Fetch brand
                      </Button>
                    </Tooltip>
                  )}
                </Group>
                <Textarea label="Description" description="What the business does, products, positioning." autosize minRows={3} maxRows={8} {...form.getInputProps("description")} />
              </Stack>
            </Card>
            <Card withBorder radius="lg" padding="lg" mt="lg">
              <Stack>
                <Title order={5}>Voice & audience</Title>
                <Textarea label="Brand voice" description="Tone and style, e.g. “Friendly, concise, a little playful. No jargon.”" autosize minRows={2} maxRows={6} {...form.getInputProps("voice")} />
                <Textarea label="Target audience" description="Who you're talking to." autosize minRows={2} maxRows={6} {...form.getInputProps("audience")} />
                <Textarea label="Words & topics to avoid" description="The AI will steer clear of these." autosize minRows={2} maxRows={6} {...form.getInputProps("avoid")} />
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder radius="lg" padding="lg">
              <Stack>
                <Title order={5}>Scheduling</Title>
                <Select label="Timezone" searchable data={timezones} allowDeselect={false} {...form.getInputProps("timezone")} />
                <Select
                  label="Week starts on"
                  allowDeselect={false}
                  data={[
                    { value: "1", label: "Monday" },
                    { value: "0", label: "Sunday" },
                    { value: "6", label: "Saturday" },
                  ]}
                  {...form.getInputProps("weekStart")}
                />
              </Stack>
            </Card>
            <Card withBorder radius="lg" padding="lg" mt="lg">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>Brand colors</Title>
                  {editable && (
                    <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => form.insertListItem("colors", "#4C6EF5")}>
                      Add
                    </Button>
                  )}
                </Group>
                {form.values.colors.length === 0 && (
                  <Text size="sm" c="dimmed">
                    No colors yet.
                  </Text>
                )}
                {form.values.colors.map((_, i) => (
                  <Group key={i} gap="xs" wrap="nowrap">
                    <ColorInput style={{ flex: 1 }} format="hex" {...form.getInputProps(`colors.${i}`)} />
                    {editable && (
                      <ActionIcon variant="subtle" color="red" onClick={() => form.removeListItem("colors", i)} aria-label="Remove color">
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
              </Stack>
            </Card>
            <Card withBorder radius="lg" padding="lg" mt="lg">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>Logos</Title>
                  {editable && (
                    <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => form.insertListItem("logos", "")}>
                      Add URL
                    </Button>
                  )}
                </Group>
                {form.values.logos.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Add a public image URL of your logo.
                  </Text>
                )}
                {form.values.logos.map((url, i) => (
                  <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
                    <Avatar src={url || null} radius="sm" size={36}>
                      <IconPhoto size={18} />
                    </Avatar>
                    <TextInput style={{ flex: 1 }} placeholder="https://…/logo.png" {...form.getInputProps(`logos.${i}`)} />
                    {editable && (
                      <ActionIcon variant="subtle" color="red" mt={4} onClick={() => form.removeListItem("logos", i)} aria-label="Remove logo">
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </fieldset>
      <SuggestionModal suggestion={suggestion} onClose={() => setSuggestion(null)} onApply={applySuggestion} />
    </form>
  );
}

function SuggestionModal({ suggestion, onClose, onApply }: { suggestion: BrandFetchResult | null; onClose: () => void; onApply: (f: FetchField[]) => void }) {
  type Row = { key: FetchField; label: string; value: React.ReactNode; present: boolean };
  const rows: Row[] = suggestion
    ? ([
        { key: "name", label: "Name", value: suggestion.name, present: !!suggestion.name },
        { key: "description", label: "Description", value: suggestion.description, present: !!suggestion.description },
        { key: "voice", label: "Voice", value: suggestion.voice, present: !!suggestion.voice },
        { key: "audience", label: "Audience", value: suggestion.audience, present: !!suggestion.audience },
        {
          key: "colors",
          label: "Colors",
          value: (
            <Group gap={6}>
              {suggestion.colors.map((c) => (
                <ColorSwatch key={c} color={c} size={20} />
              ))}
            </Group>
          ),
          present: suggestion.colors.length > 0,
        },
        {
          key: "logos",
          label: "Logos",
          value: (
            <Group gap={6}>
              {suggestion.logoUrls.map((u) => (
                <Avatar key={u} src={u} radius="sm" size={32} />
              ))}
            </Group>
          ),
          present: suggestion.logoUrls.length > 0,
        },
      ] satisfies Row[]).filter((r) => r.present)
    : [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const value = picked ?? rows.map((r) => r.key);
  return (
    <Modal
      opened={!!suggestion}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      title={
        <Group gap="xs">
          <IconSparkles size={18} />
          <Text fw={600}>Suggestions from your website</Text>
        </Group>
      }
      size="lg"
      centered
    >
      {rows.length === 0 ? (
        <Text c="dimmed">We couldn&apos;t extract anything useful from that website.</Text>
      ) : (
        <Stack>
          <Checkbox.Group value={value} onChange={setPicked}>
            <Stack gap="xs">
              {rows.map((r) => (
                <Checkbox.Card key={r.key} value={r.key} withBorder radius="md" p="sm">
                  <Group wrap="nowrap" align="flex-start">
                    <Checkbox.Indicator mt={2} />
                    <div style={{ minWidth: 0 }}>
                      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                        {r.label}
                      </Text>
                      {typeof r.value === "string" ? <Text size="sm">{r.value}</Text> : r.value}
                    </div>
                  </Group>
                </Checkbox.Card>
              ))}
            </Stack>
          </Checkbox.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!value.length}
              onClick={() => {
                onApply(value as FetchField[]);
                setPicked(null);
              }}
            >
              Apply selected
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
