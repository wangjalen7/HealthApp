import { PendingReminderPrompt } from "../reminders/pending-prompt";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import { finishWelcomeIntro } from "./welcome-intro";
import { useAccountDeletion } from "./account-deletion";
import { Icon } from "../../ui/icon";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/profile-theme";
import { TextInput } from "../../ui/text-input";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { useEntry } from "./entry-provider";
import { SustainBrand, sustainPalette } from "./sustain-brand";
import { useAppAppearance } from "../../ui/appearance";
import { useReducedMotion } from "../../ui/motion";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { authRedirectUrl } from "../../lib/app-links";
import { supabaseConfig } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import { isDuplicateSignUpResponse } from "./auth-callback";
import { biometricPasswordReturnPath } from "./biometric-lock-navigation";
import { validateAuthInput } from "./validation";
import {
  getFaceIdAvailability,
  getFaceIdLoginAccount,
  getRememberedLoginAccount,
  removeFaceIdLoginCredential,
  removeRememberedLoginAccount,
  revokeFaceIdLoginCredential,
  saveRememberedLoginAccount,
  signInWithFaceIdCredential,
  type FaceIdLoginAccount,
} from "./biometric-auth";

type Mode = "signIn" | "signUp" | "reset";

export function AuthScreen({ mode }: { mode: Mode }) {
  const entry = useEntry();
  const { resolvedScheme } = useAppAppearance();
  const reduced = useReducedMotion();
  const reveal = useRef(new Animated.Value(0)).current;
  const submitting = useRef(false);
  const live = useRef(true);
  const attemptId = useRef<number | undefined>(undefined);
  const completed = useRef(false);
  useEffect(() => {
    live.current = true;
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: reduced ? 0 : 220,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => {
      live.current = false;
      animation.stop();
    };
  }, [reduced, reveal]);
  useEffect(
    () => () => {
      if (attemptId.current && !completed.current)
        entry.cancel(attemptId.current);
    },
    [entry.cancel],
  );
  const deletion = useAccountDeletion();
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string; returnTo?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [firstName, setFirstName] = useState("");
  const lastName = "";
  const [busy, setBusy] = useState(false);
  const [faceIdBusy, setFaceIdBusy] = useState(false);
  const [faceIdAccount, setFaceIdAccount] = useState<FaceIdLoginAccount>();
  const [rememberMe, setRememberMe] = useState(false);
  const [feedback, setFeedback] = useState("");
  const title =
    mode === "signIn"
      ? "Sign in"
      : mode === "signUp"
        ? "Create your account"
        : "Reset password";

  useEffect(() => {
    if (mode === "signIn" && params.reset === "success") {
      setFeedback(
        "Password updated. Face ID was removed for security. Sign in with your new password, then enable Face ID again from Profile.",
      );
    }
  }, [mode, params.reset]);

  useEffect(() => {
    if (mode !== "signIn") return;
    let active = true;
    void (async () => {
      const [availability, faceIdLogin] = await Promise.all([
        getFaceIdAvailability(),
        getFaceIdLoginAccount(),
      ]);
      const rememberedLogin = await getRememberedLoginAccount();
      return { availability, faceIdLogin, rememberedLogin };
    })()
      .then(({ availability, faceIdLogin, rememberedLogin }) => {
        if (!active) return;
        const account = faceIdLogin ?? rememberedLogin;
        if (availability.available && faceIdLogin?.email) {
          setFaceIdAccount(faceIdLogin);
        }
        if (account) {
          setEmail((current) => current || account.email);
          setRememberMe(true);
        }
      })
      .catch(() => {
        if (active) setFaceIdAccount(undefined);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  async function signInWithFaceId() {
    if (submitting.current) return;
    submitting.current = true;
    Keyboard.dismiss();
    const id = entry.begin(
      "biometric",
      biometricPasswordReturnPath(params.returnTo ?? ""),
    );
    attemptId.current = id;
    completed.current = false;
    setFaceIdBusy(true);
    setFeedback("");
    try {
      const result = await signInWithFaceIdCredential();
      if (!live.current) return;
      if (!result.success) {
        if (result.invalidCredential && faceIdAccount) {
          try {
            await removeFaceIdLoginCredential(faceIdAccount.userId);
          } catch {
            // Hide a revoked enrollment even if Keychain cleanup must retry.
          }
          setFaceIdAccount(undefined);
        }
        setFeedback(
          result.message ??
            "Face ID could not sign you in. Try again or use your password.",
        );
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!live.current) return;
      if (!data.session) throw Error("Could not restore your session.");
      completed.current = true;
      entry.complete(id, data.session.user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/cancel|user interaction is not allowed/i.test(message)) {
        setFeedback("Face ID was canceled.");
      } else {
        setFeedback(
          "Face ID could not unlock your saved sign-in. Try again or use your password.",
        );
      }
    } finally {
      submitting.current = false;
      if (!completed.current) entry.cancel(id);
      if (live.current) setFaceIdBusy(false);
    }
  }

  async function submit() {
    if (submitting.current || busy || faceIdBusy) return;
    setFeedback("");
    if (!supabaseConfig.isConfigured) {
      setFeedback(
        "Add your Supabase URL and anonymous key to .env, then restart Expo.",
      );
      return;
    }
    const validationError = validateAuthInput(mode, email, password);
    if (validationError) {
      setFeedback(validationError);
      return;
    }
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (
      mode === "signUp" &&
      (cleanFirstName.length > 80 || cleanLastName.length > 80)
    ) {
      setFeedback("First and last names must each be 80 characters or fewer.");
      return;
    }
    submitting.current = true;
    Keyboard.dismiss();
    const id =
      mode === "reset"
        ? undefined
        : entry.begin(
            "manual",
            biometricPasswordReturnPath(params.returnTo ?? ""),
          );
    attemptId.current = id;
    completed.current = false;
    setBusy(true);
    try {
      if (mode === "signIn") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!live.current) return;
        if (error) {
          setFeedback(error.message);
          return;
        }
        if (!data.user) {
          setFeedback("Could not load the signed-in account.");
          return;
        }
        if (faceIdAccount && faceIdAccount.userId !== data.user.id) {
          await removeFaceIdLoginCredential(faceIdAccount.userId);
          setFaceIdAccount(undefined);
        }
        if (rememberMe) {
          await saveRememberedLoginAccount({
            email: data.user.email ?? email.trim(),
            userId: data.user.id,
          });
        } else {
          if (faceIdAccount?.userId === data.user.id) {
            try {
              await revokeFaceIdLoginCredential(data.user.id);
            } catch {
              await removeFaceIdLoginCredential(data.user.id);
            }
            setFaceIdAccount(undefined);
          }
          await removeRememberedLoginAccount();
        }
        if (!live.current) return;
        completed.current = true;
        entry.complete(id!, data.user.id);
        return;
      }
      if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: [cleanFirstName, cleanLastName]
                .filter(Boolean)
                .join(" "),
              first_name: cleanFirstName,
              last_name: cleanLastName,
            },
            emailRedirectTo: authRedirectUrl("sign-in"),
          },
        });
        if (!live.current) return;
        if (error) {
          setFeedback(
            error.code === "user_already_exists" ||
              /already registered/i.test(error.message)
              ? "An account already exists for this email. Sign in or reset your password instead."
              : error.message,
          );
          return;
        }
        if (isDuplicateSignUpResponse(data.user?.identities)) {
          setFeedback(
            "An account already exists for this email. Sign in or reset your password instead.",
          );
          return;
        }
        await finishWelcomeIntro().catch(() => undefined);
        if (data.session) {
          completed.current = true;
          entry.complete(id!, data.session.user.id);
          return;
        }
        router.replace({
          pathname: "/(auth)/check-email",
          params: { email: email.trim(), purpose: "confirm" },
        });
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: authRedirectUrl("reset-password"),
        },
      );
      if (error) {
        setFeedback(error.message);
        return;
      }
      router.replace({
        pathname: "/(auth)/check-email",
        params: { email: email.trim(), purpose: "reset" },
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not continue.",
      );
    } finally {
      submitting.current = false;
      if (id && !completed.current) entry.cancel(id);
      if (live.current) setBusy(false);
    }
  }

  return (
    <ScreenScrollView
      style={{ backgroundColor: sustainPalette[resolvedScheme] }}
      contentContainerStyle={[
        styles.page,
        { backgroundColor: sustainPalette[resolvedScheme] },
      ]}
    >
      <View style={styles.form}>
        <Animated.View
          style={[
            styles.brandRow,
            {
              opacity: reveal,
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduced ? 0 : 4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <SustainBrand
            motion={
              entry.attempt
                ? "idle"
                : faceIdBusy
                  ? "biometric"
                  : busy && mode !== "reset"
                    ? "pending"
                    : "idle"
            }
          />
          <Text style={styles.brandCopy}>A little care. Every day.</Text>
          <Link href="/legal" style={[styles.link, { paddingVertical: 14 }]}>Privacy & Legal</Link>
        </Animated.View>
        <Animated.View style={{ opacity: reveal }}>
          {mode !== "signIn" ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              <Text style={styles.subtitle}>
                {mode === "signUp"
                  ? "Make room for a healthier everyday."
                  : "We will send a link to reset your password."}
              </Text>
            </>
          ) : null}
          {mode === "signIn" ? <PendingReminderPrompt /> : null}
          {!supabaseConfig.isConfigured && (
            <Text style={styles.warning}>
              Supabase is not configured yet. You can still explore the app
              structure.
            </Text>
          )}
          {mode === "signUp" ? (
            <View style={styles.nameRow}>
              <TextInput
                accessibilityLabel="Preferred name (optional)"
                autoCapitalize="words"
                autoComplete="given-name"
                maxLength={80}
                placeholder="Preferred name (optional)"
                placeholderTextColor="#718096"
                style={[styles.input, styles.nameInput]}
                textContentType="givenName"
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
          ) : null}
          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCorrect={false}
            onSubmitEditing={mode === "reset" ? () => void submit() : undefined}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#718096"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          {mode !== "reset" && (
            <>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passwordField}>
                <TextInput
                  accessibilityLabel="Password"
                  onSubmitEditing={() => void submit()}
                  returnKeyType="go"
                  autoCapitalize="none"
                  autoComplete={
                    mode === "signUp" ? "new-password" : "current-password"
                  }
                  secureTextEntry={!passwordVisible}
                  autoCorrect={false}
                  placeholder="Password"
                  placeholderTextColor="#718096"
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible ? "Hide password" : "Show password"
                  }
                  onPress={() => setPasswordVisible((current) => !current)}
                  style={styles.passwordReveal}
                >
                  <Icon
                    name={passwordVisible ? "eye-off" : "eye"}
                    size={22}
                    color={colors.secondary}
                  />
                </Pressable>
              </View>
            </>
          )}
          {mode === "signIn" ? (
            <View style={styles.loginOptions}>
              <View style={styles.rememberRow}>
                <Switch
                  accessibilityLabel="Remember me"
                  style={styles.rememberSwitch}
                  disabled={busy || faceIdBusy}
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: colors.separator, true: colors.blue }}
                  ios_backgroundColor={colors.separator}
                />
                <Text style={styles.rememberText}>Remember me</Text>
              </View>
              {faceIdAccount && rememberMe ? (
                <Pressable
                  accessibilityLabel={`Sign in as ${faceIdAccount.email} with Face ID`}
                  accessibilityRole="button"
                  disabled={busy || faceIdBusy}
                  onPress={() => void signInWithFaceId()}
                  style={({ pressed }) => [
                    styles.faceIdButton,
                    pressed && styles.faceIdButtonPressed,
                    (busy || faceIdBusy) && { opacity: 0.55 },
                  ]}
                >
                  {faceIdBusy ? (
                    <ActivityIndicator color={colors.blue} size="small" />
                  ) : (
                    <SymbolView
                      fallback={<Text style={styles.faceIdFallback}>ID</Text>}
                      name="faceid"
                      size={23}
                      tintColor={colors.blue}
                      weight="regular"
                    />
                  )}
                  <Text style={styles.faceIdButtonText}>Face ID</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {feedback}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === "signIn"
                ? "Sign in"
                : mode === "signUp"
                  ? "Create account"
                  : "Send reset link"
            }
            accessibilityState={{ busy: busy || faceIdBusy }}
            disabledOpacity={1}
            disabled={busy || faceIdBusy}
            onPress={submit}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor:
                  busy || faceIdBusy
                    ? colors.authActionDisabled
                    : pressed
                      ? colors.authActionPressed
                      : colors.authAction,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAuthAction} size="small" />
            ) : null}
            <Text style={styles.buttonText}>
              {busy
                ? mode === "signIn"
                  ? "Signing in…"
                  : mode === "signUp"
                    ? "Creating account…"
                    : "Sending link…"
                : mode === "signIn"
                  ? "Sign in"
                  : mode === "signUp"
                    ? "Create account"
                    : "Send reset link"}
            </Text>
          </Pressable>
          {mode === "signIn" && (
            <>
              <Link
                href="/(auth)/forgot-password"
                style={[styles.link, styles.recoveryLink]}
              >
                Forgot password?
              </Link>
              <Link
                href="/(auth)/sign-up"
                style={[styles.link, styles.createLink]}
              >
                New here? Create an account
              </Link>
            </>
          )}
          {mode === "signIn" && deletion.pending ? (
            <Pressable
              accessibilityRole="button"
              onPress={deletion.openRecovery}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={styles.link}>Resume account deletion</Text>
            </Pressable>
          ) : null}
          {mode !== "signIn" && (
            <Link href="/(auth)/sign-in" style={styles.link}>
              Back to sign in
            </Link>
          )}
        </Animated.View>
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: "flex-start",
    padding: 24,
    backgroundColor: colors.background,
  },
  form: { alignSelf: "center", maxWidth: 440, width: "100%" },
  brandRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    marginBottom: 30,
  },
  brandCopy: {
    color: colors.secondary,
    fontSize: 14,
    marginTop: 5,
    textAlign: "center",
  },
  fieldLabel: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  subtitle: {
    color: colors.secondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  createLink: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    paddingVertical: 15,
    color: colors.text,
    overflow: "hidden",
    fontWeight: "600",
  },
  appIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: sustainPalette.green,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    letterSpacing: -1,
    fontWeight: "600",
    marginBottom: 8,
  },
  warning: {
    color: "#8A4B00",
    backgroundColor: colors.orangeSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    padding: 15,
    marginBottom: 12,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    color: colors.danger,
    marginBottom: 10,
    padding: 11,
  },
  passwordField: { position: "relative", marginBottom: 12 },
  passwordInput: { marginBottom: 0, paddingRight: 56 },
  passwordReveal: {
    position: "absolute",
    right: 4,
    top: 0,
    bottom: 0,
    width: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  loginOptions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    marginBottom: 12,
  },
  rememberRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    minHeight: 44,
  },
  rememberText: { color: colors.text, fontSize: 14, flexShrink: 1 },
  rememberSwitch: { alignSelf: "center" },
  button: {
    alignItems: "center",
    backgroundColor: colors.authAction,
    flexDirection: "row",
    gap: 10,
    borderRadius: 12,
    minHeight: 52,
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: { color: colors.onAuthAction, fontSize: 16, fontWeight: "700" },
  faceIdButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  faceIdButtonPressed: { backgroundColor: colors.fill },
  faceIdFallback: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  faceIdButtonText: { color: colors.blue, fontSize: 14, fontWeight: "600" },
  link: {
    color: colors.blue,
    fontSize: 15,
    marginTop: 18,
    textAlign: "center",
  },
  recoveryLink: { marginTop: 36 },
  nameRow: { flexDirection: "row", gap: 10 },
  nameInput: { flex: 1, minWidth: 0 },
});
