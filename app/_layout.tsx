// app/_layout.tsx
import { Slot } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

function RootLayoutNav() {
  const { initialized } = useAuth();

  // Only show loading indicator while auth is initializing
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // app/_layout.tsx - Add this
  console.log("[RootLayout] Render - initialized:", initialized);
  // Once auth is initialized, let the nested layouts handle routing
  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}