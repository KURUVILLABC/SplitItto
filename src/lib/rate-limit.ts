import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();
let redisPromise: Promise<import("@upstash/redis").Redis | null> | undefined;

async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (!serverEnv.UPSTASH_REDIS_REST_URL || !serverEnv.UPSTASH_REDIS_REST_TOKEN) return null;
  redisPromise ??= import("@upstash/redis").then(({ Redis }) =>
    Redis.fromEnv(),
  );
  return redisPromise;
}

export async function enforceRateLimit(request: Request): Promise<void> {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const redis = await getRedis();
  if (redis) {
    const bucket = Math.floor(Date.now() / serverEnv.RATE_LIMIT_WINDOW_MS);
    const count = await redis.incr(`rate:${key}:${bucket}`);
    if (count === 1) await redis.expire(`rate:${key}:${bucket}`, Math.ceil(serverEnv.RATE_LIMIT_WINDOW_MS / 1000));
    if (count > serverEnv.RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpError("Too many requests. Please wait a moment and try again.", 429);
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new HttpError("Rate limiting is not configured for this deployment.", 503);
  }
  const now = Date.now();
  const counter = counters.get(key);
  if (!counter || counter.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + serverEnv.RATE_LIMIT_WINDOW_MS });
    return;
  }
  counter.count += 1;
  if (counter.count > serverEnv.RATE_LIMIT_MAX_REQUESTS) {
    throw new HttpError("Too many requests. Please wait a moment and try again.", 429);
  }
}
