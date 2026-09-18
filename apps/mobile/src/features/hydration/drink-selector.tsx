import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors } from "../../ui/theme";
import { trackingStyles } from "../../ui/tracking-styles";
import {
  categoryAlcoholStatus,
  drinkCategories,
  getDrinkCategory,
  type AlcoholStatus,
  type DrinkCategoryId,
} from "./categories";

export function DrinkSelector({
  categoryId,
  alcoholStatus,
  onChange,
  disabled = false,
  inline = false,
}: {
  categoryId: DrinkCategoryId;
  alcoholStatus: AlcoholStatus;
  onChange: (id: DrinkCategoryId, status: AlcoholStatus) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getDrinkCategory(categoryId)!;
  const common = [
    "water",
    "coffee",
    "tea",
    "milk",
    "soda",
    "other",
    categoryId,
  ];
  const visible = drinkCategories.filter(
    (item) =>
      ((inline && expanded) || common.includes(item.id)) &&
      `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <View>
      <Text style={trackingStyles.label}>Drink category</Text>
      {inline && expanded ? (
        <TextInput
          accessibilityLabel="Search drink categories"
          value={query}
          onChangeText={setQuery}
          placeholder="Search drinks"
          style={trackingStyles.input}
        />
      ) : null}
      <View style={styles.choices}>
        {visible.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: item.id === categoryId, disabled }}
            disabled={disabled}
            onPress={() => onChange(item.id, categoryAlcoholStatus(item.id))}
            style={[styles.choice, item.id === categoryId && styles.selected]}
          >
            <Text
              style={[
                styles.text,
                item.id === categoryId && styles.selectedText,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!visible.length ? (
        <Text style={styles.copy}>
          No matching category. Choose Other for a custom drink.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          setExpanded(!expanded);
          setQuery("");
        }}
        style={styles.more}
      >
        <Text style={styles.link}>
          {inline && expanded ? "Show common drinks" : "All drink categories"}
        </Text>
      </Pressable>
      {!inline && expanded ? (
        <Modal
          visible={expanded}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setExpanded(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={{ padding: 20, gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close drink categories"
                onPress={() => setExpanded(false)}
                style={styles.more}
              >
                <Text style={styles.link}>Done</Text>
              </Pressable>
              <Text accessibilityRole="header" style={trackingStyles.title}>
                Drink categories
              </Text>
              <TextInput
                accessibilityLabel="Search drink categories"
                value={query}
                onChangeText={setQuery}
                placeholder="Search drinks"
                style={trackingStyles.input}
              />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 24,
              }}
            >
              {drinkCategories
                .filter((item) =>
                  (item.label + " " + item.group)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={item.label}
                    accessibilityState={{ checked: categoryId === item.id }}
                    onPress={() => {
                      onChange(item.id, categoryAlcoholStatus(item.id));
                      setExpanded(false);
                      setQuery("");
                    }}
                    style={[
                      styles.choice,
                      { marginBottom: 8 },
                      categoryId === item.id && styles.selected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.text,
                        categoryId === item.id && styles.selectedText,
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.copy,
                        { marginBottom: 0 },
                        categoryId === item.id && styles.selectedText,
                      ]}
                    >
                      {item.group}
                    </Text>
                  </Pressable>
                ))}
              {!drinkCategories.some((item) =>
                (item.label + " " + item.group)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange("other", "unknown");
                    setExpanded(false);
                  }}
                  style={styles.more}
                >
                  <Text style={styles.link}>No match. Use Other</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
      {"askAlcohol" in selected ? (
        <>
          <Text style={trackingStyles.label}>
            Does this drink contain alcohol?
          </Text>
          <View style={styles.choices}>
            {(
              [
                ["nonalcoholic", "No alcohol"],
                ["alcoholic", "Contains alcohol"],
                ["unknown", "Unsure"],
              ] as const
            ).map(([status, label]) => (
              <Pressable
                key={status}
                accessibilityRole="radio"
                accessibilityLabel={label}
                disabled={disabled}
                accessibilityState={{
                  checked: status === alcoholStatus,
                  disabled,
                }}
                onPress={() => onChange(categoryId, status)}
                style={[
                  styles.choice,
                  status === alcoholStatus && styles.selected,
                ]}
              >
                <Text
                  style={[
                    styles.text,
                    status === alcoholStatus && styles.selectedText,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.copy}>
        {alcoholStatus === "alcoholic"
          ? "Alcohol is logged separately and does not count toward your fluid goal. This does not mean it contains no water."
          : alcoholStatus === "unknown"
            ? "Save the volume now. Goal contribution stays pending until you confirm whether it contains alcohol."
            : "The consumed beverage volume counts toward your fluid goal. This is not a measure of hydration efficiency. Calories are logged separately in Food."}
      </Text>
      {["bubble_tea", "broth"].includes(categoryId) ? (
        <Text style={styles.copy}>
          Enter the liquid portion only; exclude toppings, solids and uneaten
          ice. Log this fluid once.
        </Text>
      ) : null}
      {categoryId === "alcohol_free" ? (
        <Text style={styles.copy}>
          Choose this only for a confirmed alcohol-free drink. For an uncertain
          mixed drink, choose Other.
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  choice: { ...trackingStyles.chip, minHeight: 44, paddingHorizontal: 12 },
  selected: trackingStyles.chipActive,
  text: trackingStyles.chipText,
  selectedText: trackingStyles.chipTextActive,
  more: { minHeight: 44, justifyContent: "center", marginBottom: 8 },
  link: { color: colors.blue, fontWeight: "600", fontSize: 15 },
  copy: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
});
