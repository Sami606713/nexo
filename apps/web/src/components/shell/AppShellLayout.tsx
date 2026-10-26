"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ActionIcon,
  AppShell,
  Badge,
  Avatar,
  Box,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import useSWR from "swr";
import {
  IconBrush,
  IconBuildingStore,
  IconChartBar,
  IconInbox,
  IconLink,
  IconRocket,
  IconTopologyStar3,
  IconSpeakerphone,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconCreditCard,
  IconHash,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPlug,
  IconPlus,
  IconSelector,
  IconSettings,
  IconSparkles,
  IconSun,
  IconTag,
  IconUsers,
} from "@tabler/icons-react";
import type { Role } from "@postline/core";
import { Logo } from "@/components/ui/Logo";
import { BrandProvider, useBrand, type BrandContextValue } from "./BrandContext";
import { CreditsWidget } from "./CreditsWidget";
import { LAST_BRAND_COOKIE } from "./constants";

export interface ShellProps {
  brand: { id: string; name: string; timezone: string; weekStart: number };
  role: Role;
  user: BrandContextValue["user"];
  brands: { id: string; name: string; role: Role }[];
  children: ReactNode;
}

export function AppShellLayout({ brand, role, user, brands, children }: ShellProps) {
  return (
    <BrandProvider brand={brand} role={role} user={user}>
      <Shell brands={brands}>{children}</Shell>
    </BrandProvider>
  );
}

