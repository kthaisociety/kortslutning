export const ALLOWED_EMAIL_DOMAIN = "kthais.com";
export const DOMAIN_ERROR_MESSAGE = `Only @${ALLOWED_EMAIL_DOMAIN} accounts can sign in.`;

/** True only for a verified address whose domain is exactly ALLOWED_EMAIL_DOMAIN (no subdomains). */
export function isAllowedEmail(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined,
): boolean {
  if (!email || emailVerified !== true) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0) return false;
  return email.slice(at + 1).toLowerCase() === ALLOWED_EMAIL_DOMAIN;
}
