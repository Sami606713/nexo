"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Box, Burger, Button, Container, Divider, Drawer, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME, NAV } from "./content";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const actions = signedIn ? (
    <Button component={Link} href="/app" radius="xl">
      Open app
    </Button>
  ) : (
    <>
      <Button component={Link} href="/login" variant="subtle" color="gray" radius="xl">
        Log in
      </Button>
      <Button component={Link} href="/signup" radius="xl" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
        Get started free
      </Button>
    </>
  );

  return (
    <Box
      component="header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "saturate(180%) blur(12px)",
        background: "color-mix(in srgb, var(--mantine-color-body) 82%, transparent)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Container size="lg" h={64}>
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Anchor component={Link} href="/" underline="never" c="inherit" aria-label={`${APP_NAME} home`}>
            <Logo />
          </Anchor>
          <Group gap={4} visibleFrom="sm">
            {NAV.map((n) => (
              <Button
                key={n.href}
                component={Link}
                href={n.href}
                variant={pathname === n.href ? "light" : "subtle"}
                color={pathname === n.href ? "indigo" : "gray"}
                radius="xl"
                size="sm"
              >
                {n.label}
              </Button>
            ))}
          </Group>
          <Group gap="xs" visibleFrom="sm" wrap="nowrap">
            {actions}
          </Group>
          <Burger hiddenFrom="sm" opened={opened} onClick={toggle} aria-label="Toggle navigation" size="sm" />
        </Group>
      </Container>
      <Drawer opened={opened} onClose={close} position="right" size="80%" title={<Logo size="sm" />} hiddenFrom="sm">
        <Stack gap="xs">
          {NAV.map((n) => (
            <Button key={n.href} component={Link} href={n.href} variant="subtle" color="gray" justify="flex-start" onClick={close}>
              {n.label}
            </Button>
          ))}
          <Divider my="sm" />
          <Stack gap="xs" onClick={close}>
            {actions}
          </Stack>
        </Stack>
      </Drawer>
    </Box>
  );
}

const FOOTER = [
  { title: "Product", links: [{ href: "/features", label: "Features" }, { href: "/integrations", label: "Integrations" }, { href: "/pricing", label: "Pricing" }] },
  { title: "Company", links: [{ href: "/about", label: "About" }, { href: "/contact", label: "Contact" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy policy" }, { href: "/terms", label: "Terms of service" }] },
  { title: "Account", links: [{ href: "/login", label: "Log in" }, { href: "/signup", label: "Sign up" }] },
];

export function SiteFooter() {
  return (
    <Box component="footer" mt={80} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
      <Container size="lg" py={48}>
        <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="xl">
          <Stack gap="xs" style={{ gridColumn: "span 1" }}>
            <Logo size="sm" />
            <Text size="sm" c="dimmed" maw={240}>
              AI-powered social media management for creators, teams and agencies.
            </Text>
          </Stack>
          {FOOTER.map((col) => (
            <Stack key={col.title} gap={8}>
              <Text size="sm" fw={700}>
                {col.title}
              </Text>
              {col.links.map((l) => (
                <Anchor key={l.href} component={Link} href={l.href} size="sm" c="dimmed">
                  {l.label}
                </Anchor>
              ))}
            </Stack>
          ))}
        </SimpleGrid>
        <Divider my="xl" />
        <Text size="xs" c="dimmed">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </Text>
      </Container>
    </Box>
  );
}
