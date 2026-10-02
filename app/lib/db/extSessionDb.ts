import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import type { ExtSession } from "../ext-sessions";

const COLLECTION = "ext_sessions";

/**
 * Client-safe readers cho ext_sessions (không dùng Admin SDK).
 * Yêu cầu Firestore rules: user chỉ đọc doc có ownerUid == uid của mình.
 */
export async function getLiveExtSessions(ownerUid: string): Promise<ExtSession[]> {
  const q = query(
    collection(db, COLLECTION),
    where("ownerUid", "==", ownerUid),
    where("status", "==", "live")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as ExtSession)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function subscribeToExtSession(
  sessionId: string,
  onUpdate: (data: ExtSession | null) => void
) {
  const ref = doc(db, COLLECTION, sessionId);
  return onSnapshot(
    ref,
    (snap) => onUpdate(snap.exists() ? (snap.data() as ExtSession) : null),
    () => onUpdate(null)
  );
}
