import { prepareReminderSignOut } from "../reminders/lifecycle";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { ActivityIndicator, Text, View } from "react-native";
import { secureStoreAdapter } from "../../lib/secure-store";
import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";
import { removeFaceIdLoginCredential } from "./biometric-auth";
import { useAuth } from "./auth-provider";
import { SettingsButton, ErrorMessage, styles } from "../profile/settings-ui";

const deviceSchema = z.object({
  id: z.string(),
  device_name: z.string(),
  device_id: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string(),
});
type Device = z.infer<typeof deviceSchema>;
export function SecuritySettings({ userId }: { userId: string }) {
  const { setFaceIdEnabled } = useAuth();
  const [devices, setDevices] = useState<Device[]>(),
    [thisDevice, setThisDevice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirmAll, setConfirmAll] = useState(false);
  const load = useCallback(async () => {
    await assertAccount(userId);
    const { data, error } = await supabase.functions.invoke("biometric-auth", {
      body: { action: "list" },
    });
    if (error)
      throw Error("Could not load enrolled devices. Try again when connected.");
    const current = await secureStoreAdapter.getItem(
      "healthapp.biometric-device-id",
    );
    await assertAccount(userId);
    setThisDevice(current);
    const result = z.object({ devices: z.array(deviceSchema) }).safeParse(data);
    if (!result.success)
      throw Error("Could not read enrolled devices. Refresh to try again.");
    setDevices(result.data.devices);
  }, [userId]);
  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Could not load devices."),
    );
  }, [load]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await assertAccount(userId);
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Text style={styles.copy}>
        Devices enrolled for Face ID sign-in. This is not a list of all active
        account sessions.
      </Text>
      {!devices && !error ? <ActivityIndicator /> : null}
      {devices?.length === 0 ? (
        <Text style={styles.copy}>No devices are enrolled.</Text>
      ) : null}
      {devices?.map((device) => (
        <View key={device.id} style={styles.card}>
          <Text style={styles.label}>
            {device.device_name}
            {device.device_id === thisDevice ? " · This device" : ""}
          </Text>
          <Text style={styles.copy}>
            Enrolled {new Date(device.created_at).toLocaleDateString()}
            {"\n"}Expires {new Date(device.expires_at).toLocaleDateString()}
            {device.last_used_at
              ? `\nLast used ${new Date(device.last_used_at).toLocaleString()}`
              : "\nNot used yet"}
          </Text>
          <SettingsButton
            label="Revoke Face ID login"
            secondary
            disabled={busy}
            onPress={() =>
              void act(async () => {
                const { error } = await supabase.functions.invoke(
                  "biometric-auth",
                  { body: { action: "revoke", credentialId: device.id } },
                );
                if (error) throw error;
                await assertAccount(userId);
                if (device.device_id === thisDevice) {
                  const result = await setFaceIdEnabled(false);
                  if (!result.success)
                    throw Error(
                      result.message ?? "Could not revoke this device.",
                    );
                }
                await assertAccount(userId);
                await load();
                setMessage(
                  "Face ID login revoked. Existing sessions remain until signed out.",
                );
              })
            }
          />
        </View>
      ))}
      <ErrorMessage message={error} />
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      <SettingsButton
        label="Refresh devices"
        secondary
        disabled={busy}
        onPress={() => void act(load)}
      />
      {confirmAll ? (
        <>
          <Text style={styles.copy}>
            This ends all account sessions and revokes all Face ID logins. Local
            drafts and pending changes remain on their original devices.
          </Text>
          <SettingsButton
            label="Cancel"
            secondary
            disabled={busy}
            onPress={() => setConfirmAll(false)}
          />
        </>
      ) : null}
      <SettingsButton
        label={
          confirmAll ? "Confirm sign out all devices" : "Sign out all devices"
        }
        destructive
        disabled={busy}
        onPress={() => {
          if (!confirmAll) {
            setConfirmAll(true);
            return;
          }
          void act(async () => {
            const { error } = await supabase.functions.invoke(
              "biometric-auth",
              { body: { action: "revokeAll" } },
            );
            if (error) throw error;
            await assertAccount(userId);
            await removeFaceIdLoginCredential(userId);
            await prepareReminderSignOut(userId);
            const { error: signOutError } = await supabase.auth.signOut({
              scope: "global",
            });
            if (signOutError) throw signOutError;
          });
        }}
      />
    </View>
  );
}
