import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { TextInput } from "../../ui/text-input";
import { useAuth } from "./auth-provider";
import { authIssue } from "./phone-model";
import { SetupButton, SetupError, ui } from "../onboarding/components";
export function FaceIdSetup() {
  const {
    faceIdAvailability,
    faceIdEnabled,
    setFaceIdEnabled,
    refreshFaceIdAvailability,
  } = useAuth();
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function enable() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await refreshFaceIdAvailability();
      const result = await setFaceIdEnabled(true, password);
      if (!result.success)
        setMessage(
          result.message || "Face ID was canceled. You can set it up later.",
        );
      else {
        setPassword("");
        setMessage("Face ID enabled on this iPhone.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable Face ID.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      await setFaceIdEnabled(false);
      setMessage("Face ID disabled.");
    } catch (e) {
      setMessage(authIssue(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 14 }}>
      <Text style={ui.label}>Face ID on this iPhone</Text>
      <Text style={ui.copy}>
        {faceIdEnabled
          ? "Enabled on this device."
          : faceIdAvailability.available
            ? "Optional. Confirm your account to securely register this iPhone."
            : faceIdAvailability.reason ||
              "Face ID is available on supported iPhones."}
      </Text>
      {faceIdEnabled ? (
        <SetupButton
          label="Disable Face ID"
          secondary
          disabled={busy}
          onPress={() => void disable()}
        />
      ) : faceIdAvailability.available ? (
        <>
          <TextInput
            accessibilityLabel="Current password for Face ID"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            style={ui.input}
          />
          <SetupButton
            label={busy ? "Enabling..." : "Enable Face ID"}
            disabled={busy || !password}
            onPress={() => void enable()}
          />
        </>
      ) : null}
      {message.startsWith("Face ID enabled") ||
      message === "Face ID disabled." ? (
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          {message}
        </Text>
      ) : (
        <SetupError message={message} />
      )}
    </View>
  );
}
