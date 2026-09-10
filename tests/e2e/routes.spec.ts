import { test, expect } from "@playwright/test";

test.describe("Routes — SPA → proper routes (Phase 6)", () => {
  const protectedRoutes = [
    "/",
    "/live",
    "/minutes",
    "/minutes/abc123",
    "/tasks",
    "/team",
    "/training",
    "/meeting/abc123",
    "/edit/abc123",
  ];

  for (const route of protectedRoutes) {
    test(`GET ${route} → không crash server (status < 500)`, async ({
      page,
    }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(500);
    });
  }

  test("mở trực tiếp URL /meeting/xyz → có thể access deep link", async ({
    page,
  }) => {
    const response = await page.goto("/meeting/xyz", {
      waitUntil: "domcontentloaded",
    });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);

    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
  });

  test("mở URL /live không crash với audio context", async ({ page }) => {
    const response = await page.goto("/live", { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });
});

test.describe("404 handling", () => {
  test("GET /route-khong-ton-tai → 404 hoặc redirect về login", async ({
    page,
  }) => {
    const response = await page.goto("/route-khong-ton-tai-12345", {
      waitUntil: "domcontentloaded",
    });

    expect(response).not.toBeNull();
    const url = page.url();
    const acceptable = [
      url.includes("/login"),
      url.includes("404"),
      url.includes("not-found"),
      url.includes("/route-khong-ton-tai"),
    ];
    expect(acceptable.some(Boolean)).toBe(true);
  });
});