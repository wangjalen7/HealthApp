import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function CheckEmailScreen() {
  const router = useRouter();
  const { email, purpose } = useLocalSearchParams<{
    email?: string;
    purpose?: string;
  }>();
  const isReset = purpose === "reset";
  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>CHECK YOUR EMAIL</Text>
      <Text style={styles.title}>
        {isReset ? "Reset link sent" : "Confirm your account"}
      </Text>
      <Text style={styles.copy}>
        {isReset
          ? `If an account exists for ${email ?? "that email address"}, a reset link was sent. Check spam before trying again.`
          : `We sent a confirmation link to ${email ?? "your email address"}. Open it, then return here and sign in.`}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace("/(auth)/sign-in")}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Go to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  eyebrow: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.8,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 8,
  },
  copy: {
    color: "#52606D",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    marginTop: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
