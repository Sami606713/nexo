"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Alert, Anchor, Button, Divider, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconBrandGoogle } from "@tabler/icons-react";
import { api } from "@/lib/fetcher";

export function SignupForm({ callbackUrl, googleEnabled, defaultEmail }: { callbackUrl: string; googleEnabled: boolean; defaultEmail?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { name: "", email: defaultEmail ?? "", password: "" },
    validate: {
      name: (v) => (v.trim() ? null : "Enter your name"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      password: (v) => (v.length >= 8 ? null : "At least 8 characters"),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      await api("/api/signup", "POST", values);
      const res = await signIn("credentials", { email: values.email, password: values.password, redirect: false });
      if (!res || res.error) throw new Error("Account created, but sign-in failed. Try signing in.");
      window.location.href = callbackUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  });

  return (
    <Stack gap="md">
      {googleEnabled && (
        <>
          <Button variant="default" leftSection={<IconBrandGoogle size={18} />} onClick={() => signIn("google", { callbackUrl })} fullWidth>
            Sign up with Google
          </Button>
          <Divider label="or" labelPosition="center" />
        </>
      )}
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput label="Full name" placeholder="Amara Okafor" autoComplete="name" {...form.getInputProps("name")} />
          <TextInput label="Work email" placeholder="you@company.com" autoComplete="email" {...form.getInputProps("email")} />
          <PasswordInput label="Password" placeholder="At least 8 characters" autoComplete="new-password" {...form.getInputProps("password")} />
          <Button type="submit" loading={loading} fullWidth mt="xs">
            Create account
          </Button>
        </Stack>
      </form>
      <Text size="sm" ta="center" c="dimmed">
        Already have an account?{" "}
        <Anchor component={Link} href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} size="sm">
          Log in
        </Anchor>
      </Text>
    </Stack>
  );
}
