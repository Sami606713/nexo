/**
 * Features that are built but not released yet. Flip the env var to "1" (and restart) to turn one on.
 * NEXT_PUBLIC_ so the navigation (client) and the pages (server) agree.
 */
export const INBOX_RELEASED = process.env.NEXT_PUBLIC_INBOX_ENABLED === "1";
