import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { trackingStyles } from "../../ui/tracking-styles";
import { colors } from "../../ui/theme";
import { useAuth } from "../auth/auth-provider";
import { DrinkSelector } from "./drink-selector";
import {
  getDrinkCategory,
  type AlcoholStatus,
  type DrinkCategoryId,
} from "./categories";
import { classifyHydration, type HydrationHistoryEntry } from "./repository";

export function ClassifyDrink({
  entry,
  onChanged,
}: {
  entry: HydrationHistoryEntry;
  onChanged: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [category, setCategory] = useState<DrinkCategoryId>("other");
  const [alcohol, setAlcohol] = useState<AlcoholStatus>("unknown");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Classify ${entry.fluidName}`}
        onPress={() => {
          setCategory(getDrinkCategory(entry.categoryId)?.id ?? "other");
          setAlcohol(
            (entry.alcoholStatus as AlcoholStatus | null) ?? "unknown",
          );
          setError("");
          setVisible(true);
        }}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.blue }}>Change drink category</Text>
      </Pressable>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!saving) setVisible(false);
        }}
      >
        <ScrollView
          contentContainerStyle={{ ...trackingStyles.page, paddingTop: 40 }}
        >
          <Text accessibilityRole="header" style={trackingStyles.title}>
            {entry.fluidName}
          </Text>
          <Text style={{ color: colors.secondary, marginBottom: 16 }}>
            Changing the category recalculates this entry's goal contribution.
            Its consumed volume stays the same.
          </Text>
          <DrinkSelector
            inline
            categoryId={category}
            alcoholStatus={alcohol}
            disabled={saving}
            onChange={(id, status) => {
              setCategory(id);
              setAlcohol(status);
            }}
          />
          {error ? (
            <Text accessibilityLiveRegion="polite" style={trackingStyles.error}>
              {error}
            </Text>
          ) : null}
          <View style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              style={trackingStyles.button}
              onPress={async () => {
                if (!session) return;
                setSaving(true);
                setError("");
                try {
                  await classifyHydration(
                    session.user.id,
                    entry.id,
                    category,
                    alcohol,
                  );
                  await onChanged();
                  setVisible(false);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not update drink.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Text style={trackingStyles.buttonText}>
                {saving ? "Saving..." : "Save category"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setVisible(false)}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.blue }}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}
