import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/extension/store/route";
import { STORE_EXTENSION_ID, EXTENSION_STORE_URL } from "@/app/lib/extension-config";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [404, "<title>Chrome Web Store</title>", false],
  [200, `<title>Chrome Web Store</title>${STORE_EXTENSION_ID}`, false],
  [200, `<title>Just a moment</title>${STORE_EXTENSION_ID}`, false],
  [200, `<title>ClassNoting — Ghi chú cuộc họp tự động - Chrome Web Store</title>${STORE_EXTENSION_ID}`, true],
])("only enables a verified public listing (HTTP %s)", async (status, html, published) => {
  const fetchMock = vi.fn(async () => new Response(String(html), { status: Number(status) }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await (await GET()).json()).toEqual({ published });
  expect(fetchMock.mock.calls[0][0]).toBe(EXTENSION_STORE_URL);
});
it("keeps installation disabled when storefront lookup fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network unavailable"); }));
  expect(await (await GET()).json()).toEqual({ published: false });
});
