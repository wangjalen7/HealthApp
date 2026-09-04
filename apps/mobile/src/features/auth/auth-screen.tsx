import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabaseConfig } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import { isDuplicateSignUpResponse } from "./auth-callback";
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
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [faceIdBusy, setFaceIdBusy] = useState(false);
  const [faceIdAccount, setFaceIdAccount] = useState<FaceIdLoginAccount>();
  const [rememberMe, setRememberMe] = useState(false);
  const [feedback, setFeedback] = useState("");
  const title =
    mode === "signIn"
      ? "Welcome back"
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
        if (availability.available && faceIdLogin) {
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
    setFaceIdBusy(true);
    setFeedback("");
    try {
      const result = await signInWithFaceIdCredential();
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
      router.replace("/(app)");
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
      setFaceIdBusy(false);
    }
  }

  async function submit() {
    setFeedback("");
    if (!supabaseConfig.isConfigured) {
      setFeedback(
        "Add your Supabase URL and anonymous key to .env, then restart Expo.",
      );
      return;
    }
    if (!email.includes("@") || (mode !== "reset" && password.length < 8)) {
      setFeedback("Use a valid email and a password of at least 8 characters.");
      return;
    }
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (mode === "signUp" && (!cleanFirstName || !cleanLastName)) {
      setFeedback("Enter your first and last name.");
      return;
    }
    if (
      mode === "signUp" &&
      (cleanFirstName.length > 80 || cleanLastName.length > 80)
    ) {
      setFeedback("First and last names must each be 80 characters or fewer.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signIn") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
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
        router.replace("/(app)");
        return;
      }
      if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: `${cleanFirstName} ${cleanLastName}`,
              first_name: cleanFirstName,
              last_name: cleanLastName,
            },
            emailRedirectTo: "healthapp://sign-in",
          },
        });
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
        if (data.session) {
          router.replace("/(app)");
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
          redirectTo: "healthapp://reset-password",
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
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>HEALTHAPP</Text>
      <Text style={styles.title}>{title}</Text>
      {!supabaseConfig.isConfigured && (
        <Text style={styles.warning}>
          Supabase is not configured yet. You can still explore the app
          structure.
        </Text>
      )}
      {mode === "signUp" ? (
        <View style={styles.nameRow}>
          <TextInput
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={80}
            placeholder="First name"
            placeholderTextColor="#718096"
            style={[styles.input, styles.nameInput]}
            textContentType="givenName"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            autoCapitalize="words"
            autoComplete="family-name"
            maxLength={80}
            placeholder="Last name"
            placeholderTextColor="#718096"
            style={[styles.input, styles.nameInput]}
            textContentType="familyName"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
      ) : null}
      <TextInput
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
        <TextInput
          autoCapitalize="none"
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#718096"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
      )}
      {mode === "signIn" ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            onPress={() => setRememberMe((current) => !current)}
            style={styles.rememberRow}
          >
            <View
              style={[styles.checkbox, rememberMe && styles.checkboxChecked]}
            >
              {rememberMe ? (
                <SymbolView
                  fallback={<Text style={styles.checkboxFallback}>✓</Text>}
                  name="checkmark"
                  size={13}
                  tintColor="#fff"
                  weight="bold"
                />
              ) : null}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </Pressable>
          {faceIdAccount && !rememberMe ? (
            <Text style={styles.rememberHint}>
              Signing in removes Face ID from this iPhone.
            </Text>
          ) : null}
        </>
      ) : null}
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {feedback}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy || faceIdBusy}
        onPress={submit}
        style={styles.button}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {mode === "signIn"
              ? "Sign in"
              : mode === "signUp"
                ? "Create account"
                : "Send reset link"}
          </Text>
        )}
      </Pressable>
      {mode === "signIn" && faceIdAccount && rememberMe ? (
        <>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>
          <Pressable
            accessibilityLabel={`Sign in as ${faceIdAccount.email} with Face ID`}
            accessibilityRole="button"
            disabled={busy || faceIdBusy}
            onPress={() => void signInWithFaceId()}
            style={({ pressed }) => [
              styles.faceIdButton,
              pressed && styles.faceIdButtonPressed,
              faceIdBusy && styles.faceIdButtonBusy,
            ]}
          >
            {faceIdBusy ? (
              <ActivityIndicator color="#007AFF" />
            ) : (
              <>
                <View style={styles.faceIdSymbolWrap}>
                  <SymbolView
                    fallback={<Text style={styles.faceIdFallback}>ID</Text>}
                    name="faceid"
                    size={28}
                    tintColor="#007AFF"
                    weight="regular"
                  />
                </View>
                <View style={styles.faceIdContent}>
                  <Text style={styles.faceIdButtonText}>Face ID</Text>
                  <Text numberOfLines={1} style={styles.faceIdAccount}>
                    Sign in as {faceIdAccount.email}
                  </Text>
                </View>
                <SymbolView
                  fallback={<Text style={styles.chevronFallback}>›</Text>}
                  name="chevron.right"
                  size={13}
                  tintColor="#C7C7CC"
                  weight="semibold"
                />
              </>
            )}
          </Pressable>
        </>
      ) : null}
      {mode === "signIn" && (
        <>
          <Link href="/(auth)/forgot-password" style={styles.link}>
            Forgot password?
          </Link>
          <Link href="/(auth)/sign-up" style={styles.link}>
            New here? Create an account
          </Link>
        </>
      )}
      {mode !== "signIn" && (
        <Link href="/(auth)/sign-in" style={styles.link}>
          Back to sign in
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F7FAFC",
  },
  eyebrow: {
    color: "#16776A",
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#102A43",
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 24,
  },
  warning: {
    color: "#8A4B00",
    backgroundColor: "#FFF3D6",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderWidth: 1,
    borderRadius: 12,
    color: "#102A43",
    fontSize: 16,
    padding: 15,
    marginBottom: 12,
  },
  error: {
    backgroundColor: "#FDECEC",
    borderRadius: 10,
    color: "#B42318",
    marginBottom: 10,
    padding: 11,
  },
  rememberRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    minHeight: 34,
    paddingHorizontal: 2,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#8E8E93",
    borderRadius: 5,
    borderWidth: 1,
    height: 21,
    justifyContent: "center",
    marginRight: 9,
    width: 21,
  },
  checkboxChecked: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  checkboxFallback: { color: "#fff", fontSize: 12, fontWeight: "800" },
  rememberText: { color: "#1C1C1E", fontSize: 14 },
  rememberHint: { color: "#8E8E93", fontSize: 11, marginBottom: 5 },
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 12,
    minHeight: 52,
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginVertical: 17,
  },
  dividerLine: { backgroundColor: "#D9E2EC", flex: 1, height: 1 },
  dividerText: { color: "#829AB1", fontSize: 11, fontWeight: "800" },
  faceIdButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#E5E5EA",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 13,
  },
  faceIdButtonPressed: { backgroundColor: "#F2F2F7" },
  faceIdButtonBusy: { justifyContent: "center" },
  faceIdSymbolWrap: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    marginRight: 12,
    width: 34,
  },
  faceIdFallback: { color: "#007AFF", fontSize: 13, fontWeight: "700" },
  faceIdContent: { flex: 1 },
  faceIdButtonText: { color: "#1C1C1E", fontSize: 15, fontWeight: "600" },
  faceIdAccount: { color: "#8E8E93", fontSize: 12, marginTop: 2 },
  chevronFallback: { color: "#C7C7CC", fontSize: 22, lineHeight: 22 },
  link: { color: "#16776A", fontSize: 15, marginTop: 18, textAlign: "center" },
  nameRow: { flexDirection: "row", gap: 10 },
  nameInput: { flex: 1 },
});
