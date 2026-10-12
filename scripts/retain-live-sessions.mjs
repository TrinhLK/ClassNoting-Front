// Run with server credentials: node --env-file=.env.local scripts/retain-live-sessions.mjs [--apply]
// Default is a read-only count. --apply removes only the old TTL field.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldPath, FieldValue } from "firebase-admin/firestore";
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const db = getFirestore();
let cursor;
let count = 0;
while (true) {
  let query = db.collection("live_sessions").orderBy(FieldPath.documentId()).limit(400);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  const batch = db.batch();
  let changed = 0;
  for (const doc of page.docs) {
    if (doc.data().expireAt !== undefined) {
      batch.update(doc.ref, { expireAt: FieldValue.delete() });
      changed++;
    }
  }
  if (changed && process.argv.includes("--apply")) await batch.commit();
  count += changed;
  cursor = page.docs.at(-1);
}
console.log(`${process.argv.includes("--apply") ? "Retained" : "Would retain"} ${count} legacy live sessions.`);
