import { secureStoreAdapter } from "../../lib/secure-store";
import { useState } from "react";
import { Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable } from "../../ui/pressable";
import { colors, spacing } from "../../ui/profile-theme";
import { supabase } from "../../lib/supabase";
import { assertAccount, retryPendingMutation } from "../../lib/mutations";
import type { PendingMutation } from "../../lib/mutation-model";
import {
  cachedVitals,
  queuedChanges,
  resolveConflict,
} from "../vitals/storage";
import { syncVitals } from "../vitals/sync";
import type { VitalOperation } from "../vitals/store-model";
import type { VitalSample } from "../../domain/vitals";
import { removeFaceIdLoginCredential } from "./biometric-auth";

type Device = {
  id: string;
  device_name: string;
  device_id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};
export function SecuritySettings({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[]>();
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [pending, setPending] = useState<VitalOperation[]>();
  const [samples, setSamples] = useState<VitalSample[]>([]);
  const [online, setOnline] = useState<
    { key: string; operation: PendingMutation }[]
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await assertAccount(userId);
      await work();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadPending = async () => {
    const [operations, readings, keys] = await Promise.all([
      queuedChanges(userId),
      cachedVitals(userId),
      AsyncStorage.getAllKeys(),
    ]);
    const values = await AsyncStorage.multiGet(
      keys.filter((key) =>
        key.startsWith(`healthapp:pending-write:v2:${userId}:`),
      ),
    );
    setOnline(
      values.flatMap(([key, value]) =>
        value ? [{ key, operation: JSON.parse(value) as PendingMutation }] : [],
      ),
    );
    setPending(operations);
    setSamples(readings);
  };
  const button = (label: string, work: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={() => void act(work)}
      style={{ paddingVertical: 12 }}
    >
      <Text style={{ color: colors.blue }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: spacing.sm }}>
      {button("Enrolled Face ID devices", async () => {
        const { data, error } = await supabase.functions.invoke(
          "biometric-auth",
          { body: { action: "list" } },
        );
        if (error)
          throw new Error("Could not load devices. Try again when connected.");
        setThisDevice(
          await secureStoreAdapter.getItem("healthapp.biometric-device-id"),
        );
        setDevices(data.devices);
      })}
      {devices?.length === 0 ? (
        <Text style={{ color: colors.text }}>No devices are enrolled.</Text>
      ) : null}
      {devices?.map((device) => (
        <View key={device.id}>
          <Text style={{ color: colors.text }}>
            {device.device_name} · enrolled{" "}
            {new Date(device.created_at).toLocaleString()}
          </Text>
          <Text style={{ color: colors.text }}>
            {device.device_id === thisDevice ? "This device · " : ""}
            Expires {new Date(device.expires_at).toLocaleDateString()}
            {device.last_used_at
              ? ` · last used ${new Date(device.last_used_at).toLocaleDateString()}`
              : ""}
          </Text>
          {button("Revoke Face ID login", async () => {
            const { error } = await supabase.functions.invoke(
              "biometric-auth",
              { body: { action: "revoke", credentialId: device.id } },
            );
            if (error) throw error;
            setDevices((current) => current?.filter((d) => d.id !== device.id));
            setMessage(
              "Face ID login revoked for this device. Existing sessions can be ended with Sign out all devices.",
            );
          })}
        </View>
      ))}
      {button("Pending readings and saves", loadPending)}
      {pending?.length === 0 && online.length === 0 ? (
        <Text style={{ color: colors.text }}>All saves are confirmed.</Text>
      ) : null}
      {pending?.map((op) => {
        const local =
          samples.find((s) => s.id === op.samples[0].id) ?? op.samples[0];
        const remote = op.conflict?.current;
        return (
          <View key={op.id}>
            <Text style={{ color: colors.text }}>
              {local.kind.replaceAll("_", " ")} ·{" "}
              {new Date(local.occurredAt).toLocaleString()}
            </Text>
            <Text style={{ color: colors.text }}>
              On this device:{" "}
              {local.deletedAt
                ? "delete reading"
                : `${local.value} ${local.unit}`}
            </Text>
            {op.conflict ? (
              <>
                <Text style={{ color: colors.text }}>
                  Other device:{" "}
                  {!remote || remote.deletedAt
                    ? "deleted or no longer available"
                    : `${remote.value} ${remote.unit}`}
                </Text>
                {button("Use the saved version", async () => {
                  await resolveConflict(
                    userId,
                    local.id,
                    "remote",
                    remote?.version ?? null,
                  );
                  await loadPending();
                })}
                {button(
                  remote && !remote.deletedAt
                    ? "Apply my change to the latest reading"
                    : "Save my value as a new reading",
                  async () => {
                    await resolveConflict(
                      userId,
                      local.id,
                      "local",
                      remote?.version ?? null,
                    );
                    const result = await syncVitals(userId);
                    setMessage(result.error ?? "Reading saved and synced.");
                    await loadPending();
                  },
                )}
              </>
            ) : (
              <Text style={{ color: colors.text }}>
                Waiting to sync{op.error ? `: ${op.error}` : ""}
              </Text>
            )}
          </View>
        );
      })}
      {pending?.length
        ? button("Retry reading sync", async () => {
            const result = await syncVitals(userId);
            setMessage(result.error ?? "Readings synced.");
            await loadPending();
          })
        : null}
      {online.map(({ key, operation }) => (
        <View key={key}>
          <Text style={{ color: colors.text }}>
            {operation.completed ? "Confirmed" : "Unconfirmed"}{" "}
            {String(
              operation.request.table ?? operation.request.action,
            ).replaceAll("_", " ")}{" "}
            save
          </Text>
          {button("Check and retry this save", async () => {
            const reply = await retryPendingMutation(userId, key, operation);
            await assertAccount(userId);
            if (reply?.status === "conflict") {
              setMessage(
                "The save was rejected because the record changed. Your draft is retained; reopen the latest record to compare.",
              );
            } else {
              setMessage(
                "Save confirmed. Check History before logging this entry again; any unfinished form remains on this device.",
              );
            }
            await loadPending();
          })}
        </View>
      ))}
      {button(
        confirmAll ? "Confirm sign out all devices" : "Sign out all devices",
        async () => {
          if (!confirmAll) {
            setConfirmAll(true);
            setMessage(
              "This ends all sessions and revokes all Face ID logins. Local drafts and pending changes remain on their original devices.",
            );
            return;
          }
          const { error } = await supabase.functions.invoke("biometric-auth", {
            body: { action: "revokeAll" },
          });
          if (error) throw error;
          await removeFaceIdLoginCredential(userId);
          const { error: signOutError } = await supabase.auth.signOut({
            scope: "global",
          });
          if (signOutError) throw signOutError;
        },
      )}
      {message ? (
        <Text style={{ color: colors.text }} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
