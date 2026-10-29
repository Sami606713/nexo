// Marketing copy for the public site. Keep claims in line with what the product actually does.
// House style: no em-dashes, no invented numbers, one signup label ("Start for free").
import type { Network } from "@postline/core";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Nexo";
export const SIGNUP_LABEL = "Start for free";

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/integrations", label: "Integrations" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export type FeatureIcon = "sparkles" | "calendar" | "rocket" | "palette" | "inbox" | "flow" | "chart" | "check" | "link";

export interface Feature {
  icon: FeatureIcon;
  title: string;
  body: string;
  points?: string[];
}

export const FEATURES: Record<
  "writer" | "calendar" | "campaigns" | "studio" | "inbox" | "automations" | "analytics" | "approvals" | "bio",
  Feature
> = {
  writer: {
    icon: "sparkles",
    title: "An AI writer that sounds like you",
    body: "Describe a post in one line. Get a caption, hashtags and an image in your brand voice.",
    points: ["Rewrite, shorten, expand or translate any sentence", "A post score with one-click fixes", "A shorter version for X, a longer one for LinkedIn"],
  },
  calendar: {
    icon: "calendar",
    title: "One calendar for every channel",
    body: "Plan in list, calendar or board view. Drag a post to another day to reschedule it.",
    points: ["Different captions per channel in one post", "Live character limits and automatic threads", "A read-only calendar link for clients"],
  },
  campaigns: {
    icon: "rocket",
    title: "Campaigns from one brief",
    body: "Turn a single idea into a run of posts across days, then review and approve before anything goes out.",
  },
  studio: {
    icon: "palette",
    title: "A design studio built in",
    body: "On-brand graphics from templates in every social format, ready to drop into a post.",
  },
  inbox: {
    icon: "inbox",
    title: "Every reply in one inbox",
    body: "Coming soon. Comments, mentions and messages in one place, with AI-suggested replies and team assignment.",
  },
  automations: {
    icon: "flow",
    title: "Automations that run themselves",
    body: "Share new blog posts from RSS, thank people who mention you, or answer comments with a keyword.",
  },
  analytics: {
    icon: "chart",
    title: "Analytics that point to what works",
    body: "Impressions, engagement, your best times to post and your top posts across channels.",
  },
  approvals: {
    icon: "check",
    title: "Approvals for teams and clients",
    body: "Send posts for sign-off. Clients approve or comment without being able to edit.",
  },
  bio: {
    icon: "link",
    title: "Link-in-bio pages",
    body: "A fast, branded page for your bio link, with click tracking built in.",
  },
};

export interface Integration {
  network: Network;
  name: string;
  what: string;
}

/** Channels people can connect today. */
export const INTEGRATIONS: Integration[] = [
  { network: "LINKEDIN", name: "LinkedIn", what: "Text and image posts on your profile" },
  { network: "INSTAGRAM", name: "Instagram", what: "Photos, carousels and reels" },
  { network: "FACEBOOK", name: "Facebook", what: "Posts and photos on your Pages" },
  { network: "PINTEREST", name: "Pinterest", what: "Pins on any of your boards" },
  { network: "REDDIT", name: "Reddit", what: "Text and link posts to your subreddits" },
  { network: "SLACK", name: "Slack", what: "Messages to your workspace channels" },
  { network: "NOTION", name: "Notion", what: "Posts published as Notion pages" },
  { network: "YOUTUBE", name: "YouTube", what: "Connect your channel. Video uploads are on the way." },
];

export const STEPS = [
  { title: "Connect your channels", body: "Sign in to LinkedIn, Instagram, Facebook and more in a couple of clicks. No developer setup, no API keys." },
  { title: "Create with AI", body: "Write one idea. Get captions, hashtags and images for every network, or plan a whole campaign at once." },
  { title: "Schedule and publish", body: "Pick a time or publish now. Each channel gets the right format, and you see exactly what went out." },
];

export const FAQS = [
  {
    q: "Is it really free?",
    a: "Yes. Nexo is free for creators, teams and communities. There are no plans and no paywall. AI features have a generous monthly allowance so the service stays sustainable for everyone.",
  },
  {
    q: "Do I need a developer account for each network?",
    a: "No. You connect accounts by signing in, the same way you log in to any app. We handle the technical setup.",
  },
  {
    q: "Can my clients approve posts?",
    a: "Yes. Invite them as a Client. They can approve, comment and see analytics, but can't edit or publish.",
  },
  {
    q: "Can I manage several brands?",
    a: "Yes. Each brand has its own channels, posts, team and settings, all under one account.",
  },
  {
    q: "What happens if a post fails on one network?",
    a: "The post is marked as needing attention and tells you why. Fix it and retry. Channels that already posted aren't posted again.",
  },
];
