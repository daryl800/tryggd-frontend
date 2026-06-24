// app/(auth)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

export default function AuthLayout() {
    const { user, initialized, needsUsername } = useAuth();

    // Show nothing while loading
    if (!initialized) {
        return null;
    }

    // If user is already logged in, redirect to tabs
    if (user) {
        console.log("[AuthLayout] User already logged in, redirecting");
        return <Redirect href={needsUsername ? "/complete-profile" : "/"} />;
    }

    // User is not logged in, show auth screens
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="invite-code" />
        </Stack>
    );
}
