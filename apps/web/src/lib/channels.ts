// OWNED BY: web-platform agent. Channel persistence helpers (server-only).
import "server-only";
import { prisma, Prisma } from "@postline/db";
import type { ConnectTarget, Network } from "@postline/core";
import { encryptCredentials, encryptString, decryptString } from "@postline/core/crypto";
import { forbidden } from "./http";
import { ownerChannelKeys, ownerPlan } from "./billing";

/** Fields safe to send to the client. NEVER include credentialsEnc. */
export const channelPublicSelect = {
  id: true,
  brandId: true,
  network: true,
  externalId: true,
  name: true,
  username: true,
  avatarUrl: true,
  health: true,
  lastError: true,
  expiresAt: true,
  extras: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChannelSelect;

export interface SaveResult {
  connected: number;
  skipped: number;
  channels: { id: string; name: string; network: Network }[];
}

/**
 * Upsert targets on (brandId, network, externalId), enforcing the owner's plan channel limit
 * (distinct network+externalId across all brands the owner owns). Already-known channels never count twice.
 * `strict`: throw 403 when nothing can be saved because of the limit (credentials flow); otherwise skip extras (oauth).
 */
export async function saveTargets(brandId: string, targets: ConnectTarget[], opts: { strict?: boolean } = {}): Promise<SaveResult> {
  const { ownerId, limits } = await ownerPlan(brandId);
  const keys = await ownerChannelKeys(ownerId);
  const result: SaveResult = { connected: 0, skipped: 0, channels: [] };
  for (const t of targets) {
    const key = `${t.network}:${t.externalId}`;
    if (!keys.has(key) && keys.size >= limits.channels) {
      result.skipped++;
      continue;
    }
    keys.add(key);
    const data = {
      name: t.name,
      username: t.username ?? null,
      avatarUrl: t.avatarUrl ?? null,
      credentialsEnc: encryptCredentials(t.credentials),
      expiresAt: typeof t.credentials.expiresAt === "number" ? new Date(t.credentials.expiresAt) : null,
      scopes: t.scopes ?? [],
      extras: (t.extras ?? {}) as Prisma.InputJsonValue,
      health: "OK" as const,
      lastError: Prisma.DbNull,
    };
    const ch = await prisma.channel.upsert({
      where: { brandId_network_externalId: { brandId, network: t.network, externalId: t.externalId } },
      create: { brandId, network: t.network, externalId: t.externalId, ...data },
      update: data,
      select: { id: true, name: true, network: true },
    });
    result.connected++;
    result.channels.push(ch);
  }
  if (opts.strict && result.connected === 0 && result.skipped > 0)
    throw forbidden(`Your ${limits.label} plan allows ${limits.channels} channels. Disconnect one or upgrade to add more.`);
  return result;
}

/* ───────── Pending selection (credentials flow returning several targets) ───────── */

interface PendingPayload {
  brandId: string;
  network: Network;
  targets: ConnectTarget[];
  exp: number;
}

/** AES-GCM sealed (confidential + tamper-proof) token carrying targets with credentials; valid 10 minutes. */
export function sealPending(brandId: string, network: Network, targets: ConnectTarget[]): string {
  const payload: PendingPayload = { brandId, network, targets, exp: Date.now() + 10 * 60_000 };
  return encryptString(JSON.stringify(payload));
}

export function openPending(token: string, brandId: string, network: Network): ConnectTarget[] | null {
  try {
    const p = JSON.parse(decryptString(token)) as PendingPayload;
    if (p.brandId !== brandId || p.network !== network || p.exp < Date.now()) return null;
    return p.targets;
  } catch {
    return null;
  }
}

export const publicTarget = (t: ConnectTarget) => ({
  externalId: t.externalId,
  name: t.name,
  username: t.username ?? null,
  avatarUrl: t.avatarUrl ?? null,
});
