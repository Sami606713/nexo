// Marketing copy shared by the public site pages. Keep claims in line with what the product actually does.
import type { Network } from "@postline/core";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Nexo";

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export type FeatureIcon =
  | "sparkles"
  | "calendar"
  | "rocket"
  | "palette"
  | "inbox"
  | "flow"
  | "chart"
  | "check"
  | "link"
  | "users";

export interface Feature {
  icon: FeatureIcon;
  title: string;
  body: string;
  points?: string[];
}

export const FEATURES: Feature[] = [
  {
    icon: "sparkles",
    title: "AI writer in your brand voice",
    body: "Describe a post in one line and get a caption, hashtags and an image that sound like you — not like a robot.",
    points: ["Rewrite, shorten, expand or translate any sentence", "Post score with one-click fixes", "Learns your voice from your brand profile"],
  },
  {
    icon: "calendar",
    title: "One calendar for every channel",
    body: "Plan in list, calendar or board view. Drag a post to another day to reschedule it.",
    points: ["Per-channel captions in one post", "Live character limits and thread splitting", "Share a read-only calendar with clients"],
  },
  {
    icon: "rocket",
    title: "Campaigns from a single brief",
    body: "Turn one idea into a run of posts spread across days, with images — then review, edit and approve before anything is scheduled.",
  },
  {
    icon: "palette",
    title: "Design studio",
    body: "Create on-brand graphics from templates in every social format, then drop them straight into a post.",
  },
  {
    icon: "inbox",
    title: "Social inbox",
    body: "Reply to comments, mentions and messages from one place, with AI-suggested replies and team assignment.",
  },
  {
    icon: "flow",
    title: "Automations",
    body: "Post new blog articles from RSS, thank people who mention you, or reply to comments with a keyword — automatically.",
  },
  {
    icon: "chart",
    title: "Analytics",
    body: "See what works: impressions, engagement, best times to post and your top posts across channels.",
  },
  {
    icon: "check",
    title: "Approvals for teams and clients",
    body: "Send posts for sign-off. Clients can approve or request changes without being able to edit your work.",
  },
  {
    icon: "link",
    title: "Link-in-bio pages",
    body: "A fast, branded page for your bio link with click tracking built in.",
  },
];

export interface Integration {
  network: Network;
  name: string;
  what: string;
}

/** Channels users can connect today (via Composio-managed sign-in). */
export const INTEGRATIONS: Integration[] = [
  { network: "LINKEDIN", name: "LinkedIn", what: "Text and image posts on your profile" },
  { network: "FACEBOOK", name: "Facebook", what: "Posts and photos on your Pages" },
  { network: "INSTAGRAM", name: "Instagram", what: "Photos, carousels and reels" },
  { network: "PINTEREST", name: "Pinterest", what: "Pins on any of your boards" },
  { network: "REDDIT", name: "Reddit", what: "Text and link posts to any subreddit" },
  { network: "SLACK", name: "Slack", what: "Messages to your workspace channels" },
  { network: "NOTION", name: "Notion", what: "Publish posts as Notion pages" },
  { network: "YOUTUBE", name: "YouTube", what: "Connect your channel (video uploads coming soon)" },
];

export const STEPS = [
  { title: "Connect your channels", body: "Sign in to LinkedIn, Instagram, Facebook and more in a couple of clicks. No developer setup." },
  { title: "Create with AI", body: "Write one idea. Get captions, hashtags and images for every network — or plan a whole campaign." },
  { title: "Schedule and publish", body: "Pick a time or publish now. Every channel gets the right format, and you see exactly what went out." },
];

export const FAQS = [
  {
    q: "Do I need a developer account for each network?",
    a: "No. You connect your accounts by signing in — the same way you'd log in to any app. We handle the technical setup.",
  },
  {
    q: "How do AI credits work?",
    a: "Each AI action — writing a caption, generating an image, suggesting a reply — uses one credit. Scheduling and publishing are always free. Credits refill every month.",
  },
  {
    q: "Can my clients approve posts?",
    a: "Yes. Invite them with the Client role: they can approve, comment and see analytics, but can't edit or publish.",
  },
  {
    q: "Can I manage several brands?",
    a: "Yes. Every brand has its own channels, posts, team and settings, all under one account.",
  },
  {
    q: "What happens if a post fails on one network?",
    a: "The post is marked “Needs attention” and tells you why. Fix it and retry — channels that already posted aren't posted again.",
  },
];
