"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Alert, Anchor, Button, Divider, PasswordInput, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconBrandGoogle, IconMailCheck } from "@tabler/icons-react";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "Wrong email or password.",
  Verification: "That sign-in link is invalid or has expired. Request a new one.",
  OAuthAccountNotLinked: "This email is already linked to another sign-in method.",
  AccessDenied: "Access denied.",
};

export function LoginForm({
  callbackUrl,
  googleEnabled,
  initialError,
  checkEmail,
  defaultEmail,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  initialError?: string;
  checkEmail?: boolean;
  defaultEmail?: string;
}) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? (ERRORS[initialError] ?? "Sign in failed. Please try again.") : null);
  const [sentTo, setSentTo] = useState<string | null>(checkEmail ? "your inbox" : null);

  const form = useForm({
    initialValues: { email: defaultEmail ?? "", password: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      password: (v) => (mode === "password" && !v ? "Enter your password" : null),
    },
  });

  const submit = form.onSubmit(async ({ email, password }) => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "password") {
        const res = await signIn("credentials", { email, password, redirect: false });
        if (!res || res.error) {
          setError(ERRORS.CredentialsSignin!);
          return;
        }
        window.location.href = callbackUrl;
      } else {
        const res = await signIn("nodemailer", { email, redirect: false, callbackUrl });
        if (res?.error) {
          setError("Couldn't send the sign-in link. Please try again.");
          return;
        }
        setSentTo(email);
      }
    } finally {
      setLoading(false);
    }
  });

  if (sentTo)
    return (
      <Stack align="center" ta="center" gap="sm">
        <IconMailCheck size={48} color="var(--mantine-color-teal-6)" />
        <Text fw={600}>Check your email</Text>
        <Text size="sm" c="dimmed">
          We sent a sign-in link to {sentTo}. In development the link is printed in the server console.
        </Text>
        <Anchor size="sm" onClick={() => setSentTo(null)}>
          Use a different email
        </Anchor>
      </Stack>
    );

  return (
    <Stack gap="md">
      {googleEnabled && (
        <>
          <Button variant="default" leftSection={<IconBrandGoogle size={18} />} onClick={() => signIn("google", { callbackUrl })} fullWidth>
            Continue with Google
          </Button>
          <Divider label="or" labelPosition="center" />
        </>
      )}
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(v) => {
          setMode(v as "password" | "link");
          setError(null);
        }}
        data={[
          { label: "Password", value: "password" },
          { label: "Email me a link", value: "link" },
        ]}
      />
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput label="Email" placeholder="you@company.com" autoComplete="email" {...form.getInputProps("email")} />
          {mode === "password" && (
            <PasswordInput label="Password" placeholder="Your password" autoComplete="current-password" {...form.getInputProps("password")} />
          )}
          <Button type="submit" loading={loading} fullWidth mt="xs">
            {mode === "password" ? "Sign in" : "Send sign-in link"}
          </Button>
        </Stack>
      </form>
      <Text size="sm" ta="center" c="dimmed">
        No account?{" "}
        <Anchor component={Link} href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} size="sm">
          Create one
        </Anchor>
      </Text>
    </Stack>
  );
}
