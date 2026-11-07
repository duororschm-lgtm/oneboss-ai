/** Username identities live in a separate, non-deliverable namespace, never in a real mailbox. */
export function normalizeAccount(value: string) {
  const username = value.normalize('NFKC').trim().toLowerCase();
  if (!/^[\p{Script=Han}a-z0-9_]{3,32}$/u.test(username)) throw new Error('ACCOUNT_INVALID');
  return username;
}
export async function accountEmail(value: string) {
  const username = normalizeAccount(value);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`oneboss:username:v1:${username}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex}@accounts.oneboss.invalid`;
}
export async function loginEmail(value: string) {
  const account = value.trim();
  return account.includes('@') ? account : accountEmail(account);
}
