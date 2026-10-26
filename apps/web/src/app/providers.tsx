"use client";

import type { ReactNode } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-right" />
        <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>{children}</SWRConfig>
      </ModalsProvider>
    </MantineProvider>
  );
}
