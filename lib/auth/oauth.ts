import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { registerAndSavePushToken } from "@/lib/notifications/core";

import { supabase } from "../supabase";

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = "google" | "apple";

export const authRedirectPath = "auth/callback";

export function getOAuthRedirectUrl() {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        return new URL(authRedirectPath, window.location.origin).toString();
    }

    return Linking.createURL(authRedirectPath);
}

function extractParamsFromUrl(url: string) {
    const parsed = Linking.parse(url);
    const params = new URLSearchParams();

    Object.entries(parsed.queryParams ?? {}).forEach(([key, value]) => {
        if (typeof value === "string") {
            params.set(key, value);
        }
    });

    const hashIndex = url.indexOf("#");
    if (hashIndex >= 0) {
        const hashParams = new URLSearchParams(url.slice(hashIndex + 1));
        hashParams.forEach((value, key) => params.set(key, value));
    }

    return params;
}

export async function createSessionFromUrl(url: string) {
    const params = extractParamsFromUrl(url);
    const code = params.get("code");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorCode = params.get("error_code") || params.get("error");
    const errorDescription = params.get("error_description");

    if (errorCode) {
        throw new Error(errorDescription || errorCode);
    }

    if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            throw error;
        }

        const userId = data.session?.user?.id;
        if (userId) {
            await registerAndSavePushToken(userId);
        }

        return data.session;
    }

    if (!accessToken || !refreshToken) {
        return null;
    }

    const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    if (error) {
        throw error;
    }

    const userId = data.session?.user?.id;
    if (userId) {
        await registerAndSavePushToken(userId);
    }

    return data.session;
}

export async function signInWithSocial(provider: SocialProvider) {
    const redirectTo = getOAuthRedirectUrl();

    if (Platform.OS === "web") {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo,
            },
        });

        if (error) {
            throw error;
        }

        return data;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo,
            skipBrowserRedirect: true,
        },
    });

    if (error) {
        throw error;
    }

    const authUrl = data?.url;
    if (!authUrl) {
        throw new Error("OAuth URL was not returned.");
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

    if (result.type === "cancel" || result.type === "dismiss") {
        return null;
    }

    if (result.type !== "success") {
        throw new Error("OAuth sign-in did not complete.");
    }

    const session = await createSessionFromUrl(result.url);

    if (!session) {
        throw new Error("OAuth completed, but no session was created.");
    }

    return session;
}
