import { deleteAccountNotifications } from "../reminders/service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Keyboard, Text, View } from "react-native";
import { useAuth } from "./auth-provider";
import { finishWelcomeIntro } from "./welcome-storage";
import { SetupFrame, SetupButton } from "../onboarding/components";
import { PrivacyBoundary } from "../../ui/privacy-boundary";
import { trackingStyles } from "../../ui/tracking-styles";
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
const DeletionContext = createContext<{
  pending: Pending | null;
  begin: (pending: Pending) => void;
  openRecovery: () => void;
}>({ pending: null, begin: () => {}, openRecovery: () => {} });
export const useAccountDeletion = () => useContext(DeletionContext);
class DeletionUnavailableError extends Error {
  constructor() {
    super(
      "Account deletion is temporarily unavailable. Please try again later.",
    );
  }
}
async function requestDeletion(
  pending: Pending,
  action: "status" | "prepare" | "run" | "cancel",
  password?: string,
) {
  const session = (await supabase.auth.getSession()).data.session;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${supabaseConfig.url}/functions/v1/delete-account`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseConfig.anonKey,
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          action,
          token: pending.token,
          ...(action === "prepare" ? { password, confirmation: "DELETE" } : {}),
        }),
      },
    );
    const result = (await response.json()) as {
      ready?: boolean;
      completed?: boolean;
      cancelled?: boolean;
      prepared?: boolean;
      code?: string;
      message?: string;
    };
    if (response.status === 404 && result.code === "NOT_FOUND")
      throw new DeletionUnavailableError();
    if (result.code === "not_started") return result;
    if (!response.ok)
      throw new Error(
        result.message || "Deletion is not complete. Retry to continue.",
      );
    return result;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The deletion service did not respond. Please try again.",
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  await deleteAccountNotifications(user);
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
  const { session, loading, biometricLocked, unlockWithFaceId, signOut } =
    useAuth();
  const automatic = useRef(false);
  const [pending, setPending] = useState<Pending | null | undefined>();
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function readPending() {
    setMessage("");
    try {
      const raw = await secureStoreAdapter.getItem(pendingKey);
      const value = raw ? (JSON.parse(raw) as Pending) : null;
      if (
        value &&
        (typeof value.user !== "string" || !/^[a-f0-9-]{72}$/.test(value.token))
      )
        throw Error("Invalid cleanup status");
      if (value) await finishWelcomeIntro().catch(() => undefined);
      setPending(value);
    } catch {
      setMessage(
        "Could not read account cleanup status. Retry to safely continue.",
      );
    }
  }
  useEffect(() => {
    void readPending();
  }, []);
  async function finish(result: { cancelled?: boolean; completed?: boolean }) {
    if (!pending) return;
    if (!result.cancelled && !result.completed)
      throw new Error("Deletion is not complete. Retry to continue.");
    if (result.completed) await clearLocalAccount(pending.user);
    await secureStoreAdapter.removeItem(pendingKey);
    setPending(null);
    setRequested(false);
  }
  async function resume(cancelOnly = false) {
    if (!pending || busy || biometricLocked) return;
    setBusy(true);
    setMessage("");
    try {
      const result = cancelOnly
        ? await requestDeletion(pending, "cancel")
        : await resumeDeletion(pending);
      if (cancelOnly && !result.cancelled)
        throw Error(
          "Deletion has already started and cannot be cancelled. Continue deletion to finish cleanup, or sign out and return later.",
        );
      await finish(result);
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
  async function leave() {
    automatic.current = false;
    try {
      await signOut();
      setRequested(false);
      setMessage("");
    } catch {
      setMessage("Could not sign out. Please try again.");
    }
  }
  useEffect(() => {
    if (pending && automatic.current && !biometricLocked) {
      automatic.current = false;
      void resume();
    }
  }, [pending, biometricLocked]);
  if (pending === undefined || loading)
    return (
      <SetupFrame title="Opening HealthApp">
        <ActivityIndicator />
        {message ? (
          <>
            <Text style={{ color: colors.danger }}>{message}</Text>
            <SetupButton label="Retry" onPress={() => void readPending()} />
          </>
        ) : null}
      </SetupFrame>
    );
  const blocked = Boolean(
    pending && (requested || session?.user.id === pending.user),
  );
  return (
    <DeletionContext.Provider
      value={{
        pending,
        begin: (value) => {
          Keyboard.dismiss();
          automatic.current = true;
          setPending(value);
          setRequested(true);
        },
        openRecovery: () => {
          setRequested(true);
          setMessage("");
        },
      }}
    >
      {blocked ? (
        <PrivacyBoundary
          locked={biometricLocked}
          lockScreen={
            <SetupFrame
              title="HealthApp is locked"
              copy="Unlock to manage your deletion request."
            >
              <SetupButton
                label="Unlock with Face ID"
                onPress={() => void unlockWithFaceId()}
              />
              <SetupButton
                label="Sign out"
                secondary
                onPress={() => void leave()}
              />
            </SetupFrame>
          }
        >
          <SetupFrame
            title="Finish account deletion"
            copy="A deletion request is saved on this device. Continue to check its status and finish cleanup. You can cancel only if server deletion has not started."
          >
            {message ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {message}
              </Text>
            ) : null}
            <SetupButton
              label={busy ? "Checking deletion..." : "Continue deletion"}
              disabled={busy}
              onPress={() => void resume()}
            />
            <SetupButton
              label="Cancel deletion request"
              secondary
              disabled={busy}
              onPress={() => void resume(true)}
            />
            <SetupButton
              label={session ? "Sign out" : "Back to sign in"}
              secondary
              disabled={busy}
              onPress={() => void leave()}
            />
            <Text style={{ color: colors.secondary }}>
              Signing out keeps your recovery request on this device. Keep the
              app installed until cleanup finishes.
            </Text>
          </SetupFrame>
        </PrivacyBoundary>
      ) : (
        children
      )}
    </DeletionContext.Provider>
  );
}
export function DeleteAccountSection({ user }: { user: string }) {
  const { begin, pending: existing } = useAccountDeletion();
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
        disabled={Boolean(existing)}
        onPress={() => {
          setMessage("");
          setOpen(true);
        }}
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
          style={trackingStyles.input}
        />
        <TextInput
          accessibilityLabel="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          autoCapitalize="characters"
          value={confirmation}
          onChangeText={setConfirmation}
          editable={!busy}
          style={trackingStyles.input}
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
            Keyboard.dismiss();
            void (async () => {
              const readiness = await requestDeletion(pending, "status");
              if (!readiness.ready) throw new DeletionUnavailableError();
              await secureStoreAdapter.setItem(
                pendingKey,
                JSON.stringify(pending),
              );
              try {
                await requestDeletion(pending, "prepare", password);
                setPassword("");
                begin(pending);
              } catch (error) {
                if (error instanceof DeletionUnavailableError) {
                  await secureStoreAdapter.removeItem(pendingKey);
                  throw error;
                }
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
