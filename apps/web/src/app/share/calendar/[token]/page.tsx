import type { Metadata } from "next";
import { SharedCalendar } from "@/components/planner/SharedCalendar";

export const metadata: Metadata = { title: "Shared calendar", robots: { index: false, follow: false } };

export default async function SharedCalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedCalendar token={token} />;
}
