// Starter legal copy. Have these reviewed by a lawyer for your jurisdiction before launch.
import { APP_NAME } from "./content";

export interface LegalDoc {
  title: string;
  updated: string;
  intro?: string;
  sections: Array<{ heading: string; body: string[] }>;
}

const CONTACT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com";

export const PRIVACY: LegalDoc = {
  title: "Privacy policy",
  updated: "October 2026",
  intro: `This policy explains what information ${APP_NAME} collects, how we use it, and the choices you have.`,
  sections: [
    {
      heading: "Information we collect",
      body: [
        "Account information: your name, email address and password (stored as a secure hash), or your Google profile if you sign in with Google.",
        "Content you create: brands, posts, media, designs, campaigns, workflows and messages you write in the product.",
        "Connected accounts: when you connect a social network, we receive the permissions you approve on that network's sign-in screen and basic profile details such as the account name and picture. Access is managed through our integration provider; we never see your social network passwords.",
        "Usage data: basic logs needed to operate, secure and improve the service.",
      ],
    },
    {
      heading: "How we use information",
      body: [
        "To provide the service: publishing your posts, generating AI content you request, showing analytics and syncing your inbox.",
        "To keep the service secure, prevent abuse and fix problems.",
        "To contact you about your account, security and important changes. We don't sell your personal information.",
      ],
    },
    {
      heading: "AI features",
      body: [
        "When you use AI features, the relevant text (and, for images, your prompt and brand colours) is sent to our AI providers to generate the result. Don't include sensitive personal information in prompts.",
      ],
    },
    {
      heading: "Sharing",
      body: [
        "We share information only with service providers that help us run the product (hosting, AI, integrations, email), with the social networks you choose to publish to, or when required by law.",
      ],
    },
    {
      heading: "Your choices",
      body: [
        "You can edit or delete your content at any time, disconnect social accounts from the Channels page, and ask us to delete your account and data.",
        `For any privacy request, contact ${CONTACT}.`,
      ],
    },
    {
      heading: "Security and retention",
      body: [
        "Credentials for connected accounts are encrypted at rest. We keep your data while your account is active and delete it within a reasonable period after you ask us to or close your account.",
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: "Terms of service",
  updated: "October 2026",
  intro: `These terms govern your use of ${APP_NAME}. By creating an account you agree to them.`,
  sections: [
    {
      heading: "Your account",
      body: [
        "You must provide accurate information and keep your password secure. You're responsible for activity in your account and in the brands you manage.",
      ],
    },
    {
      heading: "Your content",
      body: [
        "You own the content you create and publish. You give us permission to store, process and publish it on the networks you choose, solely to provide the service.",
        "You're responsible for what you publish, including AI-generated content. Please review it before it goes out.",
      ],
    },
    {
      heading: "Acceptable use",
      body: [
        "Don't use the service for spam, harassment, misleading or illegal content, or to break the rules of the networks you publish to. We may suspend accounts that do.",
      ],
    },
    {
      heading: "Connected networks",
      body: [
        "Publishing depends on third-party networks and their APIs. They can change or limit access at any time, and we can't guarantee every post will be accepted.",
      ],
    },
    {
      heading: "Free service and AI allowance",
      body: [
        `${APP_NAME} is provided free of charge. AI features have a monthly allowance that refills each month and doesn't roll over. We may adjust the allowance to keep the service sustainable.`,
      ],
    },
    {
      heading: "Liability",
      body: [
        "The service is provided “as is”. To the extent permitted by law, we're not liable for indirect or consequential losses, or for content published at your request.",
      ],
    },
    {
      heading: "Contact",
      body: [`Questions about these terms? Contact ${CONTACT}.`],
    },
  ],
};
