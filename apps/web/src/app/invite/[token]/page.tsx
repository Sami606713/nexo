import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/session";
import { findValidInvite } from "@/lib/invites";
import { AuthLayout } from "@/components/ui/AuthLayout";
import { AcceptInvite } from "@/components/team/AcceptInvite";
import { SignOutButton } from "@/components/ui/SignOutButton";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ invite, reason }, user] = await Promise.all([findValidInvite(token), getCurrentUser()]);

  if (!invite || reason)
    return (
      <AuthLayout title="Invitation unavailable">
        <Stack>
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />}>
            {reason}
          </Alert>
          <Button component="a" href="/app" variant="light">
            Go to the app
          </Button>
        </Stack>
      </AuthLayout>
    );

  const here = `/invite/${token}`;
  const role = invite.role.charAt(0) + invite.role.slice(1).toLowerCase();
  return (
    <AuthLayout title={`Join ${invite.brand.name}`} subtitle={`You've been invited to collaborate as ${role}.`}>
      {user ? (
        user.email.toLowerCase() === invite.email.toLowerCase() ? (
          <Stack>
            <Text size="sm" c="dimmed">
              Signed in as {user.email}
            </Text>
            <AcceptInvite token={token} brandName={invite.brand.name} />
          </Stack>
        ) : (
          <Stack>
            <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />}>
              This invitation was sent to <b>{invite.email}</b>, but you're signed in as {user.email}. Sign out and sign in with the
              invited email.
            </Alert>
            <SignOutButton variant="light" callbackUrl={`/login?callbackUrl=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}>
              Switch account
            </SignOutButton>
          </Stack>
        )
      ) : (
        <Stack>
          <Text size="sm" c="dimmed">
            Sign in or create an account with <b>{invite.email}</b> to accept.
          </Text>
          <Group grow>
            <Button component="a" href={`/signup?callbackUrl=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}>
              Create account
            </Button>
            <Button
              component="a"
              variant="default"
              href={`/login?callbackUrl=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}
            >
              Sign in
            </Button>
          </Group>
        </Stack>
      )}
    </AuthLayout>
  );
}
