import InviteSignupContent from "@/components/invite/InviteSignupContent";
import { useLocalSearchParams } from "expo-router";

export default function InviteIndexScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return <InviteSignupContent token={token} />;
}
