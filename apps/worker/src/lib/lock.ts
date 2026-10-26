import { randomUUID } from "node:crypto";
import type IORedis from "ioredis";

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export const CHANNEL_LOCK_TTL_MS = 120_000;

export function channelLockKey(channelId: string) {
  return `postline:lock:channel:${channelId}`;
}

/** SET NX PX lock. Returns a release function, or null if already held. */
export async function tryLock(
  redis: IORedis,
  key: string,
  ttlMs = CHANNEL_LOCK_TTL_MS,
): Promise<(() => Promise<void>) | null> {
  const token = randomUUID();
  const ok = await redis.set(key, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;
  return async () => {
    await redis.eval(RELEASE, 1, key, token);
  };
}
