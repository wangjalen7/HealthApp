import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { secureStoreAdapter } from "../../lib/secure-store";
import { supabaseConfig } from "../../lib/config";
import {
  supabase,
  removeLegacyPersistedSupabaseSession,
} from "../../lib/supabase";
import { createUuid } from "../../lib/id";
import { SettingsSheet } from "../../ui/settings-sheet";
import { TextInput } from "../../ui/text-input";
import { colors } from "../../ui/theme";
import { Action } from "../summary/dashboard";
import { clearAccountVitals } from "../vitals/storage";
import {
  removeFaceIdLoginCredential,
  getRememberedLoginAccount,
  removeRememberedLoginAccount,
} from "./biometric-auth";
import { listReminders } from "../reminders/repository";
import { cancelReminderNotifications } from "../reminders/notifications";
import { drainHealthSync } from "../healthkit/unified-sync";
import { clearNutritionDraft } from "../nutrition/draft";
import { clearWorkoutDraft } from "../training/workout-draft";
import { clearCardioDraft } from "../training/cardio-draft";
import { drainVitalSync } from "../vitals/sync";
import { clearPrivateCache } from "./private-cache";
type Pending = { user: string; token: string };
const pendingKey = "healthapp.account-deletion-pending";
const DeletionContext = createContext<(pending: Pending) => void>(() => {});
async function requestDeletion(
  pending: Pending,
  action: "prepare" | "run" | "cancel",
  password?: string,
) {
  const session = (await supabase.auth.getSession()).data.session;
  const response = await fetch(
    `${supabaseConfig.url}/functions/v1/delete-account`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseConfig.anonKey,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        action,
        token: pending.token,
        ...(action === "prepare" ? { password, confirmation: "DELETE" } : {}),
      }),
    },
  );
  const result = (await response.json()) as {
    completed?: boolean;
    cancelled?: boolean;
    prepared?: boolean;
    code?: string;
    message?: string;
  };
  if (result.code === "not_started") return result;
  if (!response.ok)
    throw new Error(
      result.message || "Deletion is not complete. Retry to continue.",
    );
  return result;
}
async function resumeDeletion(pending: Pending) {
  const result = await requestDeletion(pending, "run");
  if (result.code !== "not_started") return result;
  const sealed = await requestDeletion(pending, "cancel");
  return sealed.cancelled ? sealed : requestDeletion(pending, "run");
}
async function clearLocalAccount(user: string) {
  // Stop foreground refreshes by unmounting the navigator, then drain current sync.
  await drainHealthSync(user);
  await drainVitalSync(user);
  const reminders = await listReminders(user, true);
  await cancelReminderNotifications(
    reminders.flatMap((r) => r.notificationIds),
  );
  await clearAccountVitals(user);
  await clearNutritionDraft(user);
  await clearWorkoutDraft(user);
  await clearCardioDraft(user);
  await removeFaceIdLoginCredential(user);
  if ((await getRememberedLoginAccount())?.userId === user)
    await removeRememberedLoginAccount();
  await removeLegacyPersistedSupabaseSession();
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(
    keys.filter(
      (key) => key.startsWith("healthapp") && key.split(/[:.]/).includes(user),
    ),
  );
  await clearPrivateCache();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
export function AccountDeletionGate({ children }: { children: ReactNode }) {
  const attempted = useRef("");
  const [pending, setPending] = useState<Pending | null | undefined>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void secureStoreAdapter
      .getItem(pendingKey)
      .then((raw) => setPending(raw ? (JSON.parse(raw) as Pending) : null))
      .catch(() =>
        setMessage(
          "Could not read account cleanup status. Reopen the app to retry.",
        ),
      );
  }, []);
  async function resume() {
    if (!pending || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await resumeDeletion(pending);
      if (result.cancelled) {
        await secureStoreAdapter.removeItem(pendingKey);
        setPending(null);
        return;
      }
      if (!result.completed)
        throw new Error("Deletion is not complete. Retry to continue.");
      await clearLocalAccount(pending.user);
      await secureStoreAdapter.removeItem(pendingKey);
      setPending(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Cleanup is not complete. Retry to continue.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (pending && attempted.current !== pending.token) {
      attempted.current = pending.token;
      void resume();
    }
  }, [pending]);
  if (pending === undefined)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: colors.text }}>{message}</Text>
      </View>
    );
  if (pending)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          gap: 20,
          backgroundColor: colors.background,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 24, fontWeight: "700", color: colors.text }}
        >
          Finish account deletion
        </Text>
        <Text style={{ color: colors.secondary }}>
          Your deletion request is saved on this device. Continue to remove
          remaining server data and clear this device. Keep this app installed
          until cleanup finishes.
        </Text>
        {message ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {message}
          </Text>
        ) : null}
        <Action
          primary
          label={busy ? "Deleting account..." : "Continue deletion"}
          disabled={busy}
          onPress={() => void resume()}
        />
      </View>
    );
  return (
    <DeletionContext.Provider value={setPending}>
      {children}
    </DeletionContext.Provider>
  );
}
export function DeleteAccountSection({ user }: { user: string }) {
  const begin = useContext(DeletionContext);
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <View
      style={{
        padding: 18,
        gap: 10,
        backgroundColor: colors.surface,
        borderRadius: 24,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}
      >
        Delete account
      </Text>
      <Text style={{ color: colors.secondary }}>
        Permanently remove your account and associated HealthApp data.
      </Text>
      <Action
        destructive
        label="Delete Account"
        onPress={() => setOpen(true)}
      />
      <SettingsSheet
        visible={open}
        title="Delete account?"
        icon="delete"
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setPassword("");
            setConfirmation("");
          }
        }}
      >
        <Text style={{ color: colors.text }}>
          This permanently deletes your account, health logs, meals, workouts,
          photos, goals, chats and device credentials. It cannot be undone. Data
          in Apple Health and exports you saved outside HealthApp remain there.
        </Text>
        <TextInput
          accessibilityLabel="Current password for account deletion"
          placeholder="Current password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          style={{
            color: colors.text,
            backgroundColor: colors.surface,
            padding: 14,
            borderRadius: 12,
          }}
        />
        <TextInput
          accessibilityLabel="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          autoCapitalize="characters"
          value={confirmation}
          onChangeText={setConfirmation}
          editable={!busy}
          style={{
            color: colors.text,
            backgroundColor: colors.surface,
            padding: 14,
            borderRadius: 12,
          }}
        />
        {message ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {message}
          </Text>
        ) : null}
        <Action
          destructive
          label={busy ? "Verifying..." : "Permanently delete account"}
          disabled={busy || confirmation !== "DELETE" || !password}
          onPress={() => {
            setBusy(true);
            setMessage("");
            const pending = { user, token: createUuid() + createUuid() };
            void (async () => {
              await secureStoreAdapter.setItem(
                pendingKey,
                JSON.stringify(pending),
              );
              try {
                await requestDeletion(pending, "prepare", password);
                setPassword("");
                begin(pending);
              } catch (error) {
                // Resolve ambiguous replies with the saved capability before allowing reuse.
                const result = await resumeDeletion(pending).catch(
                  (failure: unknown) => {
                    begin(pending);
                    throw failure;
                  },
                );
                if (result.cancelled) {
                  await secureStoreAdapter.removeItem(pendingKey);
                  throw error;
                }
                setPassword("");
                begin(pending);
              }
            })()
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not start deletion. Retry.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      </SettingsSheet>
    </View>
  );
}
