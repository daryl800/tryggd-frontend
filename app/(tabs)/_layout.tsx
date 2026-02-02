// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

export default function TabsLayout() {
  const { user, initialized } = useAuth();

  if (!initialized) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#ffffff' },
      tabBarActiveTintColor: '#5FA893',
    }}>
      {/* Only 4 tabs shown */}
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "pulse" : "pulse-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "person" : "person-outline"} color={color} size={size} /> }} />

      {/* Settings hidden from tabs but accessible via router */}
      <Tabs.Screen
        name="settings"
        options={{
          href: null, // ← This hides it from tab bar
        }}
      />
    </Tabs>
  );
}