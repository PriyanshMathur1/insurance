interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitInfo>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const info = rateLimitMap.get(key);

  if (info && info.resetTime > now) {
    if (info.count >= maxRequests) {
      return false; // Rate limit exceeded
    }
    info.count++;
    return true; // OK
  }

  // Create or reset
  rateLimitMap.set(key, {
    count: 1,
    resetTime: now + windowMs,
  });

  cleanupRateLimitsIfNeeded();

  return true; // OK
}

// Maximum number of entries allowed in the rate limit map to prevent OOM
const MAX_ENTRIES = 10000;

function cleanupRateLimitsIfNeeded() {
  if (rateLimitMap.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, info] of rateLimitMap.entries()) {
      if (info.resetTime <= now) {
        rateLimitMap.delete(key);
      }
    }

    // If still too large after cleanup, remove the oldest entries
    if (rateLimitMap.size > MAX_ENTRIES) {
        let count = 0;
        const entriesToRemove = rateLimitMap.size - MAX_ENTRIES;
        for (const key of rateLimitMap.keys()) {
            if (count >= entriesToRemove) break;
            rateLimitMap.delete(key);
            count++;
        }
    }
  }
}
