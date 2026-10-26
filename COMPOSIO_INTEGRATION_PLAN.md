# Composio Integration Implementation Plan

## Executive Summary

Replace 9 existing custom OAuth integrations with **Composio** (third-party OAuth management platform) to eliminate:
- 8 weeks of custom OAuth development per platform
- 2-4 months app review processes (Meta, TikTok, LinkedIn, etc.)
- $25k+ maintenance costs for custom OAuth infrastructure
- Token refresh management complexity

**Timeline:** 2-3 weeks for full implementation
**Cost:** $0/month (100K calls free tier covers ~6K monthly usage)

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Composio Overview](#composio-overview)
3. [Integration Strategy](#integration-strategy)
4. [Database Changes](#database-changes)
5. [Implementation Steps](#implementation-steps)
6. [API Design](#api-design)
7. [Migration Strategy](#migration-strategy)
8. [Testing Plan](#testing-plan)
9. [Rollout Plan](#rollout-plan)
10. [Engagement Credits System](#engagement-credits-system)

---

## 1. Current Architecture

### Existing Adapters (9 working)
Located in `packages/integrations/src/adapters/`:

✅ **Working:**
- `bluesky.ts` - Bluesky (credentials-based, no OAuth)
- `linkedin.ts` - LinkedIn OAuth
- `x.ts` - X/Twitter OAuth
- `mastodon.ts` - Mastodon (credentials-based)
- `telegram.ts` - Telegram (webhook-based)
- `discord.ts` - Discord (webhook-based)
- `slack.ts` - Slack (webhook-based)
- `custom-webhook.ts` - Custom webhooks

🚧 **Stubbed:**
- `meta.ts` - Facebook/Instagram (OAuth stub, not fully working)

### Current Flow
```
User clicks "Connect" 
  ↓
Custom OAuth flow (getAuthorizeUrl → exchangeCode)
  ↓
Store encrypted credentials in Channel.credentialsEnc
  ↓
Adapter uses credentials to publish/fetch metrics
  ↓
Worker refreshes tokens via adapter.refresh()
```

### Adapter Interface (`packages/core/src/adapter.ts`)
```typescript
export interface NetworkAdapter {
  network: Network;
  limits: NetworkLimits;
  connectKind: "oauth2" | "credentials" | "webhook";
  
  // OAuth methods
  getAuthorizeUrl?(params: { state: string; redirectUri: string }): string;
  exchangeCode?(params: { code: string; redirectUri: string }): Promise<ConnectTarget[]>;
  
  // Credentials methods
  connectWithCredentials?(fields: Record<string, string>): Promise<ConnectTarget[]>;
  
  // Core methods
  refresh?(credentials: Credentials): Promise<Credentials | null>;
  validate(post: ComposedPost): ValidationIssue[];
  publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult>;
  delete?(externalId: string, credentials: Credentials): Promise<void>;
}
```

---

## 2. Composio Overview

### What Composio Provides
1. **OAuth Management:** Handles all OAuth flows for 150+ platforms
2. **Unified API:** Single SDK for all integrations
3. **Auto Token Refresh:** Automatic token refresh without custom code
4. **App Review Coverage:** Meta, TikTok, LinkedIn, YouTube - all pre-approved
5. **Security:** SOC2, ISO27001 certified, encrypted credential storage
6. **Tool Execution:** Direct API calls through unified interface

### Composio Pricing
- **Free Tier:** 100K tool calls/month, 50K trigger events/month
- **Pro Tier:** $29/month with auto-scaling
- **Our Usage:** ~6K calls/month (posting + metrics) = **FREE**

### Supported Platforms (OAuth)
- ✅ YouTube
- ✅ Instagram
- ✅ Facebook
- ✅ TikTok
- ✅ LinkedIn
- ✅ Pinterest
- ✅ Twitter/X
- ✅ Google Business Profile
- ✅ Threads
- ✅ Reddit (future)

### Not Supported by Composio
- ❌ Bluesky (keep custom adapter)
- ❌ Mastodon (keep custom adapter)
- ❌ Telegram (keep webhook adapter)
- ❌ Discord (keep webhook adapter)
- ❌ Slack (keep webhook adapter)
- ❌ Custom webhooks (keep custom adapter)

---

## 3. Integration Strategy

### Hybrid Approach: Composio + Custom Adapters

**Keep existing adapters for:**
1. Non-OAuth platforms (Bluesky, Mastodon)
2. Webhook platforms (Telegram, Discord, Slack, Custom)
3. Backward compatibility during migration

**Use Composio for:**
1. All OAuth platforms (YouTube, Instagram, Facebook, TikTok, LinkedIn, Pinterest, X, Google Business, Threads)
2. All new user connections
3. All existing users will be forced to reconnect

### Architecture Decision
```
┌─────────────────────────────────────────┐
│         getAdapter() Factory            │
├─────────────────────────────────────────┤
│  if (channel.composioConnectionId)      │
│    → return ComposioAdapter             │
│  else                                   │
│    → return legacy adapter (fallback)   │
└─────────────────────────────────────────┘
```

**Benefits:**
- ✅ Zero downtime migration
- ✅ Gradual rollout possible
- ✅ Easy rollback if issues
- ✅ Keep non-OAuth platforms working
- ✅ Single codebase for all OAuth platforms

---

## 4. Database Changes

### Update Channel Model

**File:** `packages/db/prisma/schema.prisma`

```prisma
model Channel {
  id             String        @id @default(cuid())
  brandId        String
  network        Network
  externalId     String
  name           String
  username       String?
  avatarUrl      String?
  
  // NEW: Composio fields
  composioConnectionId String?  @unique
  composioEntityId     String?
  
  // Keep for backward compatibility with old channels
  credentialsEnc String?        @db.Text
  
  expiresAt      DateTime?
  scopes         String[]
  health         ChannelHealth @default(OK)
  lastError      Json?
  extras         Json          @default("{}")
  inboxEnabled   Boolean       @default(false)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  brand         Brand            @relation(fields: [brandId], references: [id], onDelete: Cascade)
  posts         Post[]
  slots         PostingSlot[]
  conversations Conversation[]
  metrics       ChannelMetric[]

  @@unique([brandId, network, externalId])
  @@index([brandId])
}
```

### Migration Command
```bash
npx prisma migrate dev --name add_composio_fields
```

### Field Explanations
- **composioConnectionId:** Unique Composio connection ID (returned after OAuth)
- **composioEntityId:** Composio entity ID (user-scoped grouping, usually `userId`)
- **credentialsEnc:** Keep for legacy channels, set to NULL for Composio channels

---

## 5. Implementation Steps

### Phase 1: Setup & Configuration (Day 1)

#### 1.1 Install Composio SDK
```bash
npm install composio-core
```

#### 1.2 Environment Variables
Add to `.env`:
```env
COMPOSIO_API_KEY=your_api_key_from_composio_dev_dashboard
APP_URL=https://your-domain.com  # or http://localhost:3000 for dev
```

#### 1.3 Database Migration
```bash
npx prisma migrate dev --name add_composio_fields
npx prisma generate
```

---

### Phase 2: Core Infrastructure (Days 2-3)

#### 2.1 Create Composio Client

**File:** `packages/integrations/src/composio-client.ts`

```typescript
import { Composio } from "composio-core";

if (!process.env.COMPOSIO_API_KEY) {
  throw new Error("COMPOSIO_API_KEY is required");
}

export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Get or create a Composio entity for a user.
 * Entity = user-scoped namespace for connections.
 */
export async function ensureComposioEntity(userId: string): Promise<string> {
  try {
    const entity = await composio.getEntity(userId);
    return entity.id;
  } catch {
    const entity = await composio.createEntity({ id: userId });
    return entity.id;
  }
}

/**
 * Map our Network enum to Composio app names.
 */
export function networkToComposioApp(network: string): string {
  const mapping: Record<string, string> = {
    YOUTUBE: "youtube",
    INSTAGRAM: "instagram",
    FACEBOOK: "facebook",
    TIKTOK: "tiktok",
    LINKEDIN: "linkedin",
    LINKEDIN_PAGE: "linkedin",
    PINTEREST: "pinterest",
    X: "twitter",
    THREADS: "threads",
    GOOGLE_BUSINESS: "googlebusiness",
  };
  return mapping[network] || network.toLowerCase();
}
```

#### 2.2 Create ComposioAdapter

**File:** `packages/integrations/src/adapters/composio.ts`

```typescript
import {
  AdapterError,
  NETWORK_LIMITS,
  type ComposedPost,
  type ConnectTarget,
  type Credentials,
  type NetworkAdapter,
  type PublishResult,
  type ValidationIssue,
  Network,
} from "@postline/core";
import { composio } from "../composio-client";
import { validateForNetwork } from "../rules";

/**
 * Universal adapter that uses Composio for OAuth management.
 * Works for all OAuth-based networks (YouTube, Instagram, Facebook, etc.)
 */
export class ComposioAdapter implements NetworkAdapter {
  constructor(public readonly network: Network) {}

  get limits() {
    return NETWORK_LIMITS[this.network];
  }

  connectKind: "oauth2" = "oauth2";

  validate(post: Pick<ComposedPost, "caption" | "media" | "options">): ValidationIssue[] {
    return validateForNetwork(this.network, post.caption, post.media, post.options);
  }

  /**
   * Composio handles OAuth flow via their SDK.
   * This is called from the API route.
   */
  async getAuthorizeUrl(params: { state: string; redirectUri: string }): Promise<string> {
    // Not used - OAuth handled by API routes directly
    throw new Error("Use Composio SDK directly from API routes");
  }

  async exchangeCode(params: { code: string }): Promise<ConnectTarget[]> {
    // Not used - OAuth handled by API routes directly
    throw new Error("Use Composio SDK directly from API routes");
  }

  /**
   * Composio auto-refreshes tokens, so this is not needed.
   */
  async refresh(credentials: Credentials): Promise<Credentials | null> {
    return null; // Composio handles refresh automatically
  }

  /**
   * Publish a post using Composio's tool execution.
   * The connectionId is stored in Channel.composioConnectionId.
   */
  async publish(post: ComposedPost, credentials: Credentials): Promise<PublishResult> {
    const connectionId = credentials.composioConnectionId as string;
    if (!connectionId) {
      throw new AdapterError("auth", "Missing composioConnectionId");
    }

    try {
      // Execute platform-specific publish action via Composio
      const result = await this.executePublishAction(connectionId, post);
      
      return {
        externalId: result.id,
        url: result.url,
        partIds: result.partIds,
      };
    } catch (error: any) {
      if (error.message?.includes("401") || error.message?.includes("unauthorized")) {
        throw new AdapterError("auth", "Token expired or revoked");
      }
      if (error.message?.includes("429") || error.message?.includes("rate limit")) {
        throw new AdapterError("rate_limit", "Rate limit exceeded");
      }
      throw new AdapterError("transient", error.message || "Unknown error");
    }
  }

  /**
   * Platform-specific publish logic using Composio tools.
   */
  private async executePublishAction(
    connectionId: string,
    post: ComposedPost
  ): Promise<{ id: string; url: string; partIds?: string[] }> {
    const { network } = this;
    const { caption, media, options } = post;

    // Each platform has different Composio actions
    switch (network) {
      case "YOUTUBE": {
        // Upload video to YouTube
        const result = await composio.executeAction({
          connectionId,
          action: "YOUTUBE_UPLOAD_VIDEO",
          params: {
            title: caption.slice(0, 100),
            description: caption,
            videoFile: media[0]?.url, // Video URL
            privacy: options.privacy || "public",
          },
        });
        return {
          id: result.data.id,
          url: `https://youtube.com/watch?v=${result.data.id}`,
        };
      }

      case "INSTAGRAM": {
        // Create Instagram post (photo/video/carousel)
        if (media.length > 1) {
          // Carousel
          const result = await composio.executeAction({
            connectionId,
            action: "INSTAGRAM_CREATE_CAROUSEL",
            params: {
              caption,
              mediaUrls: media.map(m => m.url),
            },
          });
          return {
            id: result.data.id,
            url: result.data.permalink,
          };
        } else {
          // Single photo/video
          const result = await composio.executeAction({
            connectionId,
            action: media[0]?.mime.startsWith("video") 
              ? "INSTAGRAM_CREATE_VIDEO" 
              : "INSTAGRAM_CREATE_PHOTO",
            params: {
              caption,
              mediaUrl: media[0]?.url,
            },
          });
          return {
            id: result.data.id,
            url: result.data.permalink,
          };
        }
      }

      case "FACEBOOK": {
        // Create Facebook post
        const result = await composio.executeAction({
          connectionId,
          action: "FACEBOOK_CREATE_POST",
          params: {
            message: caption,
            mediaUrls: media.map(m => m.url),
          },
        });
        return {
          id: result.data.id,
          url: result.data.permalink_url,
        };
      }

      case "TIKTOK": {
        // Upload TikTok video
        const result = await composio.executeAction({
          connectionId,
          action: "TIKTOK_UPLOAD_VIDEO",
          params: {
            videoUrl: media[0]?.url,
            caption,
            privacy: options.privacy || "PUBLIC_TO_EVERYONE",
          },
        });
        return {
          id: result.data.share_id,
          url: result.data.share_url,
        };
      }

      case "LINKEDIN":
      case "LINKEDIN_PAGE": {
        // Create LinkedIn post
        const result = await composio.executeAction({
          connectionId,
          action: "LINKEDIN_CREATE_POST",
          params: {
            text: caption,
            mediaUrls: media.map(m => m.url),
          },
        });
        return {
          id: result.data.id,
          url: result.data.url,
        };
      }

      case "PINTEREST": {
        // Create Pinterest pin
        const result = await composio.executeAction({
          connectionId,
          action: "PINTEREST_CREATE_PIN",
          params: {
            title: caption.slice(0, 100),
            description: caption,
            imageUrl: media[0]?.url,
            boardId: post.channelExtras.boardId,
          },
        });
        return {
          id: result.data.id,
          url: result.data.url,
        };
      }

      case "X": {
        // Create X/Twitter post
        const result = await composio.executeAction({
          connectionId,
          action: "TWITTER_CREATE_TWEET",
          params: {
            text: caption,
            mediaUrls: media.map(m => m.url),
          },
        });
        return {
          id: result.data.id,
          url: `https://x.com/user/status/${result.data.id}`,
        };
      }

      case "THREADS": {
        // Create Threads post
        const result = await composio.executeAction({
          connectionId,
          action: "THREADS_CREATE_POST",
          params: {
            text: caption,
            mediaUrls: media.map(m => m.url),
          },
        });
        return {
          id: result.data.id,
          url: result.data.permalink,
        };
      }

      case "GOOGLE_BUSINESS": {
        // Create Google Business post
        const result = await composio.executeAction({
          connectionId,
          action: "GOOGLEBUSINESS_CREATE_POST",
          params: {
            summary: caption,
            mediaUrls: media.map(m => m.url),
          },
        });
        return {
          id: result.data.name,
          url: result.data.url || "",
        };
      }

      default:
        throw new AdapterError("rejected", `Network ${network} not supported by Composio`);
    }
  }

  /**
   * Delete a post using Composio tools.
   */
  async delete(
    externalId: string,
    credentials: Credentials,
    channelExtras: Record<string, unknown>,
    partIds?: string[]
  ): Promise<void> {
    const connectionId = credentials.composioConnectionId as string;
    if (!connectionId) {
      throw new AdapterError("auth", "Missing composioConnectionId");
    }

    try {
      await this.executeDeleteAction(connectionId, externalId, partIds);
    } catch (error: any) {
      if (error.message?.includes("not found") || error.message?.includes("404")) {
        // Already deleted, ignore
        return;
      }
      throw new AdapterError("transient", error.message || "Delete failed");
    }
  }

  private async executeDeleteAction(
    connectionId: string,
    externalId: string,
    partIds?: string[]
  ): Promise<void> {
    const { network } = this;

    switch (network) {
      case "X":
        await composio.executeAction({
          connectionId,
          action: "TWITTER_DELETE_TWEET",
          params: { tweetId: externalId },
        });
        break;

      case "FACEBOOK":
        await composio.executeAction({
          connectionId,
          action: "FACEBOOK_DELETE_POST",
          params: { postId: externalId },
        });
        break;

      case "INSTAGRAM":
        await composio.executeAction({
          connectionId,
          action: "INSTAGRAM_DELETE_POST",
          params: { mediaId: externalId },
        });
        break;

      case "LINKEDIN":
      case "LINKEDIN_PAGE":
        await composio.executeAction({
          connectionId,
          action: "LINKEDIN_DELETE_POST",
          params: { postId: externalId },
        });
        break;

      case "YOUTUBE":
        await composio.executeAction({
          connectionId,
          action: "YOUTUBE_DELETE_VIDEO",
          params: { videoId: externalId },
        });
        break;

      case "TIKTOK":
        // TikTok doesn't support deletion via API
        throw new AdapterError("rejected", "TikTok does not support post deletion via API");

      default:
        throw new AdapterError("rejected", `Delete not supported for ${network}`);
    }
  }
}

// Export factory function
export function createComposioAdapter(network: Network): NetworkAdapter {
  return new ComposioAdapter(network);
}
```

#### 2.3 Update Adapter Factory

**File:** `packages/integrations/src/index.ts`

```typescript
import type { Network, NetworkAdapter } from "@postline/core";
import { blueskyAdapter } from "./adapters/bluesky";
import { customWebhookAdapter } from "./adapters/custom-webhook";
import { discordAdapter } from "./adapters/discord";
import { linkedinAdapter } from "./adapters/linkedin";
import { mastodonAdapter } from "./adapters/mastodon";
import { facebookAdapter, instagramAdapter } from "./adapters/meta";
import { slackAdapter } from "./adapters/slack";
import { telegramAdapter } from "./adapters/telegram";
import { xAdapter } from "./adapters/x";
import { createComposioAdapter } from "./adapters/composio";

const LEGACY_ADAPTERS: Partial<Record<Network, NetworkAdapter>> = {
  BLUESKY: blueskyAdapter,
  MASTODON: mastodonAdapter,
  TELEGRAM: telegramAdapter,
  DISCORD: discordAdapter,
  SLACK: slackAdapter,
  CUSTOM_WEBHOOK: customWebhookAdapter,
  // Keep OAuth adapters as fallback during migration
  LINKEDIN: linkedinAdapter,
  X: xAdapter,
  FACEBOOK: facebookAdapter,
  INSTAGRAM: instagramAdapter,
};

// Networks that use Composio for OAuth
const COMPOSIO_NETWORKS: Network[] = [
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "LINKEDIN",
  "LINKEDIN_PAGE",
  "PINTEREST",
  "X",
  "THREADS",
  "GOOGLE_BUSINESS",
];

/**
 * Get adapter for a channel.
 * - If channel has composioConnectionId, use ComposioAdapter
 * - Otherwise, use legacy adapter
 */
export function getAdapter(
  network: Network,
  composioConnectionId?: string | null
): NetworkAdapter | undefined {
  // Use Composio adapter if connection ID exists
  if (composioConnectionId && COMPOSIO_NETWORKS.includes(network)) {
    return createComposioAdapter(network);
  }

  // Fallback to legacy adapter
  return LEGACY_ADAPTERS[network];
}

/** Networks available for new connections (Composio + non-OAuth) */
export function availableNetworks(): Network[] {
  return [
    ...COMPOSIO_NETWORKS, // All OAuth via Composio
    "BLUESKY",           // Credentials
    "MASTODON",          // Credentials
    "TELEGRAM",          // Webhook
    "DISCORD",           // Webhook
    "SLACK",             // Webhook
    "CUSTOM_WEBHOOK",    // Webhook
  ];
}

export { validateForNetwork, hasBlockingIssues } from "./rules";
export * from "./inbox";
```

---

### Phase 3: API Routes (Days 4-5)

#### 3.1 Connect Channel Route

**File:** `apps/web/src/app/api/channels/connect/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { composio, ensureComposioEntity, networkToComposioApp } from "@postline/integrations/composio-client";
import { prisma } from "@postline/db";
import { Network } from "@postline/core";

/**
 * POST /api/channels/connect
 * Initiate OAuth flow with Composio
 * 
 * Body: { network: Network, brandId: string }
 * Returns: { redirectUrl: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { network, brandId } = await req.json();

    // Validate brand ownership
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, ownerId: session.user.id },
    });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Get or create Composio entity for user
    const entityId = await ensureComposioEntity(session.user.id);

    // Get Composio app name
    const appName = networkToComposioApp(network);

    // Generate OAuth URL via Composio
    const entity = await composio.getEntity(entityId);
    const connection = await entity.initiateConnection({
      appName,
      redirectUri: `${process.env.APP_URL}/api/channels/callback`,
      // Store state for callback verification
      integrationId: `${brandId}:${network}`,
    });

    return NextResponse.json({ redirectUrl: connection.redirectUrl });
  } catch (error: any) {
    console.error("Composio connect error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate connection" },
      { status: 500 }
    );
  }
}
```

#### 3.2 OAuth Callback Route

**File:** `apps/web/src/app/api/channels/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { composio, ensureComposioEntity } from "@postline/integrations/composio-client";
import { prisma } from "@postline/db";
import { encrypt } from "@postline/core/crypto";
import { Network } from "@postline/core";

/**
 * GET /api/channels/callback
 * OAuth callback from Composio
 * 
 * Query params: code, state (integrationId = brandId:network)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(`${process.env.APP_URL}/login?error=unauthorized`);
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const integrationId = searchParams.get("state");

    if (!code || !integrationId) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/channels?error=missing_params`
      );
    }

    // Parse state
    const [brandId, network] = integrationId.split(":");
    if (!brandId || !network) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/channels?error=invalid_state`
      );
    }

    // Verify brand ownership
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, ownerId: session.user.id },
    });
    if (!brand) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/channels?error=brand_not_found`
      );
    }

    // Get Composio entity
    const entityId = await ensureComposioEntity(session.user.id);
    const entity = await composio.getEntity(entityId);

    // Complete OAuth flow
    const connection = await entity.getConnection({ code });

    // Get connected account details
    const accountInfo = await connection.getAccountInfo();

    // Store channel in database
    await prisma.channel.create({
      data: {
        brandId,
        network: network as Network,
        externalId: accountInfo.id,
        name: accountInfo.name,
        username: accountInfo.username,
        avatarUrl: accountInfo.avatar,
        composioConnectionId: connection.id,
        composioEntityId: entityId,
        credentialsEnc: null, // Not needed for Composio
        scopes: accountInfo.scopes || [],
        health: "OK",
        extras: {},
      },
    });

    return NextResponse.redirect(
      `${process.env.APP_URL}/channels?success=connected&network=${network}`
    );
  } catch (error: any) {
    console.error("Composio callback error:", error);
    return NextResponse.redirect(
      `${process.env.APP_URL}/channels?error=${encodeURIComponent(error.message)}`
    );
  }
}
```

#### 3.3 List Connections Route

**File:** `apps/web/src/app/api/channels/connections/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { composio, ensureComposioEntity } from "@postline/integrations/composio-client";

/**
 * GET /api/channels/connections
 * List all Composio connections for current user
 * 
 * Returns: Connection[]
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entityId = await ensureComposioEntity(session.user.id);
    const entity = await composio.getEntity(entityId);
    const connections = await entity.getConnections();

    return NextResponse.json({ connections });
  } catch (error: any) {
    console.error("List connections error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list connections" },
      { status: 500 }
    );
  }
}
```

---

### Phase 4: UI Components (Days 6-7)

#### 4.1 Connect Button Component

**File:** `apps/web/src/components/channels/ConnectButton.tsx`

```typescript
"use client";

import { useState } from "react";
import { Network } from "@postline/core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ConnectButtonProps {
  network: Network;
  brandId: string;
  label?: string;
}

export function ConnectButton({ network, brandId, label }: ConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channels/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, brandId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to connect");
      }

      const { redirectUrl } = await res.json();

      // Open OAuth window
      window.location.href = redirectUrl;
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleConnect} disabled={loading}>
      {loading ? "Connecting..." : label || `Connect ${network}`}
    </Button>
  );
}
```

#### 4.2 Channels List Page

**File:** `apps/web/src/app/(dashboard)/channels/page.tsx`

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@postline/db";
import { redirect } from "next/navigation";
import { Network } from "@postline/core";
import { ConnectButton } from "@/components/channels/ConnectButton";
import { ChannelCard } from "@/components/channels/ChannelCard";

const AVAILABLE_NETWORKS: Network[] = [
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "LINKEDIN",
  "PINTEREST",
  "X",
  "THREADS",
  "GOOGLE_BUSINESS",
  "BLUESKY",
  "MASTODON",
];

export default async function ChannelsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get user's first brand (or create logic)
  const brand = await prisma.brand.findFirst({
    where: { ownerId: session.user.id },
    include: {
      channels: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!brand) {
    redirect("/onboarding");
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Connected Channels</h1>
        <p className="text-muted-foreground">
          Connect your social media accounts to start publishing
        </p>
      </div>

      {/* Connected channels */}
      {brand.channels.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Your Channels</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {brand.channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </div>
      )}

      {/* Available networks */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Add New Channel</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE_NETWORKS.map((network) => (
            <div
              key={network}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <h3 className="font-medium">{network}</h3>
                <p className="text-sm text-muted-foreground">
                  {getNetworkDescription(network)}
                </p>
              </div>
              <ConnectButton network={network} brandId={brand.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getNetworkDescription(network: Network): string {
  const descriptions: Record<Network, string> = {
    YOUTUBE: "Share videos",
    INSTAGRAM: "Photos & Stories",
    FACEBOOK: "Posts & Updates",
    TIKTOK: "Short videos",
    LINKEDIN: "Professional network",
    LINKEDIN_PAGE: "Company page",
    PINTEREST: "Visual boards",
    X: "Real-time updates",
    THREADS: "Text updates",
    GOOGLE_BUSINESS: "Local business",
    BLUESKY: "Decentralized social",
    MASTODON: "Federated network",
    TELEGRAM: "Messaging channel",
    DISCORD: "Community server",
    SLACK: "Team workspace",
    CUSTOM_WEBHOOK: "Custom integration",
  };
  return descriptions[network] || "";
}
```

---

### Phase 5: Worker Updates (Days 8-9)

#### 5.1 Update Publish Worker

**File:** `apps/worker/src/workers/publish.ts`

```typescript
// Update to use getAdapter with composioConnectionId

import { getAdapter } from "@postline/integrations";
import { prisma } from "@postline/db";

export async function publishPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      channel: true,
      group: {
        include: {
          media: { include: { media: true } },
        },
      },
    },
  });

  if (!post) throw new Error("Post not found");

  // Get adapter (Composio or legacy)
  const adapter = getAdapter(
    post.channel.network,
    post.channel.composioConnectionId
  );

  if (!adapter) {
    throw new Error(`No adapter for ${post.channel.network}`);
  }

  // Build credentials object
  const credentials = post.channel.composioConnectionId
    ? { composioConnectionId: post.channel.composioConnectionId }
    : JSON.parse(decrypt(post.channel.credentialsEnc!));

  // Publish
  const result = await adapter.publish(
    {
      postId: post.id,
      caption: post.captionOverride || post.group.caption,
      media: post.group.media.map(pm => ({
        url: pm.media.url,
        mime: pm.media.mime,
        width: pm.media.width || undefined,
        height: pm.media.height || undefined,
        alt: pm.media.alt || undefined,
      })),
      options: post.group.options[post.channel.network] || {},
      channelExtras: post.channel.extras,
    },
    credentials
  );

  // Update post
  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: "POSTED",
      externalId: result.externalId,
      url: result.url,
      partIds: result.partIds || [],
      publishedAt: new Date(),
    },
  });
}
```

#### 5.2 Remove Token Refresh Worker

**File:** `apps/worker/src/workers/maintenance.ts`

```typescript
// DELETE or comment out token refresh logic
// Composio handles token refresh automatically

