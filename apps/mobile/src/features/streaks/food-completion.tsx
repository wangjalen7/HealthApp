import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../auth/auth-provider";
import { supabase } from "../../lib/supabase";
import { colors } from "../../ui/theme";
import { Action } from "../summary/dashboard";
import { deviceZone } from "../summary/calendar";
import { setFoodDayComplete } from "./repository";
export function FoodCompletionControl({ day }: { day: string }) {
  const { session } = useAuth();
  const [confirmed, setConfirmed] = useState<boolean>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setConfirmed(undefined);
    if (session)
      void supabase
        .from("food_day_completions")
        .select("time_zone")
        .eq("user_id", session.user.id)
        .eq("local_day", day)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!live) return;
          if (error)
            setError(
              "Food-day confirmation is unavailable. Check your connection and try again.",
            );
          else setConfirmed(!!data && data.time_zone === deviceZone());
        });
    return () => {
      live = false;
    };
  }, [session, day]);
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Text style={{ color: colors.text, fontWeight: "600" }}>
        {confirmed === undefined
          ? "Checking food-day confirmation…"
          : confirmed
            ? "Food day confirmed complete"
            : "Food day not confirmed"}
      </Text>
      <Text style={{ color: colors.secondary, lineHeight: 20 }}>
        Confirm only when this day's food log is complete. Adding, editing or
        deleting food clears confirmation and requires reconfirmation.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <Action
        label={
          busy
            ? "Saving confirmation…"
            : confirmed
              ? "Undo food-day completion"
              : "Confirm food day complete"
        }
        disabled={busy || confirmed === undefined}
        onPress={() => {
          setBusy(true);
          setError("");
          void setFoodDayComplete(day, !confirmed)
            .then(() => setConfirmed(!confirmed))
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not update confirmation.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
