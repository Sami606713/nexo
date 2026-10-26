"use client";

import type { ReactNode } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/ui/NavigationProgress";

const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  headings: { fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif", fontWeight: "700" },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-right" />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>{children}</SWRConfig>
      </ModalsProvider>
    </MantineProvider>
  );
}
