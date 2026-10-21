import { SYSTEM_ADMIN_UID } from "./admin-identity";

export const FREE_MEETING_LIMIT = 10;
export const MAX_GRANTED_MEETINGS = 1_000_000;
export function effectiveAiQuota(uid: string, policy?: Record<string, any>) {
  const limit = Number.isSafeInteger(policy?.limit) && policy!.limit >= FREE_MEETING_LIMIT && policy!.limit <= MAX_GRANTED_MEETINGS
    ? policy!.limit as number : FREE_MEETING_LIMIT;
  const unlimited = uid === SYSTEM_ADMIN_UID || policy?.unlimited === true;
  return { limit, unlimited };
}

type Pending = { requestId: string; expiresAt: number };
export function normalizeAiUsage(data: Record<string, any> | undefined, now = Date.now()) {
  if (data?.schemaVersion === 2) {
    return {
      usedCount: Number.isSafeInteger(data.usedCount) && data.usedCount >= 0 ? data.usedCount as number : 0,
      legacyMeetingIds: (Array.isArray(data.legacyMeetingIds) ? data.legacyMeetingIds : []) as string[],
      pending: Object.fromEntries(Object.entries((data.pending || {}) as Record<string, Pending>).filter(([, entry]) => entry.expiresAt > now)),
    };
  }
  // Existing ten-meeting ledgers migrate lazily; their used IDs remain valid.
  const entries = Object.entries((data?.meetings || {}) as Record<string, { state: string; requestId: string; expiresAt: number }>);
  const used = entries.filter(([, entry]) => entry.state === "used");
  return { usedCount: used.length, legacyMeetingIds: used.map(([id]) => id), pending: Object.fromEntries(
    entries.filter(([, entry]) => entry.state === "pending" && entry.expiresAt > now).map(([id, entry]) => [id, { requestId: entry.requestId, expiresAt: entry.expiresAt }])
  ) };
}
export function aiQuotaStatus(uid: string, usage?: Record<string, any>, policy?: Record<string, any>) {
  const quota = effectiveAiQuota(uid, policy);
  const ledger = normalizeAiUsage(usage);
  const pending = Object.keys(ledger.pending).length;
  return { freeLimit: quota.unlimited ? null : quota.limit, unlimited: quota.unlimited,
    freeUsed: ledger.usedCount, freePending: pending,
    freeRemaining: quota.unlimited ? null : Math.max(0, quota.limit - ledger.usedCount - pending) };
}
