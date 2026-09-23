import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { assertAccount, retryPendingMutation } from "../../lib/mutations";
import { resolveConflict } from "../vitals/storage";
import { syncVitals } from "../vitals/sync";
import { loadPendingData, type PendingData } from "./sync-status";
import { SettingsButton, ErrorMessage, styles } from "./settings-ui";
import { colors } from "../../ui/profile-theme";
export function PendingChanges({
  userId,
  revision = 0,
}: {
  userId: string;
  revision?: number;
}) {
  const [data, setData] = useState<PendingData>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = data?.operations,
    samples = data?.readings ?? [],
    online = data?.online ?? [];
  const loadPending = useCallback(async () => {
    const next = await loadPendingData(userId);
    await assertAccount(userId);
    setData(next);
  }, [userId]);
  useEffect(() => {
    void loadPending().catch((e) =>
      setError(
        e instanceof Error ? e.message : "Could not load pending saves.",
      ),
    );
  }, [loadPending, revision]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
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
  };
  const button = (label: string, work: () => Promise<void>) => (
    <SettingsButton
      label={label}
      secondary
      disabled={busy}
      onPress={() => void act(work)}
    />
  );
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={styles.label}>
        Pending readings and saves
      </Text>
      {button("Refresh pending changes", loadPending)}
      {pending?.length === 0 && online.length === 0 ? (
        <Text style={{ color: colors.text }}>
          No pending health-data saves on this device.
        </Text>
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
                    if (result.error) setError(result.error);
                    else setMessage("Reading saved and synced.");
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
            if (result.error) setError(result.error);
            else setMessage("Reading sync completed.");
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
              setError(
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

      <ErrorMessage message={error} />
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
