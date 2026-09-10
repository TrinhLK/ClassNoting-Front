import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStoreMock = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStoreMock),
}));

describe("GET /api/drive/auth — OAuth state + redirect (bug 4.1)", () => {
  beforeEach(() => {
    cookieStoreMock.set.mockReset();
    vi.resetModules();
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/drive/callback";
  });

  const loadRoute = async () => {
    return await import("@/app/api/drive/auth/route");
  };

  it("trả 500 khi thiếu GOOGLE_CLIENT_ID", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { GET } = await loadRoute();

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("GOOGLE_CLIENT_ID");
  });

  it("set cookie drive_oauth_state với httpOnly=true", async () => {
    const { GET } = await loadRoute();
    await GET();

    expect(cookieStoreMock.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStoreMock.set.mock.calls[0];
    expect(name).toBe("drive_oauth_state");
    expect(value).toBeTruthy();
    expect(value.length).toBeGreaterThan(20);
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(10 * 60);
    expect(options.path).toBe("/");
  });

  it("cookie secure=true khi NODE_ENV=production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { GET } = await loadRoute();
    await GET();

    expect(cookieStoreMock.set.mock.calls[0][2].secure).toBe(true);
    process.env.NODE_ENV = original;
  });

  it("cookie secure=false khi NODE_ENV=development", async () => {
    process.env.NODE_ENV = "development";
    const { GET } = await loadRoute();
    await GET();

    expect(cookieStoreMock.set.mock.calls[0][2].secure).toBe(false);
  });

  it("redirect URL đến Google OAuth với đầy đủ params", async () => {
    const { GET } = await loadRoute();
    const res = await GET();

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("accounts.google.com/o/oauth2/v2/auth");

    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/drive/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("state param trong URL phải khớp với cookie (chống CSRF)", async () => {
    const { GET } = await loadRoute();
    const res = await GET();

    const url = new URL(res.headers.get("location")!);
    const stateInUrl = url.searchParams.get("state");
    const stateInCookie = cookieStoreMock.set.mock.calls[0][1];

    expect(stateInUrl).toBe(stateInCookie);
    expect(stateInUrl).toBeTruthy();
    expect(stateInUrl!.length).toBeGreaterThan(30);
  });

  it("scope yêu cầu drive.readonly + userinfo.profile", async () => {
    const { GET } = await loadRoute();
    const res = await GET();

    const url = new URL(res.headers.get("location")!);
    const scope = url.searchParams.get("scope");
    expect(scope).toContain("drive.readonly");
    expect(scope).toContain("userinfo.profile");
  });

  it("dùng GOOGLE_REDIRECT_URI default khi không set env", async () => {
    delete process.env.GOOGLE_REDIRECT_URI;
    const { GET } = await loadRoute();
    const res = await GET();

    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/drive/callback"
    );
  });
});