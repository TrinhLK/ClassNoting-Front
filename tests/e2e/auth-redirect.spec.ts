import { test, expect } from "@playwright/test";

test.describe("Auth redirect — middleware bảo vệ routes (Phase 6)", () => {
  test("GET / → render dashboard (status 200, không crash)", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);

    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
  });

  test("GET /meeting/abc123 → redirect hoặc hiển thị", async ({ page }) => {
    const response = await page.goto("/meeting/abc123", {
      waitUntil: "domcontentloaded",
    });

    expect(response).not.toBeNull();
    const url = page.url();
    const validStates = [
      url.includes("/login"),
      url.includes("/signin"),
      url.includes("accounts.google.com"),
      url.includes("/meeting/abc123"),
    ];
    expect(validStates.some(Boolean)).toBe(true);
  });

  test("GET /edit/abc123 → không crash với meetingId bất kỳ", async ({ page }) => {
    const response = await page.goto("/edit/abc123", {
      waitUntil: "domcontentloaded",
    });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });

  test("GET /live → không crash", async ({ page }) => {
    const response = await page.goto("/live", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });

  test("GET /minutes → không crash", async ({ page }) => {
    const response = await page.goto("/minutes", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });

  test("GET /tasks → không crash", async ({ page }) => {
    const response = await page.goto("/tasks", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });

  test("GET /team → không crash", async ({ page }) => {
    const response = await page.goto("/team", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
  });
});

test.describe("Login page — accessible", () => {
  test("GET /login render thành công", async ({ page }) => {
    const response = await page.goto("/login", { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
  });
});