"use client";

import { useState } from "react";
import { Alert, Anchor, Button, Card, Container, Select, SimpleGrid, Stack, Text, TextInput, Textarea, ThemeIcon, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconBulb, IconCheck, IconHeartHandshake, IconMail, IconShieldLock } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/fetcher";
import { APP_NAME } from "./content";
import type { LegalDoc } from "./legal";
import { CtaBand, PageHeader, Section, SectionTitle } from "./sections";

/* ───────────── About ───────────── */

const VALUES = [
  { icon: IconBulb, title: "Simple beats clever", body: "Social media is already noisy. The tool you use for it shouldn't be." },
  { icon: IconHeartHandshake, title: "Your voice, not ours", body: "AI should sound like you. Everything we generate starts from your brand profile." },
  { icon: IconShieldLock, title: "Your accounts, your data", body: "You sign in with each network directly, approve exactly what we can do, and can disconnect any time." },
];

export function AboutContent() {
  return (
    <>
      <PageHeader eyebrow="About" title={`Why we're building ${APP_NAME}`} />
      <Section>
        <Stack gap="lg" maw={760} mx="auto">
          <Text fz="lg">
            Small teams spend hours every week writing captions, resizing images and copying the same post into five different apps. Agencies do it for
            dozens of clients at once.
          </Text>
          <Text fz="lg">
            {APP_NAME} brings it into one place: an AI writer that knows your brand, a calendar for every channel, a design studio, an inbox and
            automations — so you can spend your time on ideas instead of logistics.
          </Text>
        </Stack>
      </Section>
      <Section tinted>
        <SectionTitle title="What we believe" />
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          {VALUES.map((v) => (
            <Card key={v.title} withBorder radius="lg" p="xl">
              <ThemeIcon size={44} radius="md" variant="light" color="indigo" mb="md">
                <v.icon size={24} />
              </ThemeIcon>
              <Text fw={700} fz="lg" mb={6}>
                {v.title}
              </Text>
              <Text c="dimmed" size="sm">
                {v.body}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Section>
      <CtaBand />
    </>
  );
}

/* ───────────── Contact ───────────── */

export function ContactContent() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: { name: "", email: "", topic: "General question", message: "" },
    validate: {
      name: (v) => (v.trim() ? null : "Please enter your name"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      message: (v) => (v.trim().length >= 10 ? null : "Tell us a little more (at least 10 characters)"),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      await api("/api/contact", "POST", values);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send your message. Please try again.");
    } finally {
      setLoading(false);
    }
  });

  return (
    <>
      <PageHeader eyebrow="Contact" title="Get in touch" subtitle="Questions, feedback, partnerships or Enterprise plans — we read every message." />
      <Container size="sm" pb={40}>
        <Card withBorder radius="lg" p={{ base: "lg", sm: "xl" }}>
          {sent ? (
            <Stack align="center" ta="center" py="xl" gap="sm">
              <ThemeIcon size={56} radius="xl" color="teal" variant="light">
                <IconCheck size={30} />
              </ThemeIcon>
              <Title order={3}>Thanks — message received</Title>
              <Text c="dimmed">We'll get back to you at {form.values.email}.</Text>
            </Stack>
          ) : (
            <form onSubmit={submit}>
              <Stack gap="md">
                {error && <Alert color="red">{error}</Alert>}
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput label="Name" autoComplete="name" {...form.getInputProps("name")} />
                  <TextInput label="Email" type="email" autoComplete="email" {...form.getInputProps("email")} />
                </SimpleGrid>
                <Select
                  label="Topic"
                  allowDeselect={false}
                  data={["General question", "Sales / Enterprise", "Support", "Partnerships", "Feedback"]}
                  {...form.getInputProps("topic")}
                />
                <Textarea label="Message" autosize minRows={5} maxLength={5000} {...form.getInputProps("message")} />
                <Button type="submit" loading={loading} radius="xl" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
                  Send message
                </Button>
              </Stack>
            </form>
          )}
        </Card>
        <Text ta="center" size="sm" c="dimmed" mt="lg">
          <IconMail size={14} style={{ verticalAlign: -2 }} /> Prefer email?{" "}
          <Anchor href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com"}`}>
            {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com"}
          </Anchor>
        </Text>
      </Container>
    </>
  );
}

/* ───────────── Legal ───────────── */

export function LegalContent({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <PageHeader title={doc.title} subtitle={`Last updated ${doc.updated}`} />
      <Container size="sm" pb={40}>
        <Stack gap="xl">
          {doc.intro && <Text>{doc.intro}</Text>}
          {doc.sections.map((s) => (
            <Stack key={s.heading} gap="xs">
              <Title order={3} fz="xl">
                {s.heading}
              </Title>
              {s.body.map((p, i) => (
                <Text key={i} c="dimmed">
                  {p}
                </Text>
              ))}
            </Stack>
          ))}
        </Stack>
      </Container>
    </>
  );
}
