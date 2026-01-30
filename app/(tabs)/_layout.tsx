import { Redirect, Slot } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

export default function TabsLayout() {
  const { status } = useAuth();

  if (status === "loading") return null;

  if (status !== "authenticated") {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}
