const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

const normalizeValue = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const titleCaseToken = (token: string) =>
    token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();

export const isAppleRelayEmail = (email?: string | null) =>
    typeof email === 'string' && email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN);

export const isLikelyGeneratedDisplayName = (value?: string | null) => {
    if (!value) {
        return false;
    }

    const trimmed = value.trim();

    return /^[a-z0-9]{8,}$/i.test(trimmed) && /[a-z]/i.test(trimmed) && /\d/.test(trimmed);
};

const getPreferredMetadataName = (user: any): string | null => {
    const metadata = user?.user_metadata ?? {};
    const fullName =
        normalizeValue(metadata.full_name) ||
        normalizeValue(metadata.name) ||
        normalizeValue(metadata.display_name);

    if (fullName) {
        return fullName;
    }

    const givenName = normalizeValue(metadata.given_name) || normalizeValue(metadata.first_name);
    const familyName = normalizeValue(metadata.family_name) || normalizeValue(metadata.last_name);

    if (givenName && familyName) {
        return `${givenName} ${familyName}`;
    }

    return givenName || familyName || null;
};

const getEmailBasedName = (email?: string | null): string | null => {
    const normalizedEmail = normalizeValue(email);
    if (!normalizedEmail || isAppleRelayEmail(normalizedEmail)) {
        return null;
    }

    const localPart = normalizedEmail.split('@')[0]?.trim();
    if (!localPart || isLikelyGeneratedDisplayName(localPart)) {
        return null;
    }

    const cleaned = localPart.replace(/[._-]+/g, ' ').trim();
    if (!cleaned) {
        return null;
    }

    return cleaned
        .split(/\s+/)
        .map(titleCaseToken)
        .join(' ');
};

export const deriveDisplayName = (user: any, fallback = 'User') =>
    getPreferredMetadataName(user) || getEmailBasedName(user?.email) || fallback;
