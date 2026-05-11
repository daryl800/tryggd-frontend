// contexts/AuthContext.tsx
import { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { deriveDisplayName, isLikelyGeneratedDisplayName } from "../lib/profile/displayName";
import { supabase } from "../lib/supabase";

type Profile = {
    id: string;
    display_name: string;
    username?: string | null;
    avatar_url?: string;
};

type AuthContextType = {
    user: any | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    initialized: boolean;
    needsUsername: boolean;
    refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    initialized: false,
    needsUsername: false,
    refreshProfile: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    const refreshProfile = useCallback(async () => {
        if (!user) {
            setProfile(null);
            return;
        }

        try {
            setProfileLoading(true);

            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

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
    }, [user]);

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
        if (!user) {
            setProfile(null);
            return;
        }

        void refreshProfile();
    }, [refreshProfile, user]);

    const loading = !initialized || profileLoading;
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
