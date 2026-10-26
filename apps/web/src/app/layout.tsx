import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: process.env.APP_NAME ?? "Postline",
  description: "AI-powered social media management",
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
