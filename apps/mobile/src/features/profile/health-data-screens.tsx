import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { useAccountSetup } from "../onboarding/provider";
import {
  DetailScreen,
  SettingsButton,
  SettingsRow,
  SettingsGroup,
  ErrorMessage,
  styles,
} from "./settings-ui";
import { loadPendingData, syncLabel, type PendingData } from "./sync-status";
import { PendingChanges } from "./pending-changes";
import { synchronizeHealthData } from "../healthkit/unified-sync";
import {
  connectHealthKit,
  healthKitAvailability,
  loadHealthKitSyncState,
} from "../healthkit/sync";
import type {
  HealthKitAvailability,
  HealthKitSyncState,
} from "../healthkit/types";
import {
  collectHealthDataExport,
  getProgressPhotoExportSummary,
} from "../data-export/repository";
import { shareHealthDataExport } from "../data-export/archive";
import { formatBytes } from "../data-export/model";
import { assertAccount } from "../../lib/mutations";
import { useUnsavedChanges } from "./use-unsaved-changes";

export function AppleHealthScreen() {
  const { session } = useAuth();
  const user = session!.user.id;
  const [availability, setAvailability] = useState<HealthKitAvailability>(),
    [state, setState] = useState<HealthKitSyncState>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      healthKitAvailability(),
      loadHealthKitSyncState(user),
    ]);
    await assertAccount(user);
    setAvailability(a);
    setState(s);
  }, [user]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  return (
    <DetailScreen title="Apple Health">
      <View style={styles.card}>
        <Text style={styles.label}>
          {state?.connected
            ? "Connected"
            : availability
              ? availability.available
                ? "Not connected"
                : "Unavailable"
              : "Checking Apple Health"}
        </Text>
        <Text style={styles.copy}>
          Read-only imports of weight and blood pressure from this iPhone.
          Account synchronization keeps your HealthApp records available across
          devices.
        </Text>
        {state?.lastImportedAt ? (
          <Text style={styles.copy}>
            Last import: {new Date(state.lastImportedAt).toLocaleString()}
          </Text>
        ) : null}
        <Text style={styles.copy}>
          {availability?.reason ??
            "Manage read permissions in the Health app. Apple Health does not reveal whether an empty result means no readings or denied permission."}
        </Text>
      </View>
      <ErrorMessage message={error} />
      {error ? (
        <SettingsButton
          label="Retry Apple Health status"
          secondary
          disabled={busy}
          onPress={() => {
            setError("");
            void load().catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not load Apple Health status.",
              ),
            );
          }}
        />
      ) : null}
      {!state?.connected ? (
        <SettingsButton
          label={busy ? "Connecting..." : "Connect Apple Health"}
          disabled={busy || !availability?.available}
          onPress={() => {
            setBusy(true);
            setError("");
            void connectHealthKit(user)
              .then(async () => load())
              .catch((e) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not connect Apple Health.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      <Text style={styles.copy}>
        Automatic imports continue when Summary synchronizes. Use Sync & Pending
        Changes to run the same sync manually.
      </Text>
      <SettingsButton
        label="Sync & Pending Changes"
        secondary
        onPress={() => router.replace("/profile/sync")}
      />
    </DetailScreen>
  );
}
export function SyncScreen() {
  const { session } = useAuth();
  const { reload } = useAccountSetup();
  const user = session!.user.id;
  const [status, setStatus] = useState<PendingData>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    const result = await loadPendingData(user);
    await assertAccount(user);
    setStatus(result);
  }, [user]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const refresh = () =>
        void load().catch((e) => {
          if (live)
            setError(
              e instanceof Error ? e.message : "Could not load sync status.",
            );
        });
      refresh();
      const timer = setInterval(refresh, 3000);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [load]),
  );
  async function sync() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await synchronizeHealthData(user);
      await load();
      setRevision((n) => n + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <DetailScreen title="Sync & Pending Changes">
      <View style={styles.card}>
        <Text style={styles.label}>{busy ? "Syncing" : syncLabel(status)}</Text>
        <Text style={styles.copy}>
          {status?.last
            ? `Last successful account sync: ${new Date(status.last).toLocaleString()}`
            : "No successful account sync recorded yet."}
        </Text>
        <Text style={styles.copy}>
          Automatic synchronization stays on. Manual sync also imports Apple
          Health when connected; other unconfirmed saves have individual retry
          actions below.
        </Text>
        {status?.attention && status.issue ? (
          <Text style={styles.copy}>{status.issue}</Text>
        ) : null}
        <SettingsButton
          label={busy ? "Syncing..." : "Sync now"}
          disabled={busy}
          onPress={() => void sync()}
        />
      </View>
      <ErrorMessage message={error} />
      {status?.setupPending ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            A preferences save is waiting for confirmation.
          </Text>
          <SettingsButton
            label="Retry preferences save"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void reload()
                .then(load)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          />
        </View>
      ) : null}
      <PendingChanges userId={user} revision={revision} />
    </DetailScreen>
  );
}
export function ExportScreen() {
  const { session } = useAuth();
  const user = session!.user;
  const [photos, setPhotos] = useState(false),
    [summary, setSummary] = useState<{ count: number; bytes: number }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);
  const guard = useUnsavedChanges(false, busy);
  useEffect(() => {
    let live = true;
    void getProgressPhotoExportSummary(user.id)
      .then((s) => {
        if (live) setSummary(s);
      })
      .catch(() => {
        if (live)
          setError(
            "Photo size is unavailable. You can retry or export your records.",
          );
      });
    return () => {
      live = false;
    };
  }, [user.id, revision]);
  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("Collecting your data...");
    try {
      await assertAccount(user.id);
      const data = await collectHealthDataExport(user);
      await assertAccount(user.id);
      await shareHealthDataExport(data, photos, (p) => {
        if (p.totalPhotos)
          setMessage(
            `Adding photo ${p.completedPhotos} of ${p.totalPhotos}...`,
          );
      });
      setMessage("Export finished.");
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "Could not export your data.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DetailScreen title="Export Data">
      <Text style={styles.copy}>
        Export your saved health records, goals and account information in a
        portable archive.
      </Text>
      <SettingsGroup>
        <SettingsRow
          label="Include Progress Photos"
          icon="image"
          toggle={{ value: photos, onChange: setPhotos }}
          disabled={busy}
          last
        />
      </SettingsGroup>
      {summary ? (
        <Text style={styles.copy}>
          {summary.count} progress {summary.count === 1 ? "photo" : "photos"}
          {photos
            ? ` · About ${formatBytes(summary.bytes)} of photos, plus records before archive compression.`
            : " · Photo files will not be included."}
        </Text>
      ) : !error ? (
        <ActivityIndicator />
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>About your export</Text>
        <Text style={styles.copy}>
          Includes spreadsheet-friendly CSV files and complete JSON records.
          Photo metadata stays in the records even when photo files are
          excluded.
        </Text>
        <Text style={styles.copy}>
          Large photo exports can take time and need free space. The archive
          contains private health information; choose where to save or share it.
        </Text>
      </View>
      <ErrorMessage message={error} />
      {!summary && error ? (
        <SettingsButton
          label="Retry photo summary"
          secondary
          disabled={busy}
          onPress={() => {
            setError("");
            setRevision((n) => n + 1);
          }}
        />
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      <SettingsButton
        label={busy ? "Exporting..." : "Export"}
        disabled={busy}
        onPress={() => void start()}
      />
      {guard.confirmation}
    </DetailScreen>
  );
}
