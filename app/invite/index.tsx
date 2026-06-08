import InviteSignupContent from "@/components/invite/InviteSignupContent";
import { useLocalSearchParams } from "expo-router";

export default function InviteIndexScreen() {
  const params = useLocalSearchParams<{ token?: string; code?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  return <InviteSignupContent token={token} initialCode={code} />;
}
