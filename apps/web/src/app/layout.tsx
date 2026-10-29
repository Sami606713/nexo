import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const APP = process.env.APP_NAME ?? "Nexo";

export const metadata: Metadata = {
  title: { default: `${APP} | Free AI social media management`, template: `%s | ${APP}` },
  description: "Plan, write, design and publish social media posts with AI. One calendar for every channel, free for everyone.",
  metadataBase: new URL(
    process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps} className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <Providers>{children}</Providers>
        {/* Cookieless page-view analytics; only sends data on Vercel deployments. */}
        <Analytics />
      </body>
    </html>
  );
}
