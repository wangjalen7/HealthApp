import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import { removeFaceIdLoginCredential } from "../../src/features/auth/biometric-auth";
import { supabase } from "../../src/lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { clearPasswordRecovery, passwordRecovery, session } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function savePassword() {
    setFeedback("");
    if (password.length < 8) {
      return setFeedback("Use a password of at least 8 characters.");
    }
    if (password !== confirmation) {
      return setFeedback("The passwords do not match.");
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (session) {
        try {
          await removeFaceIdLoginCredential(session.user.id);
        } catch {
          // The old credential will fail safely if the Keychain is unavailable.
        }
      }
      await supabase.auth.signOut();
      clearPasswordRecovery();
      router.replace({
        pathname: "/(auth)/sign-in",
        params: { reset: "success" },
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not reset password.",
      );
    } finally {
      setBusy(false);
    }
  }

  const ready = passwordRecovery.status === "ready";
  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
      <Text style={styles.title}>Choose a new password</Text>
      {passwordRecovery.status === "loading" ? (
        <ActivityIndicator color="#16776A" style={styles.loading} />
      ) : null}
      {passwordRecovery.status === "error" ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {passwordRecovery.error ?? "This reset link is invalid or expired."}
        </Text>
      ) : null}
      {ready ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="New password"
            placeholderTextColor="#718096"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setConfirmation}
            placeholder="Confirm new password"
            placeholderTextColor="#718096"
            secureTextEntry
            style={styles.input}
            value={confirmation}
          />
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {feedback}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void savePassword()}
            style={styles.button}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save new password</Text>
            )}
          </Pressable>
        </>
      ) : null}
      {!ready && passwordRecovery.status !== "loading" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(auth)/forgot-password")}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>Request another reset link</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  error: {
    backgroundColor: "#FDECEC",
    borderRadius: 10,
    color: "#B42318",
    marginBottom: 12,
    padding: 11,
  },
  eyebrow: {
    color: "#16776A",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 12,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    marginBottom: 12,
    padding: 15,
  },
  loading: { marginVertical: 20 },
  page: {
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  secondaryButton: { alignItems: "center", marginTop: 12, padding: 12 },
  secondaryText: { color: "#16776A", fontWeight: "800" },
  title: {
    color: "#102A43",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 24,
    marginTop: 8,
  },
});
