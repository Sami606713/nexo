"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconSparkles, IconWorld } from "@tabler/icons-react";
import type { BrandFetchResult } from "@postline/core";
import { api } from "@/lib/fetcher";
import { notifyError, notifySuccess } from "@/components/ui/notify";
import { allTimezones, browserTimezone, normalizeUrl } from "./timezones";

export function OnboardingForm({ hasBrands }: { hasBrands: boolean }) {
  const router = useRouter();
  const timezones = useMemo(() => allTimezones(), []);
  const [step, setStep] = useState<"idle" | "creating" | "fetching">("idle");
  const form = useForm({
    initialValues: { name: "", website: "", timezone: "UTC", fetch: true },
    validate: {
      name: (v) => (v.trim() ? null : "Give your brand a name"),
      website: (v) => {
        if (!v.trim()) return null;
        try {
          new URL(normalizeUrl(v)!);
          return null;
        } catch {
          return "Enter a valid URL";
        }
      },
    },
  });

  useEffect(() => {
    form.setFieldValue("timezone", browserTimezone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = form.onSubmit(async (v) => {
    const website = normalizeUrl(v.website);
    setStep("creating");
    let brandId: string;
    try {
      const brand = await api<{ id: string }>("/api/brands", "POST", { name: v.name.trim(), website, timezone: v.timezone });
      brandId = brand.id;
    } catch (e) {
      notifyError(e);
      setStep("idle");
      return;
    }
    if (website && v.fetch) {
      setStep("fetching");
      try {
        const r = await api<BrandFetchResult>(`/api/brands/${brandId}/fetch-brand`, "POST", { website });
        await api(`/api/brands/${brandId}`, "PATCH", {
          description: r.description || undefined,
          voice: r.voice || undefined,
          audience: r.audience || undefined,
          colors: r.colors?.length ? r.colors : undefined,
          logos: r.logoUrls?.length ? r.logoUrls.map((url) => ({ url })) : undefined,
        });
        notifySuccess("We filled in your brand profile from your website. Review it any time.", "Brand imported");
        router.push(`/app/${brandId}/brand`);
        return;
      } catch (e) {
        notifyError(e, "Couldn't fetch your website — you can fill the profile in manually.");
      }
    }
    router.push(`/app/${brandId}/channels`);
  });

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput label="Brand name" placeholder="Acme Coffee" data-autofocus {...form.getInputProps("name")} />
        <TextInput label="Website" placeholder="acme.com" leftSection={<IconWorld size={16} />} {...form.getInputProps("website")} />
        {form.values.website.trim() && (
          <Checkbox
            label={
              <Group gap={4}>
                <IconSparkles size={14} />
                <Text size="sm">Fetch brand voice, colors & logo from the website (1 AI credit)</Text>
              </Group>
            }
            {...form.getInputProps("fetch", { type: "checkbox" })}
          />
        )}
        <Select label="Timezone" description="Posts are scheduled in this timezone" searchable data={timezones} allowDeselect={false} {...form.getInputProps("timezone")} />
        <Button type="submit" size="md" loading={step !== "idle"} mt="xs">
          {step === "fetching" ? "Reading your website…" : "Create brand"}
        </Button>
        {hasBrands && (
          <Button variant="subtle" color="gray" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
      </Stack>
    </form>
  );
}
