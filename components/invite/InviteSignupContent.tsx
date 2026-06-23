import { BaseColors } from "@/constants/colors";
import { iosFontSize } from "@/constants/typography";
import { buildSyntheticEmailFromTryggdId, isValidTryggdId, normalizePhoneNumber } from "@/lib/auth/phoneIdentity";
import { resetOnboarding } from "@/lib/onboarding/state";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
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

type InvitePreview = {
  invite_id: string;
  invite_kind: 'signup' | 'recovery';
  inviter_display_name: string;
  invitee_name?: string | null;
  suggested_username?: string | null;
  target_user_id?: string | null;
  target_display_name?: string | null;
  expires_at: string;
  status: string;
};

type VerifyInviteCodeResult = {
  is_valid: boolean;
  error: string | null;
};

type Props = {
  token?: string;
  initialCode?: string;
};

export default function InviteSignupContent({ token, initialCode }: Props) {
  const { t, i18n } = useTranslation();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const codeRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const autoVerifyAttemptedRef = useRef(false);
  const displayNameTouchedRef = useRef(false);

  useEffect(() => {
    const loadInvite = async () => {
      if (!token) {
        setInviteError(t('auth.invite.invalidLink'));
        setLoadingInvite(false);
        return;
      }

      setLoadingInvite(true);
      const { data, error } = await supabase
        .rpc('get_contact_invite', { p_invite_token: token })
        .maybeSingle<InvitePreview>();

      if (error) {
        setInviteError(error.message);
      } else if (!data) {
        setInviteError(t('auth.invite.notFound'));
      } else if (data.status !== 'pending') {
        if (data.status === 'claimed') {
          setInviteError(t('auth.invite.alreadyUsed'));
        } else if (data.status === 'expired') {
          setInviteError(t('auth.invite.expired'));
        } else {
          setInviteError(t('auth.invite.unavailable'));
        }
      } else {
        setInvite(data);
        if (data.suggested_username) {
          setUsername(data.suggested_username);
          setDisplayName((currentName) =>
            !displayNameTouchedRef.current && !currentName.trim()
              ? data.suggested_username || ''
              : currentName
          );
        }
      }

      setLoadingInvite(false);
    };

    void loadInvite();
  }, [t, token]);

  useEffect(() => {
    if (!initialCode || code.length > 0) return;
    setCode(initialCode);
  }, [code.length, initialCode]);

  useEffect(() => {
    if (!codeVerified) return;

    const task = InteractionManager.runAfterInteractions(() => {
      passwordRef.current?.focus();
    });

    return () => {
      task.cancel();
    };
  }, [codeVerified, invite?.invite_kind]);

  useEffect(() => {
    if (!invite || !initialCode || codeVerified || verifyingCode || autoVerifyAttemptedRef.current) {
      return;
    }

    if (code.trim().length < 6) {
      return;
    }

    autoVerifyAttemptedRef.current = true;
    void verifyCode();
  }, [code, codeVerified, initialCode, invite, verifyingCode]);

  const handleDisplayNameChange = (value: string) => {
    displayNameTouchedRef.current = true;
    setDisplayNameTouched(true);
    setDisplayName(value);
  };

  const handleUsernameChange = (value: string) => {
    const normalizedValue = value.toLowerCase().replace(/\s+/g, '');
    const shouldMirrorDisplayName =
      !displayNameTouched ||
      displayName.trim().length === 0 ||
      displayName === username;

    setUsername(normalizedValue);

    if (shouldMirrorDisplayName) {
      setDisplayName(normalizedValue);
    }
  };

  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const canSubmitSignup = useMemo(() => {
    return (
      codeVerified &&
      displayName.trim().length > 0 &&
      isValidTryggdId(username) &&
      (phone.trim().length === 0 || !!normalizePhoneNumber(phone)) &&
      password.length >= 8 &&
      passwordsMatch &&
      !submitting
    );
  }, [codeVerified, displayName, password, passwordsMatch, phone, submitting, username]);

  const webLanguage = i18n.resolvedLanguage === 'zh-Hant' ? 'zh-TW' : i18n.resolvedLanguage === 'zh-Hans' ? 'zh-CN' : i18n.resolvedLanguage || 'en';
  const webInviteUrl = token ? `https://tryggd.com/invite?token=${token}&lang=${encodeURIComponent(webLanguage)}` : `https://tryggd.com?lang=${encodeURIComponent(webLanguage)}`;
  const appInviteUrl = token ? `tryggd://invite?token=${token}` : 'tryggd://';

  const getLocalizedInviteError = (message?: string | null) => {
    if (!message) return null;

    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('tryggd') && normalizedMessage.includes('taken')) {
      return t('completeProfile.duplicateBody');
    }

    if (normalizedMessage.includes('phone') && normalizedMessage.includes('already')) {
      return i18n.resolvedLanguage === 'zh-Hant'
        ? '這個電話號碼已被使用。'
        : i18n.resolvedLanguage === 'zh-Hans'
          ? '这个电话号码已被使用。'
          : message;
    }

    if (normalizedMessage.includes('too many incorrect attempts')) {
      return i18n.resolvedLanguage === 'zh-Hant'
        ? '錯誤嘗試次數過多，請重新索取邀請。'
        : i18n.resolvedLanguage === 'zh-Hans'
          ? '错误尝试次数过多，请重新索取邀请。'
          : message;
    }

    switch (message) {
      case 'That Tryggd ID is already taken.':
        return t('completeProfile.duplicateBody');
      case 'This phone number is already in use.':
        return i18n.resolvedLanguage === 'zh-Hant'
          ? '這個電話號碼已被使用。'
          : i18n.resolvedLanguage === 'zh-Hans'
            ? '这个电话号码已被使用。'
            : message;
      case 'Too many incorrect attempts. Ask for a new invite.':
        return i18n.resolvedLanguage === 'zh-Hant'
          ? '錯誤嘗試次數過多，請重新索取邀請。'
          : i18n.resolvedLanguage === 'zh-Hans'
            ? '错误尝试次数过多，请重新索取邀请。'
            : message;
      case 'The code is incorrect.':
        return t('auth.invite.errors.incorrectCode');
      case 'Failed to create the invited account.':
        return t('auth.invite.errors.createAccount');
      default:
        return message;
    }
  };

  const extractFunctionErrorMessage = async (error: any) => {
    if (!error) return null;

    if (typeof error.message === 'string' && error.message.trim()) {
      const direct = getLocalizedInviteError(error.message.trim());
      if (direct && direct !== error.message.trim()) {
        return direct;
      }
    }

    const response = error?.context;
    if (response) {
      try {
        const payload = await response.clone().json();
        const serverMessage = payload?.error;
        if (typeof serverMessage === 'string' && serverMessage.trim()) {
          return getLocalizedInviteError(serverMessage.trim()) || serverMessage.trim();
        }
      } catch {
        try {
          const text = await response.clone().text();
          if (text?.trim()) {
            return getLocalizedInviteError(text.trim()) || text.trim();
          }
        } catch {
          // ignore parse failures and fall back below
        }
      }
    }

    return getLocalizedInviteError(error?.message) || error?.message || null;
  };

  const verifyCode = async () => {
    if (!token || code.trim().length < 4) return;

    setVerifyingCode(true);
    try {
      const { data, error } = await supabase
        .rpc('verify_contact_invite_code', {
          p_invite_token: token,
          p_code: code.trim(),
        })
        .single<VerifyInviteCodeResult>();

      if (error) throw error;
      if (!data?.is_valid) {
        throw new Error(data?.error || t('auth.invite.errors.incorrectCode'));
      }

      setCodeVerified(true);
    } catch (error: any) {
      const localizedMessage = await extractFunctionErrorMessage(error);
      Alert.alert(
        t('errors.title'),
        localizedMessage || t('auth.invite.errors.verifyCode')
      );
    } finally {
      setVerifyingCode(false);
    }
  };

  const registerFromInvite = async () => {
    if (!token || !canSubmitSignup || invite?.invite_kind !== 'signup') return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-invited-user', {
        body: {
          token,
          code: code.trim(),
          display_name: displayName.trim(),
          phone: phone.trim(),
          password,
          username: username.trim(),
          language: i18n.resolvedLanguage || 'en',
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || t('auth.invite.errors.createAccount'));
      }

      const authEmail = data?.auth_email || buildSyntheticEmailFromTryggdId(username.trim());

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (signInError) throw signInError;

      await resetOnboarding(signInData.user?.id);
      router.replace('/onboarding');
    } catch (error: any) {
      const localizedMessage = await extractFunctionErrorMessage(error);
      Alert.alert(
        t('errors.title'),
        localizedMessage || t('auth.invite.errors.completeSignup')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const completeRecoveryInvite = async () => {
    if (!token || !invite || invite.invite_kind !== 'recovery' || password.length < 8 || !passwordsMatch || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('complete-recovery-invite', {
        body: {
          token,
          code: code.trim(),
          password,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to reset password.');
      }

      const authEmail = data?.auth_email || (username ? buildSyntheticEmailFromTryggdId(username) : null);
      if (!authEmail) {
        throw new Error(t('auth.invite.errors.missingAccount'));
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (signInError) throw signInError;

      router.replace('/(tabs)');
    } catch (error: any) {
      const localizedMessage = await extractFunctionErrorMessage(error);
      Alert.alert(
        t('errors.title'),
        localizedMessage || t('auth.invite.errors.completeRecovery')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInvite) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={BaseColors.primary} />
      </SafeAreaView>
    );
  }

  if (!invite) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorTitle} allowFontScaling={false}>{t('auth.invite.unavailableTitle')}</Text>
        <Text style={styles.errorText} allowFontScaling={false}>
          {inviteError || t('auth.invite.couldNotOpen')}
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backButtonText} allowFontScaling={false}>{t('auth.invite.backToLogin')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Ionicons name="people-circle" size={60} color={BaseColors.primary} />
            <Text style={styles.title} allowFontScaling={false}>
              {invite.invite_kind === 'recovery' ? t('auth.invite.recoveryTitle') : t('auth.invite.invitedTitle')}
            </Text>
            <Text style={styles.subtitle} allowFontScaling={false}>
              {invite.invite_kind === 'recovery'
                ? t('auth.invite.recoverySubtitle', {
                    inviter: invite.inviter_display_name,
                    account: invite.suggested_username || t('auth.invite.yourAccount'),
                  })
                : t('auth.invite.signupSubtitle', {
                    inviter: invite.inviter_display_name,
                    invitee: invite.invitee_name || t('auth.invite.you'),
                  })}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle} allowFontScaling={false}>{t('auth.invite.installTitle')}</Text>
            <Text style={styles.sectionHint} allowFontScaling={false}>
              {t('auth.invite.installHint')}
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                window.location.href = appInviteUrl;
              }}
            >
              <Text style={styles.primaryButtonText} allowFontScaling={false}>
                {t('auth.invite.openInApp')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                window.location.href = 'https://apps.apple.com/us/app/tryggd/id6767919301';
              }}
            >
              <Text style={styles.secondaryButtonText} allowFontScaling={false}>
                {t('auth.invite.downloadAppStore')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                window.location.href = 'https://play.google.com/store/apps/details?id=com.marcustechnology.tryggd';
              }}
            >
              <Text style={styles.secondaryButtonText} allowFontScaling={false}>
                {t('auth.invite.downloadGooglePlay')}
              </Text>
            </TouchableOpacity>

            <Text style={styles.linkLabel} allowFontScaling={false}>{t('auth.invite.keepLink')}</Text>
            <Text style={styles.linkText} allowFontScaling={false}>{webInviteUrl}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.header}>
            <Ionicons name="people-circle" size={60} color={BaseColors.primary} />
            <Text style={styles.title} allowFontScaling={false}>
              {invite.invite_kind === 'recovery' ? t('auth.invite.recoveryTitle') : t('auth.invite.invitedTitle')}
            </Text>
            <Text style={styles.subtitle} allowFontScaling={false}>
              {invite.invite_kind === 'recovery'
                ? t('auth.invite.recoverySubtitle', {
                    inviter: invite.inviter_display_name,
                    account: invite.suggested_username || t('auth.invite.yourAccount'),
                  })
                : t('auth.invite.signupSubtitle', {
                    inviter: invite.inviter_display_name,
                    invitee: invite.invitee_name || t('auth.invite.you'),
                  })}
            </Text>
          </View>

          {!codeVerified ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle} allowFontScaling={false}>{t('auth.invite.enterCodeTitle')}</Text>
              <Text style={styles.sectionHint} allowFontScaling={false}>
                {t('auth.invite.enterCodeHint', { inviter: invite.inviter_display_name })}
              </Text>
              <TextInput
                ref={codeRef}
                placeholder={t('auth.invite.codePlaceholder')}
                placeholderTextColor={BaseColors.placeholderTextColor}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
                allowFontScaling={false}
              />
              <TouchableOpacity
                style={[styles.primaryButton, (verifyingCode || code.trim().length < 6) && styles.disabledButton]}
                onPress={verifyCode}
                disabled={verifyingCode || code.trim().length < 6}
              >
                <Text style={styles.primaryButtonText} allowFontScaling={false}>
                  {verifyingCode ? t('auth.invite.checkingCode') : t('common.next')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : invite.invite_kind === 'recovery' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle} allowFontScaling={false}>{t('auth.invite.setPasswordTitle')}</Text>
              <Text style={styles.sectionHint} allowFontScaling={false}>
                {t('auth.invite.setPasswordHint', { id: invite.suggested_username || username })}
              </Text>

              <TextInput
                ref={usernameRef}
                placeholder={t('auth.invite.tryggdIdPlaceholder')}
                placeholderTextColor={BaseColors.placeholderTextColor}
                autoCapitalize="none"
                value={username}
                editable={false}
                style={[styles.input, styles.disabledInput]}
                allowFontScaling={false}
              />

              <View style={styles.passwordWrapper}>
                <TextInput
                  ref={passwordRef}
                  placeholder={t('auth.password.placeholder')}
                  placeholderTextColor={BaseColors.placeholderTextColor}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  style={styles.passwordInput}
                  allowFontScaling={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.passwordWrapper}>
                <TextInput
                  ref={confirmPasswordRef}
                  placeholder={t('auth.confirmPassword')}
                  placeholderTextColor={BaseColors.placeholderTextColor}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.passwordInput}
                  allowFontScaling={false}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {confirmPassword.length > 0 && (
                <Text
                  style={{
                    marginBottom: 16,
                    color: passwordsMatch ? "#059669" : "#DC2626",
                  }}
                  allowFontScaling={false}
                >
                  {passwordsMatch ? t("auth.passwordsMatch") : t("auth.passwordsNoMatch")}
                </Text>
              )}

              <Text style={styles.passwordHint} allowFontScaling={false}>
                {t('auth.password.minimumLength')}
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, (password.length < 8 || !passwordsMatch || submitting) && styles.disabledButton]}
                onPress={completeRecoveryInvite}
                disabled={password.length < 8 || !passwordsMatch || submitting}
              >
                <Text style={styles.primaryButtonText} allowFontScaling={false}>
                  {submitting ? t('auth.invite.resettingPassword') : t('auth.invite.resetPassword')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle} allowFontScaling={false}>{t('auth.invite.createAccountTitle')}</Text>
              <Text style={styles.sectionHint} allowFontScaling={false}>
                {t('auth.invite.createAccountHint')}
              </Text>

              <TextInput
                placeholder={t('auth.displayName')}
                placeholderTextColor={BaseColors.placeholderTextColor}
                value={displayName}
                onChangeText={handleDisplayNameChange}
                onSubmitEditing={() => usernameRef.current?.focus()}
                style={styles.input}
                allowFontScaling={false}
              />

              <TextInput
                ref={usernameRef}
                placeholder={t('auth.invite.tryggdIdPlaceholder')}
                placeholderTextColor={BaseColors.placeholderTextColor}
                autoCapitalize="none"
                value={username}
                onChangeText={handleUsernameChange}
                onSubmitEditing={() => phoneRef.current?.focus()}
                style={styles.input}
                allowFontScaling={false}
              />

              <TextInput
                ref={phoneRef}
                placeholder={t('auth.invite.mobilePlaceholder')}
                placeholderTextColor={BaseColors.placeholderTextColor}
                keyboardType="phone-pad"
                autoCapitalize="none"
                value={phone}
                onChangeText={setPhone}
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={styles.input}
                allowFontScaling={false}
              />

              <View style={styles.passwordWrapper}>
                <TextInput
                  ref={passwordRef}
                  placeholder={t('auth.password.placeholder')}
                  placeholderTextColor={BaseColors.placeholderTextColor}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  style={styles.passwordInput}
                  allowFontScaling={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.passwordWrapper}>
                <TextInput
                  ref={confirmPasswordRef}
                  placeholder={t('auth.confirmPassword')}
                  placeholderTextColor={BaseColors.placeholderTextColor}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.passwordInput}
                  allowFontScaling={false}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {confirmPassword.length > 0 && (
                <Text
                  style={{
                    marginBottom: 16,
                    color: passwordsMatch ? "#059669" : "#DC2626",
                  }}
                  allowFontScaling={false}
                >
                  {passwordsMatch ? t("auth.passwordsMatch") : t("auth.passwordsNoMatch")}
                </Text>
              )}

              <Text style={styles.passwordHint} allowFontScaling={false}>
                {t('auth.password.minimumLength')}
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, !canSubmitSignup && styles.disabledButton]}
                onPress={registerFromInvite}
                disabled={!canSubmitSignup}
              >
                <Text style={styles.primaryButtonText} allowFontScaling={false}>
                  {submitting ? t('auth.invite.creatingAccount') : t('auth.invite.createAccountButton')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    marginTop: 12,
    fontSize: iosFontSize(28),
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: iosFontSize(16),
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: iosFontSize(20),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: iosFontSize(14),
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: iosFontSize(16),
    color: '#1F2937',
  },
  disabledInput: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: iosFontSize(16),
    color: "#1F2937",
  },
  passwordHint: {
    marginBottom: 16,
    fontSize: iosFontSize(13),
    color: '#6B7280',
  },
  primaryButton: {
    backgroundColor: '#5FA893',
    padding: 16,
    borderRadius: 10,
    marginTop: 4,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  primaryButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: iosFontSize(16),
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: BaseColors.neutral[100],
    padding: 16,
    borderRadius: 10,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: BaseColors.text.dark,
    textAlign: 'center',
    fontSize: iosFontSize(15),
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: iosFontSize(24),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  errorText: {
    fontSize: iosFontSize(15),
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#5FA893',
    borderRadius: 10,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: iosFontSize(15),
  },
  linkLabel: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: iosFontSize(13),
    color: '#6B7280',
  },
  linkText: {
    fontSize: iosFontSize(13),
    color: BaseColors.primaryDark,
    lineHeight: 18,
  },
});