/*
// OLD CODE - No longer needed
export async function refreshTokens() {
  const channels = await prisma.channel.findMany({
    where: {
      expiresAt: { lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      health: "OK",
    },
  });

  for (const channel of channels) {
    const adapter = getAdapter(channel.network);
    if (!adapter?.refresh) continue;
    
    // ... refresh logic
  }
}
*/

// NEW: Composio channels don't need refresh
export async function refreshTokens() {
  // Only refresh legacy channels (those without composioConnectionId)
  const channels = await prisma.channel.findMany({
    where: {
      composioConnectionId: null, // Legacy only
      expiresAt: { lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      health: "OK",
    },
  });

  for (const channel of channels) {
    const adapter = getAdapter(channel.network, null);
    if (!adapter?.refresh) continue;
    
    // ... existing refresh logic for legacy adapters
  }
}
```

---

## 6. API Design

### Composio SDK Methods

```typescript
// Initialize
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Entity management (user-scoped)
const entity = await composio.createEntity({ id: userId });
const entity = await composio.getEntity(userId);

// OAuth flow
const connection = await entity.initiateConnection({
  appName: "youtube",
  redirectUri: "https://app.com/callback",
  integrationId: "brandId:network",
});
// Returns: { redirectUrl: "https://oauth.provider.com/...", connectionId: "..." }

const connection = await entity.getConnection({ code: "oauth_code" });
// Completes OAuth, returns connection object

// Account info
const info = await connection.getAccountInfo();
// Returns: { id, name, username, avatar, scopes }

// Execute actions
const result = await composio.executeAction({
  connectionId: "conn_xxx",
  action: "YOUTUBE_UPLOAD_VIDEO",
  params: { title, description, videoFile, privacy },
});

// List connections
const connections = await entity.getConnections();
```

### Internal API Routes

```
POST /api/channels/connect
  Body: { network, brandId }
  Returns: { redirectUrl }

GET /api/channels/callback
  Query: code, state (integrationId)
  Redirects to: /channels?success=connected

GET /api/channels/connections
  Returns: { connections: Connection[] }

DELETE /api/channels/:channelId
  Deletes channel and revokes Composio connection
```

---

## 7. Migration Strategy

### Approach: Force Reconnection

All existing users with OAuth channels must reconnect via Composio.

#### 7.1 Mark Existing Channels as NEEDS_RECONNECT

```sql
-- Migration script
UPDATE "Channel"
SET health = 'NEEDS_RECONNECT',
    "lastError" = '{"message": "Please reconnect your account to continue posting"}'
WHERE network IN (
  'YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 
  'LINKEDIN', 'LINKEDIN_PAGE', 'PINTEREST', 'X', 
  'THREADS', 'GOOGLE_BUSINESS'
)
AND "composioConnectionId" IS NULL;
```

#### 7.2 UI Notification

Show banner on dashboard:
```
⚠️ Action Required: Reconnect Your Channels
We've upgraded our integration system for better security and reliability. 
Please reconnect your social media accounts.
[Reconnect Now]
```

#### 7.3 Block Publishing from NEEDS_RECONNECT Channels

```typescript
// In publish worker
if (channel.health === "NEEDS_RECONNECT") {
  throw new AdapterError(
    "auth",
    "Channel needs reconnection. Please reconnect in settings."
  );
}
```

#### 7.4 Reconnection Flow

1. User clicks "Reconnect" button on channel card
2. Same OAuth flow as new connection
3. Match by `network + externalId`
4. Update existing Channel record:
   ```typescript
   await prisma.channel.update({
     where: { id: existingChannel.id },
     data: {
       composioConnectionId: connection.id,
       composioEntityId: entityId,
       credentialsEnc: null,
       health: "OK",
       lastError: null,
     },
   });
   ```

---

## 8. Testing Plan

### Unit Tests

#### Test ComposioAdapter

**File:** `packages/integrations/src/adapters/__tests__/composio.test.ts`

```typescript
import { ComposioAdapter } from "../composio";
import { composio } from "../../composio-client";

jest.mock("../../composio-client");

describe("ComposioAdapter", () => {
  it("should publish to YouTube", async () => {
    const adapter = new ComposioAdapter("YOUTUBE");
    const mockExecute = jest.fn().mockResolvedValue({
      data: { id: "vid123", url: "https://youtube.com/watch?v=vid123" },
    });
    (composio.executeAction as jest.Mock) = mockExecute;

    const result = await adapter.publish(
      {
        postId: "post123",
        caption: "Test video",
        media: [{ url: "https://example.com/video.mp4", mime: "video/mp4" }],
        options: {},
        channelExtras: {},
      },
      { composioConnectionId: "conn_xxx" }
    );

    expect(result).toEqual({
      externalId: "vid123",
      url: "https://youtube.com/watch?v=vid123",
    });
    expect(mockExecute).toHaveBeenCalledWith({
      connectionId: "conn_xxx",
      action: "YOUTUBE_UPLOAD_VIDEO",
      params: expect.objectContaining({
        title: "Test video",
        description: "Test video",
      }),
    });
  });

  it("should handle auth errors", async () => {
    const adapter = new ComposioAdapter("INSTAGRAM");
    const mockExecute = jest.fn().mockRejectedValue(new Error("401 unauthorized"));
    (composio.executeAction as jest.Mock) = mockExecute;

    await expect(
      adapter.publish(
        {
          postId: "post123",
          caption: "Test",
          media: [],
          options: {},
          channelExtras: {},
        },
        { composioConnectionId: "conn_xxx" }
      )
    ).rejects.toThrow("Token expired or revoked");
  });
});
```

### Integration Tests

#### Test OAuth Flow

```typescript
// apps/web/src/app/api/channels/__tests__/connect.test.ts
import { POST } from "../connect/route";

describe("POST /api/channels/connect", () => {
  it("should return redirectUrl", async () => {
    const req = new Request("http://localhost/api/channels/connect", {
      method: "POST",
      body: JSON.stringify({ network: "YOUTUBE", brandId: "brand123" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data).toHaveProperty("redirectUrl");
    expect(data.redirectUrl).toContain("youtube");
  });
});
```

### Manual Testing Checklist

- [ ] Connect YouTube account
- [ ] Connect Instagram account
- [ ] Connect Facebook page
- [ ] Connect TikTok account
- [ ] Connect LinkedIn profile
- [ ] Publish post to YouTube
- [ ] Publish post to Instagram
- [ ] Publish carousel to Instagram
- [ ] Delete post from YouTube
- [ ] Verify token auto-refresh (wait 1 hour)
- [ ] Test error handling (revoke token manually)
- [ ] Test reconnection flow
- [ ] Verify legacy adapters still work (Bluesky, Mastodon)

---

## 9. Rollout Plan

### Week 1: Development
- ✅ Database migration
- ✅ Composio client setup
- ✅ ComposioAdapter implementation
- ✅ API routes (connect, callback, list)
- ✅ UI components (ConnectButton, ChannelCard)

### Week 2: Testing & Migration
- ✅ Unit tests
- ✅ Integration tests
- ✅ Manual testing (5 platforms)
- ✅ Mark existing channels as NEEDS_RECONNECT
- ✅ Deploy migration script

### Week 3: Production Rollout
- Day 1: Deploy to production
- Day 2: Monitor error rates
- Day 3: Email users to reconnect
- Day 4-7: Support user reconnections
- Day 7: Review metrics (success rate, error rate)

### Success Metrics
- **Target:** 90% of users reconnect within 7 days
- **Error Rate:** <1% publish failures
- **Support Tickets:** <5% of users need help
- **Performance:** <2s OAuth flow latency

---

## 10. Engagement Credits System

### Overview

Users earn credits based on social media engagement (views, likes, subscribers, etc.) in real-time.

### Credit Rates (Per Platform)

#### YouTube
- **Video Views:** 0.01 credits per 100 views
- **New Subscriber:** 5 credits
- **Like:** 0.1 credits
- **Comment:** 0.2 credits
- **Share:** 0.5 credits

#### Instagram
- **Post View:** 0.01 credits per 10 views
- **Like:** 0.05 credits
- **Comment:** 0.1 credits
- **Share:** 0.3 credits
- **New Follower:** 2 credits
- **Story View:** 0.01 credits per 5 views
- **Save:** 0.2 credits

#### Facebook
- **Post View:** 0.01 credits per 10 views
- **Like/Reaction:** 0.05 credits
- **Comment:** 0.1 credits
- **Share:** 0.3 credits
- **New Follower:** 2 credits

#### TikTok
- **Video View:** 0.01 credits per 50 views
- **Like:** 0.03 credits
- **Comment:** 0.08 credits
- **Share:** 0.2 credits
- **New Follower:** 1 credit

#### X/Twitter
- **Tweet View:** 0.01 credits per 20 views
- **Like:** 0.05 credits
- **Retweet:** 0.15 credits
- **Reply:** 0.1 credits
- **New Follower:** 1.5 credits

#### LinkedIn
- **Post View:** 0.02 credits per 10 views
- **Like/Reaction:** 0.08 credits
- **Comment:** 0.15 credits
- **Share:** 0.4 credits
- **New Connection:** 3 credits

### Implementation

#### 10.1 Database Schema

```prisma
// Add to existing CreditLedger model
model CreditLedger {
  id        String   @id @default(cuid())
  userId    String
  brandId   String?
  actorId   String?
  delta     Int      // Positive for earnings
  reason    String   // Add: "engagement_youtube_views", "engagement_instagram_likes", etc.
  refType   String?  // "post", "channel"
  refId     String?  // Post.id or Channel.id
  metadata  Json?    // NEW: Store engagement details { views: 100, platform: "youtube" }
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

// Add engagement tracking
model EngagementSnapshot {
  id         String   @id @default(cuid())
  postId     String
  channelId  String
  views      Int      @default(0)
  likes      Int      @default(0)
  comments   Int      @default(0)
  shares     Int      @default(0)
  saves      Int      @default(0)
  lastSync   DateTime @default(now())
  createdAt  DateTime @default(now())

  post    Post    @relation(fields: [postId], references: [id], onDelete: Cascade)
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([postId, lastSync])
  @@index([channelId, lastSync])
}
```

#### 10.2 Credit Earning Service

**File:** `packages/core/src/engagement-credits.ts`

```typescript
import { prisma } from "@postline/db";
import { Network } from "./networks";

interface EngagementDelta {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers: number;
}

const CREDIT_RATES: Record<Network, Partial<Record<keyof EngagementDelta, number>>> = {
  YOUTUBE: {
    views: 0.01 / 100,      // 0.01 per 100 views
    likes: 0.1,
    comments: 0.2,
    shares: 0.5,
    followers: 5,           // subscribers
  },
  INSTAGRAM: {
    views: 0.01 / 10,
    likes: 0.05,
    comments: 0.1,
    shares: 0.3,
    saves: 0.2,
    followers: 2,
  },
  FACEBOOK: {
    views: 0.01 / 10,
    likes: 0.05,
    comments: 0.1,
    shares: 0.3,
    followers: 2,
  },
  TIKTOK: {
    views: 0.01 / 50,
    likes: 0.03,
    comments: 0.08,
    shares: 0.2,
    followers: 1,
  },
  X: {
    views: 0.01 / 20,
    likes: 0.05,
    comments: 0.1,        // replies
    shares: 0.15,         // retweets
    followers: 1.5,
  },
  LINKEDIN: {
    views: 0.02 / 10,
    likes: 0.08,
    comments: 0.15,
    shares: 0.4,
    followers: 3,          // connections
  },
};

export async function awardEngagementCredits(params: {
  userId: string;
  brandId: string;
  postId?: string;
  channelId?: string;
  network: Network;
  delta: Partial<EngagementDelta>;
}): Promise<number> {
  const { userId, brandId, postId, channelId, network, delta } = params;
  const rates = CREDIT_RATES[network] || {};

  let totalCredits = 0;

  for (const [metric, value] of Object.entries(delta)) {
    const rate = rates[metric as keyof EngagementDelta];
    if (!rate || value <= 0) continue;

    const credits = Math.floor(value * rate);
    if (credits === 0) continue;

    totalCredits += credits;

    // Record in ledger
    await prisma.creditLedger.create({
      data: {
        userId,
        brandId,
        delta: credits,
        reason: `engagement_${network.toLowerCase()}_${metric}`,
        refType: postId ? "post" : "channel",
        refId: postId || channelId,
        metadata: {
          platform: network,
          metric,
          value,
          rate,
        },
      },
    });
  }

  return totalCredits;
}

export async function calculateEngagementDelta(
  postId: string,
  newMetrics: Partial<EngagementDelta>
): Promise<Partial<EngagementDelta>> {
  // Get last snapshot
  const lastSnapshot = await prisma.engagementSnapshot.findFirst({
    where: { postId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastSnapshot) {
    return newMetrics; // First snapshot, all metrics are new
  }

  // Calculate delta
  return {
    views: Math.max(0, (newMetrics.views || 0) - lastSnapshot.views),
    likes: Math.max(0, (newMetrics.likes || 0) - lastSnapshot.likes),
    comments: Math.max(0, (newMetrics.comments || 0) - lastSnapshot.comments),
    shares: Math.max(0, (newMetrics.shares || 0) - lastSnapshot.shares),
    saves: Math.max(0, (newMetrics.saves || 0) - (lastSnapshot.saves || 0)),
  };
}
```

#### 10.3 Metrics Sync Worker

**File:** `apps/worker/src/workers/metrics-sync.ts`

```typescript
import { Queue } from "bullmq";
import { prisma } from "@postline/db";
import { composio } from "@postline/integrations/composio-client";
import { awardEngagementCredits, calculateEngagementDelta } from "@postline/core/engagement-credits";

export const metricsQueue = new Queue("metrics-sync", {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
});

// Sync metrics for a post
export async function syncPostMetrics(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      channel: {
        include: {
          brand: { include: { owner: true } },
        },
      },
    },
  });

  if (!post || !post.externalId || !post.channel.composioConnectionId) {
    return;
  }

  try {
    // Fetch metrics from platform via Composio
    const metrics = await fetchMetricsViaComposio(
      post.channel.composioConnectionId,
      post.channel.network,
      post.externalId
    );

    // Calculate delta
    const delta = await calculateEngagementDelta(postId, metrics);

    // Award credits for delta
    const creditsEarned = await awardEngagementCredits({
      userId: post.channel.brand.ownerId,
      brandId: post.channel.brandId,
      postId: post.id,
      channelId: post.channel.id,
      network: post.channel.network,
      delta,
    });

    // Save new snapshot
    await prisma.engagementSnapshot.create({
      data: {
        postId: post.id,
        channelId: post.channel.id,
        views: metrics.views || 0,
        likes: metrics.likes || 0,
        comments: metrics.comments || 0,
        shares: metrics.shares || 0,
        saves: metrics.saves || 0,
        lastSync: new Date(),
      },
    });

    console.log(`Post ${postId}: Awarded ${creditsEarned} credits for engagement`);
  } catch (error) {
    console.error(`Failed to sync metrics for post ${postId}:`, error);
  }
}

async function fetchMetricsViaComposio(
  connectionId: string,
  network: string,
  externalId: string
) {
  // Platform-specific metrics fetching via Composio
  switch (network) {
    case "YOUTUBE": {
      const result = await composio.executeAction({
        connectionId,
        action: "YOUTUBE_GET_VIDEO_STATS",
        params: { videoId: externalId },
      });
      return {
        views: result.data.viewCount,
        likes: result.data.likeCount,
        comments: result.data.commentCount,
        shares: 0,
      };
    }

    case "INSTAGRAM": {
      const result = await composio.executeAction({
        connectionId,
        action: "INSTAGRAM_GET_MEDIA_INSIGHTS",
        params: { mediaId: externalId },
      });
      return {
        views: result.data.reach,
        likes: result.data.like_count,
        comments: result.data.comments_count,
        shares: result.data.shares,
        saves: result.data.saved,
      };
    }

    case "TIKTOK": {
      const result = await composio.executeAction({
        connectionId,
        action: "TIKTOK_GET_VIDEO_STATS",
        params: { videoId: externalId },
      });
      return {
        views: result.data.view_count,
        likes: result.data.like_count,
        comments: result.data.comment_count,
        shares: result.data.share_count,
      };
    }

    // Add other platforms...

    default:
      return {};
  }
}

// Schedule metrics sync for all recent posts (cron job)
export async function scheduleMetricsSync() {
  const recentPosts = await prisma.post.findMany({
    where: {
      status: "POSTED",
      publishedAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    },
    select: { id: true },
  });

  for (const post of recentPosts) {
    await metricsQueue.add("sync", { postId: post.id }, {
      delay: Math.random() * 60000, // Stagger requests
    });
  }
}

// Run every 6 hours
setInterval(scheduleMetricsSync, 6 * 60 * 60 * 1000);
```

#### 10.4 Real-Time Webhooks (Optional)

Composio supports webhooks for instant engagement notifications.

**File:** `apps/web/src/app/api/webhooks/composio/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { awardEngagementCredits } from "@postline/core/engagement-credits";
import { prisma } from "@postline/db";

/**
 * POST /api/webhooks/composio
 * Receive engagement events from Composio webhooks
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Verify webhook signature (TODO: Add Composio signature verification)

    const { event, data } = payload;

    // Handle different event types
    switch (event) {
      case "youtube.video.view":
      case "instagram.post.like":
      case "tiktok.video.view":
      // ... etc
      {
        const post = await prisma.post.findFirst({
          where: { externalId: data.postId },
          include: {
            channel: {
              include: {
                brand: true,
              },
            },
          },
        });

        if (!post) break;

        // Award credits immediately
        await awardEngagementCredits({
          userId: post.channel.brand.ownerId,
          brandId: post.channel.brandId,
          postId: post.id,
          channelId: post.channel.id,
          network: post.channel.network,
          delta: {
            [data.metric]: data.value,
          },
        });

        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
```

---

## Summary

### What This Achieves

✅ **Eliminates custom OAuth development** for 15+ platforms  
✅ **Avoids 2-4 month app review processes** (Meta, TikTok, LinkedIn, YouTube)  
✅ **Reduces maintenance burden** - Composio handles token refresh  
✅ **Keeps existing architecture** - adapter pattern preserved  
✅ **Zero cost** - free tier covers all usage  
✅ **Engagement-based credits** - users earn from social performance  
✅ **Real-time credit awarding** - instant gratification  

### Timeline
- **Phase 1-2 (Days 1-3):** Core infrastructure
- **Phase 3-4 (Days 4-7):** API routes + UI
- **Phase 5 (Days 8-9):** Worker updates
- **Week 2:** Testing + Migration
- **Week 3:** Production rollout

### Next Steps
1. Get COMPOSIO_API_KEY from composio.dev
2. Run database migration
3. Install composio-core package
4. Implement ComposioAdapter class
5. Create API routes for OAuth flow
6. Build UI components
7. Test with YouTube + Instagram
8. Roll out to production
9. Mark existing channels as NEEDS_RECONNECT
10. Monitor reconnection rate

---

## Questions?

- **What about rate limits?** Composio handles rate limiting automatically
- **What if Composio goes down?** Legacy adapters remain as fallback for existing posts
- **How to rollback?** Simply revert getAdapter() factory to use legacy adapters
- **Cost concerns?** 100K free calls/month >> 6K actual usage
- **Data security?** Composio is SOC2 + ISO27001 certified, same as our current setup

Ready to implement! 🚀
