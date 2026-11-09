/** OAuth service-account exchange using Web Crypto and fetch for Workers. */
export async function getGoogleServiceToken(account: { client_email: string; private_key: string }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const endpoint = "https://oauth2.googleapis.com/token";
  const scope = ["cloud-platform", "firebase.database", "firebase.messaging", "identitytoolkit", "userinfo.email"]
    .map(name => `https://www.googleapis.com/auth/${name}`).join(" ");
  const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope, aud: endpoint, iat: now, exp: now + 3600 })}`;
  const der = Buffer.from(account.private_key.replace(/-----[^-]+-----|\s/g, ""), "base64");
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(payload));
  const assertion = `${payload}.${Buffer.from(signature).toString("base64url")}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google service authentication failed (${response.status})`);
  const token = await response.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token || !token.expires_in) throw new Error("Invalid Google service authentication response");
  return { access_token: token.access_token, expires_in: token.expires_in };
}
