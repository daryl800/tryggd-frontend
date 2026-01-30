// app/(tabs)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

export default function TabsLayout() {
  const { user, initialized } = useAuth();

  if (!initialized) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}