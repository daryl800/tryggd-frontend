type TranslateFn = (key: string) => string;

const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;

export function normalizeUsername(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function suggestUsername(input?: string | null) {
    const normalized = normalizeUsername(input || "")
        .replace(/[^a-z0-9._]/g, "")
        .slice(0, 24);

    return normalized || "";
}

export function isValidUsername(value: string) {
    return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function getUsernameValidationMessage(value: string, t?: TranslateFn) {
    const normalized = normalizeUsername(value);
    const translate = (key: string, fallback: string) => (t ? t(key) : fallback);

    if (!normalized) {
        return null;
    }

    if (normalized.length < 3) {
        return translate("completeProfile.validation.min", "Tryggd ID must be at least 3 characters.");
    }

    if (normalized.length > 24) {
        return translate("completeProfile.validation.max", "Tryggd ID must be 24 characters or fewer.");
    }

    if (!USERNAME_PATTERN.test(normalized)) {
        return translate("completeProfile.validation.chars", "Use only lowercase letters, numbers, dots, or underscores.");
    }

    return null;
}
