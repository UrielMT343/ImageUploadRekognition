import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

export const enhanceLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(3, "10 m"),
    analytics: true,
    prefix: "rl:enhance",
});

export const enhanceDailyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(20, "1 d"),
    analytics: true,
    prefix: "rl:enhance:daily",
});
