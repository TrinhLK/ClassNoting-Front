// Public identifiers for showing navigation; they do not confer server authority.
export const SYSTEM_ADMIN_EMAIL = "trinhlk.vnu@gmail.com";
export const SYSTEM_ADMIN_UID = "3DiIdasz33YD30R69VFjPJdb9S83";
export function isSystemAdminIdentity(user: { uid?: string; email?: string | null; emailVerified?: boolean } | null | undefined) {
  return user?.uid === SYSTEM_ADMIN_UID && user.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL && user.emailVerified === true;
}
