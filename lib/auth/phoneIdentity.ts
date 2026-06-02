const PHONE_EMAIL_DOMAIN = 'phone.tryggd.local';
const TRYGGD_ID_EMAIL_DOMAIN = 'login.tryggd.local';
const TRYGGD_ID_PATTERN = /^[a-z0-9._]{3,24}$/;

export function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const collapsed = trimmed.replace(/[\s\-().]/g, '');
  const normalized =
    collapsed.startsWith('00') ? `+${collapsed.slice(2)}` :
    collapsed.startsWith('+') ? collapsed :
    `+${collapsed}`;

  const digitsOnly = normalized.replace(/[^\d]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return null;
  }

  return `+${digitsOnly}`;
}

export function normalizeTryggdId(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

export function isValidTryggdId(input: string): boolean {
  return TRYGGD_ID_PATTERN.test(normalizeTryggdId(input));
}

export function buildSyntheticEmailFromPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^\d]/g, '');
  return `phone-${digits}@${PHONE_EMAIL_DOMAIN}`;
}

export function buildSyntheticEmailFromTryggdId(tryggdId: string): string {
  return `tryggdid-${normalizeTryggdId(tryggdId)}@${TRYGGD_ID_EMAIL_DOMAIN}`;
}

export function isSyntheticAuthEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.endsWith(`@${PHONE_EMAIL_DOMAIN}`) || email.endsWith(`@${TRYGGD_ID_EMAIL_DOMAIN}`);
}

export function resolveAuthEmailCandidates(identifier: string): string[] {
  const trimmed = identifier.trim().toLowerCase();
  if (!trimmed) return [];

  if (trimmed.includes('@')) {
    return [trimmed];
  }

  const candidates: string[] = [];
  if (isValidTryggdId(trimmed)) {
    candidates.push(buildSyntheticEmailFromTryggdId(trimmed));
  }

  const normalizedPhone = normalizePhoneNumber(trimmed);
  if (normalizedPhone) {
    candidates.push(buildSyntheticEmailFromPhone(normalizedPhone));
  }

  return [...new Set(candidates)];
}
