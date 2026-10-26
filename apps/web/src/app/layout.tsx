import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Providers } from "./providers";

const APP = process.env.APP_NAME ?? "Nexo";

export const metadata: Metadata = {
  title: { default: `${APP} — AI social media management`, template: `%s · ${APP}` },
  description: "Plan, write, design and publish social media posts with AI — one calendar for every channel.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
