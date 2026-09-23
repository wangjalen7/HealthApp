import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { getProfileName, saveProfileName } from "./repository";
import { useAccountSetup } from "../onboarding/provider";
import { preferredName } from "../onboarding/model";
import { saveAccountSetup } from "../onboarding/repository";
import {
  DetailScreen,
  FormField,
  SettingsButton,
  ErrorMessage,
  styles,
} from "./settings-ui";
import { useUnsavedChanges } from "./use-unsaved-changes";
export function PersonalDetails() {
  const { session } = useAuth();
  const { setup, accept } = useAccountSetup();
  const [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [preferred, setPreferred] = useState(setup?.preferred_name ?? "");
  const [baseline, setBaseline] = useState({
    first: "",
    last: "",
    preferred: setup?.preferred_name ?? "",
  });
  const [setupBaseline, setSetupBaseline] = useState(setup);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const userId = session?.user.id;
  useEffect(() => {
    let live = true;
    if (!userId) return;
    setLoading(true);
    void getProfileName(userId)
      .then((value) => {
        if (!live) return;
        const f =
            value.firstName ??
            String(session?.user.user_metadata.first_name ?? ""),
          l =
            value.lastName ??
            String(session?.user.user_metadata.last_name ?? "");
        setFirst(f);
        setLast(l);
        setBaseline((b) => ({ ...b, first: f, last: l }));
        setLoading(false);
        setLoaded(true);
        setError("");
      })
      .catch((e) => {
        if (live) {
          setError(
            e instanceof Error ? e.message : "Could not load personal details.",
          );
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [userId, revision]);
  const dirty =
    !loading &&
    (first.trim() !== baseline.first ||
      last.trim() !== baseline.last ||
      preferred.trim() !== baseline.preferred);
  const guard = useUnsavedChanges(dirty, busy);
  async function save() {
    if (!userId || !setupBaseline || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let nameSaved = false;
    try {
      const p = preferredName(preferred);
      if (!first.trim() || !last.trim())
        throw Error("Enter your first and last name.");
      if (first.trim() !== baseline.first || last.trim() !== baseline.last) {
        const saved = await saveProfileName(userId, {
          firstName: first,
          lastName: last,
        });
        setBaseline((b) => ({
          ...b,
          first: saved.firstName,
          last: saved.lastName,
        }));
        nameSaved = true;
      }
      if ((p ?? "") !== baseline.preferred) {
        const saved = await saveAccountSetup(setupBaseline, {
          preferred_name: p,
        });
        accept(saved);
        setSetupBaseline(saved);
        setBaseline((b) => ({ ...b, preferred: saved.preferred_name ?? "" }));
      }
      guard.saved(() => router.back());
    } catch (e) {
      setError(
        (nameSaved ? "First and last name saved. Preferred name: " : "") +
          (e instanceof Error ? e.message : "Could not save details."),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <DetailScreen title="Personal Details">
      {loading ? (
        <ActivityIndicator />
      ) : !loaded ? (
        <>
          <ErrorMessage message={error} />
          <SettingsButton
            label="Retry personal details"
            onPress={() => setRevision((n) => n + 1)}
          />
        </>
      ) : (
        <>
          <View style={styles.card}>
            <FormField
              label="First name"
              value={first}
              onChange={setFirst}
              disabled={busy}
            />
            <FormField
              label="Last name"
              value={last}
              onChange={setLast}
              disabled={busy}
            />
            <FormField
              label="Preferred name"
              value={preferred}
              onChange={setPreferred}
              disabled={busy}
            />
            <Text style={styles.copy}>
              Your preferred name is used around HealthApp. Leave it blank to
              use your name.
            </Text>
          </View>
          <Text style={styles.copy}>
            Age, height and Gender used for estimates are kept with each goal
            calculation. Edit them in the calorie or fluid helper. Recorded
            weight and target weight are separate.
          </Text>
          <ErrorMessage message={error} />
          <SettingsButton
            label={busy ? "Saving..." : "Save details"}
            disabled={busy || !dirty}
            onPress={() => void save()}
          />
          <SettingsButton
            label="Cancel"
            secondary
            disabled={busy}
            onPress={() => guard.leave(() => router.back())}
          />
        </>
      )}
      {guard.confirmation}
    </DetailScreen>
  );
}
