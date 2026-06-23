import { BaseColors } from "@/constants/colors";
import { iosFontSize } from "@/constants/typography";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function InviteCodeScreen() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = code.trim().length === 6 && !loading;

  const handleContinue = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc("resolve_contact_invite_by_code", {
          p_code: code.trim(),
        }) as {
          data: { invite_token: string; invite_kind: "signup" | "recovery"; expires_at: string }[] | null;
          error: any;
        };
      const result = data?.[0] || null;

      if (error) throw error;
      if (!result?.invite_token) {
        throw new Error(t("auth.invite.errors.incorrectCode"));
      }

      router.replace({
        pathname: "/invite",
        params: {
          token: result.invite_token,
          code: code.trim(),
        },
      });
    } catch (error: any) {
      Alert.alert(
        t("errors.title"),
        error?.message ||
          t("auth.invite.errors.verifyCode", {
            defaultValue: "Failed to verify invite code.",
          })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title} allowFontScaling={false}>
              {t("auth.invite.enterCodeTitle")}
            </Text>
            <Text style={styles.subtitle} allowFontScaling={false}>
              {t("auth.invite.enterCodeStandaloneHint", {
                defaultValue:
                  "If you installed the app after receiving an invite, enter the 6-digit code to continue.",
              })}
            </Text>

            <TextInput
              placeholder={t("auth.invite.codePlaceholder")}
              placeholderTextColor={BaseColors.placeholderTextColor}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.input}
              allowFontScaling={false}
              autoFocus
            />

            <TouchableOpacity
              onPress={handleContinue}
              disabled={!canSubmit}
              style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText} allowFontScaling={false}>
                  {t("common.next")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText} allowFontScaling={false}>
                {t("auth.invite.backToLogin")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 72,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: iosFontSize(32),
    fontWeight: "700",
    color: BaseColors.text.dark,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(24),
    color: BaseColors.text.muted,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    borderRadius: 10,
    fontSize: iosFontSize(18),
    color: BaseColors.text.dark,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: 2,
  },
  primaryButton: {
    backgroundColor: BaseColors.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  disabledButton: {
    backgroundColor: "#9CA3AF",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: iosFontSize(16),
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: BaseColors.primary,
    fontSize: iosFontSize(15),
    fontWeight: "500",
  },
});
