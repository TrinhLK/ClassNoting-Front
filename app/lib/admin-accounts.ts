import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { aiQuotaStatus, effectiveAiQuota, FREE_MEETING_LIMIT, MAX_GRANTED_MEETINGS } from "./ai-quota";
import { SYSTEM_ADMIN_UID } from "./admin-identity";
import { AiAccountError } from "./ai-account";

export async function listAdminAccounts(cursor?: string, email?: string) {
  const auth = getAdminAuth();
  const result = email
    ? { users: [await auth.getUserByEmail(email)], pageToken: undefined }
    : await auth.listUsers(100, cursor);
  const db = getAdminDb();
  const refs = result.users.map(user => ({
    usage: db.collection("server_ai_usage").doc(user.uid), policy: db.collection("server_ai_policies").doc(user.uid),
    activity: db.collection("server_account_activity").doc(user.uid), key: db.collection("server_ai_keys").doc(user.uid),
  }));
  const [usages, policies, activities, keys] = refs.length ? await Promise.all([
    db.getAll(...refs.map(ref => ref.usage)), db.getAll(...refs.map(ref => ref.policy)),
    db.getAll(...refs.map(ref => ref.activity)),
    // Credential bytes never enter this listing path, even on the server.
    db.getAll(...refs.map(ref => ref.key), { fieldMask: ["removed"] }),
  ]) : [[], [], [], []];
  return {
    accounts: result.users.map((user, i) => {
      const usage = usages[i].data();
      const lastSignInAt = Date.parse(user.metadata.lastSignInTime || "") || null;
      const lastSeenAt = Math.max(activities[i].data()?.lastSeenAt || 0, usage?.updatedAt || 0, lastSignInAt || 0) || null;
      const quota = aiQuotaStatus(user.uid, usage, policies[i].data());
      return { uid: user.uid, email: user.email || "", displayName: user.displayName || "", disabled: user.disabled,
        emailVerified: user.emailVerified, isAdmin: user.uid === SYSTEM_ADMIN_UID,
        createdAt: Date.parse(user.metadata.creationTime || "") || null, lastSignInAt, lastSeenAt,
        hasPersonalKey: keys[i].exists && keys[i].data()?.removed !== true,
        ...quota, finiteLimit: effectiveAiQuota(user.uid, policies[i].data()).limit };
    }),
    nextCursor: result.pageToken || null,
    generatedAt: Date.now(),
  };
}

export async function changeAccountQuota(adminUid: string, targetUid: string, input: unknown) {
  if (typeof targetUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) throw new AiAccountError("INVALID_ACCOUNT", "Tài khoản không hợp lệ.");
  const user = await getAdminAuth().getUser(targetUid);
  if (user.disabled) throw new AiAccountError("ACCOUNT_DISABLED", "Chỉ điều chỉnh tài khoản đang được kích hoạt.", 409);
  if (targetUid === SYSTEM_ADMIN_UID) throw new AiAccountError("ADMIN_UNLIMITED", "Tài khoản quản trị luôn có hạn mức không giới hạn.");
  const body = input as { action?: unknown; amount?: unknown; unlimited?: unknown } | null;
  if (!body || !["add", "unlimited"].includes(String(body.action))) throw new AiAccountError("INVALID_ACTION", "Thao tác không hợp lệ.");
  if (body.action === "add" && (!Number.isSafeInteger(body.amount) || (body.amount as number) < 1 || (body.amount as number) > MAX_GRANTED_MEETINGS)) {
    throw new AiAccountError("INVALID_LIMIT", "Số lượt thêm phải là số nguyên dương, tối đa 1.000.000.");
  }
  if (body.action === "unlimited" && typeof body.unlimited !== "boolean") throw new AiAccountError("INVALID_LIMIT", "Trạng thái không giới hạn không hợp lệ.");
  const db = getAdminDb();
  const ref = db.collection("server_ai_policies").doc(targetUid);
  const audit = db.collection("server_admin_audit").doc();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const previous = effectiveAiQuota(targetUid, snap.data());
    const next = { ...previous };
    if (body.action === "add") next.limit += body.amount as number;
    else next.unlimited = body.unlimited as boolean;
    if (next.limit > MAX_GRANTED_MEETINGS || next.limit < FREE_MEETING_LIMIT) throw new AiAccountError("INVALID_LIMIT", "Tổng hạn mức vượt giới hạn cho phép.");
    const now = Date.now();
    tx.set(ref, { ...next, updatedAt: now, updatedBy: adminUid });
    tx.set(audit, { adminUid, targetUid, action: body.action, amount: body.action === "add" ? body.amount : null,
      previous, next, createdAt: now });
    return { uid: targetUid, limit: next.limit, unlimited: next.unlimited };
  });
}
