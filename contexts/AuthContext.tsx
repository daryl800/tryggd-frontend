// contexts/AuthContext.tsx
import { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import {
    FREE_CONTACT_LIMIT,
    getCapabilities,
    type UserCapabilities,
    type UserPlan,
} from "../lib/entitlements/capabilities";
import { deriveDisplayName, isLikelyGeneratedDisplayName } from "../lib/profile/displayName";
import { supabase } from "../lib/supabase";

type Profile = {
    id: string;
    display_name: string;
    username?: string | null;
    avatar_url?: string;
    pilot_preview_activated_at?: string | null;
};

type PilotPreviewConfig = {
    pilot_preview_enabled: boolean;
    pilot_preview_campaign_id: string | null;
    pilot_preview_ends_at: string | null;
};

type AuthContextType = {
    user: any | null;
    session: Session | null;
    profile: Profile | null;
    plan: UserPlan;
    capabilities: UserCapabilities;
    pilotPreviewConfig: PilotPreviewConfig | null;
    loading: boolean;
    initialized: boolean;
    needsUsername: boolean;
    refreshProfile: () => Promise<void>;
};

const DEFAULT_PLAN: UserPlan = "free";
const DEFAULT_CAPABILITIES = getCapabilities(DEFAULT_PLAN);

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    plan: DEFAULT_PLAN,
    capabilities: DEFAULT_CAPABILITIES,
    pilotPreviewConfig: null,
    loading: true,
    initialized: false,
    needsUsername: false,
    refreshProfile: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [plan, setPlan] = useState<UserPlan>(DEFAULT_PLAN);
    const [contactLimit, setContactLimit] = useState<number>(FREE_CONTACT_LIMIT);
    const [pilotPreviewConfig, setPilotPreviewConfig] = useState<PilotPreviewConfig | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    const refreshProfile = useCallback(async () => {
        if (!user?.id) {
            setProfile(null);
            return;
        }

        try {
            setProfileLoading(true);

            const [profileResult, entitlementResult, limitResult, appSettingsResult] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", user.id)
                    .single(),
                supabase
                    .from("user_entitlements")
                    .select("plan")
                    .eq("user_id", user.id)
                    .maybeSingle(),
                supabase
                    .rpc("get_contact_limit", { p_user_id: user.id }),
                supabase
                    .from("app_settings")
                    .select("pilot_preview_enabled, pilot_preview_campaign_id, pilot_preview_ends_at")
                    .eq("id", 1)
                    .maybeSingle(),
            ]);

            const { data, error } = profileResult;
            const {
                data: entitlementData,
                error: entitlementError,
            } = entitlementResult;
            const { data: appSettingsData } = appSettingsResult;

            const cfg = appSettingsData ?? null;
            setPilotPreviewConfig(cfg);

            if (entitlementError) {
                console.warn("[AuthContext] Entitlement error, defaulting to free:", entitlementError.message);
                setPlan(DEFAULT_PLAN);
            } else {
                const rawPlan: UserPlan = entitlementData?.plan === "plus" ? "plus" : DEFAULT_PLAN;
                const previewOpen =
                    cfg?.pilot_preview_enabled &&
                    cfg.pilot_preview_ends_at &&
                    new Date(cfg.pilot_preview_ends_at) > new Date();
                const previewActivated = !!(data as any)?.pilot_preview_activated_at;
                const isPilotPlus = !!(previewOpen && previewActivated);
                const effectivePlan: UserPlan = rawPlan === "plus" || isPilotPlus ? "plus" : DEFAULT_PLAN;
                setPlan(effectivePlan);
            }

            setContactLimit(limitResult.data ?? FREE_CONTACT_LIMIT);

            console.log("[AuthContext] Profile loaded:", data, error);

            if (error) {
                console.warn("[AuthContext] Profile error:", error.message);
                if (error.code === "PGRST116") {
                    const { data: newProfile } = await supabase
                        .from("profiles")
                        .insert({
                            id: user.id,
                            display_name: deriveDisplayName(user),
                        })
                        .select()
                        .single();

                    setProfile(newProfile ?? null);
                    return;
                }

                setProfile(null);
                return;
            }

            const betterDisplayName = deriveDisplayName(user, data.display_name || "User");

            if (
                data.display_name &&
                isLikelyGeneratedDisplayName(data.display_name) &&
                betterDisplayName !== data.display_name
            ) {
                const { data: updatedProfile, error: updateError } = await supabase
                    .from("profiles")
                    .update({ display_name: betterDisplayName })
                    .eq("id", user.id)
                    .select("*")
                    .single();

                if (!updateError && updatedProfile) {
                    setProfile(updatedProfile);
                    return;
                }
            }

            setProfile(data);
        } catch (error) {
            console.error("[AuthContext] Error loading profile:", error);
        } finally {
            setProfileLoading(false);
        }
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Initialize auth state
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log("[AuthContext] Initial session:", session?.user?.email);
            setSession(session);
            setUser(session?.user ?? null);
            setInitialized(true);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log("[AuthContext] Auth state changed:", event, session?.user?.email);
                setSession(session);
                setUser(session?.user ?? null);

                // Reset profile when signing out
                if (event === "SIGNED_OUT") {
                    setProfile(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Load profile when user changes
    useEffect(() => {
        if (!user?.id) {
            setProfile(null);
            setPlan(DEFAULT_PLAN);
            setContactLimit(FREE_CONTACT_LIMIT);
            return;
        }

        void refreshProfile();
    }, [refreshProfile, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Refresh when app returns to foreground (catches deadline expiry, session changes, etc.)
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active' && user) void refreshProfile();
        });
        return () => sub.remove();
    }, [user?.id, refreshProfile]); // eslint-disable-line react-hooks/exhaustive-deps

    // Schedule a one-shot refresh exactly when the preview deadline passes while the app is open
    useEffect(() => {
        if (!pilotPreviewConfig?.pilot_preview_ends_at) return;
        const ms = new Date(pilotPreviewConfig.pilot_preview_ends_at).getTime() - Date.now();
        if (ms <= 0) return;
        const id = setTimeout(() => void refreshProfile(), ms);
        return () => clearTimeout(id);
    }, [pilotPreviewConfig?.pilot_preview_ends_at, refreshProfile]);

    const loading = !initialized || profileLoading;
    const capabilities = useMemo(() => getCapabilities(plan, contactLimit), [plan, contactLimit]);
    const hasValidDisplayName = Boolean(
        profile?.display_name?.trim() &&
        !isLikelyGeneratedDisplayName(profile.display_name)
    );
    const needsUsername = Boolean(user) && !loading && (!profile?.username || !hasValidDisplayName);

    return (
        <AuthContext.Provider value={{
            user,
            session,
            profile,
            plan,
            capabilities,
            pilotPreviewConfig,
            loading,
            initialized,
            needsUsername,
            refreshProfile,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    return context;
};
