// Authorized admin allowlist — the single source of truth for which
// signed-in accounts may use the CRM (/admin) and the admin configurator
// (/admin/configurator).
//
// This MUST stay in sync with firestore.rules (isEmailAdmin / isUidAdmin).
// The Firestore rules are the real security boundary — they block every
// data read/write for anyone not listed here. These client-side checks
// exist so an unauthorized account that successfully authenticates (e.g.
// any Google account) is cleanly denied access instead of landing in the
// admin UI with permission errors.
//
// To add an admin: add their email/UID here AND in firestore.rules, then
// deploy the rules (npm run rules:deploy).

export const ADMIN_EMAILS = ['michael@simcoedecks.ca', 'kevin@eclipsepergola.ca'];
export const ADMIN_UIDS = ['CmvwjS0C6BRm7QJJUnEwAODp5ak2'];

export function isAuthorizedAdmin(
  u: { email: string | null; uid: string } | null | undefined
): boolean {
  if (!u) return false;
  const email = (u.email || '').toLowerCase().trim();
  return ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(u.uid);
}
