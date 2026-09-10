import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../../app/lib/rate-limit";

describe("checkRateLimit — rate limit cho API (bug 6.2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("request đầu tiên luôn được phép", () => {
    const result = checkRateLimit("1.1.1.1", 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("cho phép đúng maxRequests lần trong window", () => {
    const ip = "2.2.2.2";
    for (let i = 1; i <= 10; i++) {
      const r = checkRateLimit(ip, 10, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(10 - i);
    }
  });

  it("từ chối khi vượt quá maxRequests", () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, 60_000);
    }
    const blocked = checkRateLimit(ip, 10, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reset counter khi hết windowMs", () => {
    const ip = "4.4.4.4";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, 60_000);
    }
    expect(checkRateLimit(ip, 10, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    const afterReset = checkRateLimit(ip, 10, 60_000);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(9);
  });

  it("counter tách biệt giữa các IP", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("5.5.5.5", 10, 60_000);
    }
    const otherIp = checkRateLimit("6.6.6.6", 10, 60_000);
    expect(otherIp.allowed).toBe(true);
    expect(otherIp.remaining).toBe(9);
  });

  it("counter tách biệt giữa các key prefix (vd email:ip vs proxy-file:ip)", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("email:7.7.7.7", 10, 60_000);
    }
    const proxyCheck = checkRateLimit("proxy-file:7.7.7.7", 10, 60_000);
    expect(proxyCheck.allowed).toBe(true);
  });

  it("windowMs khác nhau hoạt động độc lập", () => {
    const ip = "8.8.8.8";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip, 5, 1000);
    }
    expect(checkRateLimit(ip, 5, 1000).allowed).toBe(false);

    vi.advanceTimersByTime(1100);
    expect(checkRateLimit(ip, 5, 1000).allowed).toBe(true);
  });
});
