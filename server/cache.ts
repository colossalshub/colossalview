export interface TtlCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

export function createCache(now: () => number = Date.now): TtlCache {
  const entries = new Map<string, { expiresAt: number; value: unknown }>();
  return {
    get<T>(key: string): T | undefined {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value as T;
    },
    set<T>(key: string, value: T, ttlMs: number) {
      entries.set(key, { expiresAt: now() + ttlMs, value });
    },
  };
}
