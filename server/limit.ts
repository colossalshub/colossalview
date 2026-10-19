export interface Limiter {
  tryWindow(bucket: string, limit: number, windowMs: number): boolean;
  tryDaily(bucket: string, limit: number): boolean;
  tryBoth(windowBucket: string, windowLimit: number, windowMs: number, dailyBucket: string, dailyLimit: number): boolean;
  tryFlight(bucket: string, max: number): (() => void) | null;
  exhaustDaily(bucket: string): void;
}

export function createLimiter(now: () => number = Date.now): Limiter {
  const windows = new Map<string, number[]>();
  const days = new Map<string, { day: string; count: number }>();
  const flights = new Map<string, number>();

  function dayKey(): string {
    return new Date(now()).toISOString().slice(0, 10);
  }

  function windowRoom(bucket: string, limit: number, windowMs: number): number[] | null {
    const current = now();
    const stamps = (windows.get(bucket) ?? []).filter((stamp) => current - stamp < windowMs);
    if (stamps.length >= limit) {
      windows.set(bucket, stamps);
      return null;
    }
    return stamps;
  }

  function dailyRoom(bucket: string, limit: number): number | null {
    const day = dayKey();
    const entry = days.get(bucket);
    const count = entry && entry.day === day ? entry.count : 0;
    if (count >= limit) return null;
    return count;
  }

  return {
    tryWindow(bucket, limit, windowMs) {
      const stamps = windowRoom(bucket, limit, windowMs);
      if (!stamps) return false;
      stamps.push(now());
      windows.set(bucket, stamps);
      return true;
    },
    tryDaily(bucket, limit) {
      const count = dailyRoom(bucket, limit);
      if (count === null) return false;
      days.set(bucket, { day: dayKey(), count: count + 1 });
      return true;
    },
    tryBoth(windowBucket, windowLimit, windowMs, dailyBucket, dailyLimit) {
      const stamps = windowRoom(windowBucket, windowLimit, windowMs);
      const count = dailyRoom(dailyBucket, dailyLimit);
      if (!stamps || count === null) return false;
      stamps.push(now());
      windows.set(windowBucket, stamps);
      days.set(dailyBucket, { day: dayKey(), count: count + 1 });
      return true;
    },
    tryFlight(bucket, max) {
      const current = flights.get(bucket) ?? 0;
      if (current >= max) return null;
      flights.set(bucket, current + 1);
      return () => {
        flights.set(bucket, Math.max(0, (flights.get(bucket) ?? 1) - 1));
      };
    },
    exhaustDaily(bucket) {
      days.set(bucket, { day: dayKey(), count: Number.MAX_SAFE_INTEGER });
    },
  };
}
