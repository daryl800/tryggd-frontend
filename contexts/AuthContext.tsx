// contexts/AuthContext.tsx
import { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = {
    id: string;
    display_name: string;
    avatar_url?: string;
};

type AuthContextType = {
    user: any | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    initialized: boolean;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    initialized: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

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

        let isActive = true;

        const loadProfile = async () => {
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
                    // If profile doesn't exist, you might want to create one here
                    if (error.code === "PGRST116") { // No rows returned
                        // Create default profile
                        const { data: newProfile } = await supabase
                            .from("profiles")
                            .insert({
                                id: user.id,
                                display_name: user.email?.split("@")[0] || "User",
                            })
                            .select()
                            .single();

                        if (newProfile && isActive) {
                            setProfile(newProfile);
                        }
                    }
                } else if (data && isActive) {
                    setProfile(data);
                }
            } catch (error) {
                console.error("[AuthContext] Error loading profile:", error);
            } finally {
                if (isActive) {
                    setProfileLoading(false);
                }
            }
        };

        loadProfile();

        return () => {
            isActive = false;
        };
    }, [user?.id]);

    const loading = !initialized || profileLoading;

    return (
        <AuthContext.Provider value={{
            user,
            session,
            profile,
            loading,
            initialized
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