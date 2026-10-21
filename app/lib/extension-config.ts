// ID assigned to the uploaded Chrome Web Store item (not the unpacked build).
export const STORE_EXTENSION_ID = "dgiijpohmfieghplibimafomgajafmfl";
export const EXTENSION_STORE_PUBLISHED = false;
export const EXTENSION_STORE_URL = `https://chromewebstore.google.com/detail/${STORE_EXTENSION_ID}`;
export const EXTENSION_IDS = Array.from(new Set([
  STORE_EXTENSION_ID,
  process.env.NEXT_PUBLIC_EXTENSION_ID || "",
].filter(id => /^[a-p]{32}$/.test(id))));

type Runtime = { sendMessage?: (id: string, message: unknown) => Promise<unknown> };
declare const chrome: { runtime?: Runtime } | undefined;

export async function messageExtension(id: string, message: unknown): Promise<unknown> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return null;
  // A missing extension must not leave the guide stuck waiting indefinitely.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(id, message),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 3000); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