const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Shell({ brands, children }: { brands: ShellProps["brands"]; children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const b = useBrand();

  useEffect(() => close(), [pathname, close]);
  useEffect(() => {
    document.cookie = `${LAST_BRAND_COOKIE}=${b.brandId}; path=/; max-age=31536000; samesite=lax`;
  }, [b.brandId]);

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{ width: 264, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding={{ base: "md", sm: "xl" }}
    >
      <AppShell.Header hiddenFrom="sm" px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} size="sm" aria-label="Toggle navigation" />
            <Logo size="sm" />
          </Group>
          <Text size="sm" fw={600} truncate maw={160}>
            {b.name}
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Box visibleFrom="sm" mb="md">
            <Logo />
          </Box>
          <BrandSwitcher brands={brands} />
          <CreateNewMenu />
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} mt="md" mx="-xs" px="xs">
          <MainNav />
        </AppShell.Section>
        <AppShell.Section>
          <Stack gap="sm">
            <CreditsWidget brandId={b.brandId} canBilling={b.can("billing.manage")} />
            <AccountMenu />
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Box maw={1280} mx="auto">
          {children}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

function BrandSwitcher({ brands }: { brands: ShellProps["brands"] }) {
  const b = useBrand();
  const router = useRouter();
  return (
    <Menu width="target" position="bottom-start" shadow="md">
      <Menu.Target>
        <UnstyledButton
          w="100%"
          p="xs"
          style={{ borderRadius: "var(--mantine-radius-md)", border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Group gap="sm" wrap="nowrap">
            <Avatar color="indigo" radius="md" size={32}>
              {initials(b.name)}
            </Avatar>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {b.name}
              </Text>
              <Text size="xs" c="dimmed">
                {b.role.charAt(0) + b.role.slice(1).toLowerCase()}
              </Text>
            </Box>
            <IconSelector size={16} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Brands</Menu.Label>
        <ScrollArea.Autosize mah={280}>
          {brands.map((x) => (
            <Menu.Item
              key={x.id}
              leftSection={
                <Avatar size={22} radius="sm" color="indigo">
                  {initials(x.name)}
                </Avatar>
              }
              rightSection={x.id === b.brandId ? <IconCheck size={14} /> : null}
              onClick={() => router.push(`/app/${x.id}/planner`)}
            >
              <Text size="sm" truncate maw={150}>
                {x.name}
              </Text>
            </Menu.Item>
          ))}
        </ScrollArea.Autosize>
        <Menu.Divider />
        <Menu.Item leftSection={<IconPlus size={16} />} onClick={() => router.push("/onboarding")}>
          Create brand
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function CreateNewMenu() {
  const b = useBrand();
  const router = useRouter();
  if (!b.can("posts.write")) return null;
  return (
    <Menu width="target" position="bottom-start" shadow="md">
      <Menu.Target>
        <Button fullWidth mt="sm" leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={14} />}>
          Create new
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => router.push(`/app/${b.brandId}/posts/new`)}>
          Write a post
        </Menu.Item>
        <Menu.Item leftSection={<IconSparkles size={16} />} onClick={() => router.push(`/app/${b.brandId}/posts/ai`)}>
          Post with AI
        </Menu.Item>
        <Menu.Item leftSection={<IconRocket size={16} />} onClick={() => router.push(`/app/${b.brandId}/campaigns/new`)}>
          Campaign with AI
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconBrush size={16} />} onClick={() => router.push(`/app/${b.brandId}/studio`)}>
          Design in Studio
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function MainNav() {
  const b = useBrand();
  const pathname = usePathname();
  const base = `/app/${b.brandId}`;
  const active = (p: string) => pathname === `${base}${p}` || pathname.startsWith(`${base}${p}/`);
  const link = (href: string, label: string, icon: ReactNode, right?: ReactNode) => (
    <NavLink
      key={href}
      component={Link}
      href={`${base}${href}`}
      label={label}
      leftSection={icon}
      rightSection={right}
      active={active(href)}
      style={{ borderRadius: 8 }}
    />
  );
  const settings = [
    b.can("members.manage") || b.can("posts.approve") ? { href: "/settings/team", label: "Team", icon: <IconUsers size={16} /> } : null,
    // Nexo is free: no Billing page in the navigation (the route still exists for usage/credits history).
    { href: "/settings/labels", label: "Labels", icon: <IconTag size={16} /> },
    { href: "/settings/hashtags", label: "Hashtags", icon: <IconHash size={16} /> },
  ].filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <Stack gap={2}>
      {link("/planner", "Planner", <IconCalendarEvent size={18} />)}
      {link("/campaigns", "Campaigns", <IconSpeakerphone size={18} />)}
      {link("/studio", "Studio", <IconBrush size={18} />)}
      {link("/inbox", "Inbox", <IconInbox size={18} />, <InboxBadge brandId={b.brandId} />)}
      {link("/workflows", "Workflows", <IconTopologyStar3 size={18} />)}
      {link("/analytics", "Analytics", <IconChartBar size={18} />)}
      {link("/bio", "Bio pages", <IconLink size={18} />)}
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="sm" mt="sm" mb={2} style={{ letterSpacing: 0.4 }}>
        Workspace
      </Text>
      {link("/channels", "Channels", <IconPlug size={18} />)}
      {link("/brand", "Brand", <IconBuildingStore size={18} />)}
      <NavLink
        label="Settings"
        leftSection={<IconSettings size={18} />}
        defaultOpened={active("/settings")}
        childrenOffset={28}
        style={{ borderRadius: 8 }}
      >
        {settings.map((s) => (
          <NavLink
            key={s.href}
            component={Link}
            href={`${base}${s.href}`}
            label={s.label}
            leftSection={s.icon}
            active={active(s.href)}
            style={{ borderRadius: 8 }}
          />
        ))}
      </NavLink>
    </Stack>
  );
}

/** Open conversations count. Tolerates the inbox API not existing yet (any error → no badge). */
function InboxBadge({ brandId }: { brandId: string }) {
  const { data } = useSWR<unknown>(`/api/brands/${brandId}/conversations?status=OPEN`, {
    refreshInterval: 60_000,
    shouldRetryOnError: false,
  });
  let count = 0;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.unread === "number") count = d.unread;
    else if (typeof d.unreadCount === "number") count = d.unreadCount;
    else {
      const list = Array.isArray(data) ? data : Array.isArray(d.conversations) ? d.conversations : Array.isArray(d.items) ? d.items : null;
      if (list) count = list.filter((c) => !!c && typeof c === "object" && (c as { unread?: boolean }).unread !== false).length;
      else if (typeof d.total === "number") count = d.total;
    }
  }
  if (!count) return null;
  return (
    <Badge size="sm" variant="filled" color="red" radius="xl" miw={22}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

/** Sun in dark mode, moon in light mode — both rendered, one hidden by CSS. */
function SchemeIcon() {
  return (
    <>
      <Box component="span" lightHidden h={16}>
        <IconSun size={16} />
      </Box>
      <Box component="span" darkHidden h={16}>
        <IconMoon size={16} />
      </Box>
    </>
  );
}

function AccountMenu() {
  const b = useBrand();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  // Read the scheme only in the click handler; markup stays identical on server and client (no hydration mismatch).
  const toggleScheme = () => setColorScheme(scheme === "dark" ? "light" : "dark");
  const display = b.user.name || b.user.email;
  return (
    <Group gap="xs" wrap="nowrap">
      <Menu position="top-start" shadow="md" width={240}>
        <Menu.Target>
          <UnstyledButton style={{ flex: 1, minWidth: 0, borderRadius: 8 }} p={4}>
            <Group gap="sm" wrap="nowrap">
              <Avatar src={b.user.image} radius="xl" size={32} color="violet">
                {initials(display)}
              </Avatar>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {display}
                </Text>
                {b.user.name && (
                  <Text size="xs" c="dimmed" truncate>
                    {b.user.email}
                  </Text>
                )}
              </Box>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{b.user.email}</Menu.Label>
          <Menu.Item leftSection={<SchemeIcon />} onClick={toggleScheme}>
            <Box component="span" darkHidden>
              Dark mode
            </Box>
            <Box component="span" lightHidden>
              Light mode
            </Box>
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label="Toggle color scheme"
        onClick={toggleScheme}
      >
        <SchemeIcon />
      </ActionIcon>
    </Group>
  );
}
