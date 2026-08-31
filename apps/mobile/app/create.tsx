import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const actions = [
  {
    title: "Food",
    copy: "Calories and protein",
    href: "/(app)/nutrition",
    wide: false,
  },
  {
    title: "Health",
    copy: "Blood pressure and pulse",
    href: "/(app)/track",
    wide: false,
  },
  {
    title: "Exercise",
    copy: "Lifting or cardio",
    href: "/(app)/workout",
    wide: false,
  },
  {
    title: "Weight",
    copy: "Body-weight reading",
    href: "/(app)/weight",
    wide: false,
  },
  {
    title: "Reminders",
    copy: "Medication, supplements, and BP prompts",
    href: "/(app)/reminders",
    wide: true,
  },
] as const;

export default function CreateScreen() {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>QUICK LOG</Text>
          <Text style={styles.title}>What would you like to add?</Text>
        </View>
        <Pressable
          accessibilityLabel="Close create menu"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            accessibilityLabel={`Open ${action.title}`}
            accessibilityRole="button"
            key={action.title}
            onPress={() => router.replace(action.href)}
            style={[styles.action, action.wide && styles.wideAction]}
          >
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Text style={styles.actionCopy}>{action.copy}</Text>
            <Text style={styles.actionArrow}>→</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flex: 1, padding: 20 },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  eyebrow: { color: "#16776A", fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: "#102A43", fontSize: 22, fontWeight: "800", marginTop: 5 },
  closeButton: { paddingHorizontal: 2, paddingVertical: 5 },
  closeText: { color: "#486581", fontSize: 14, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 98,
    padding: 14,
    width: "48%",
  },
  actionTitle: { color: "#102A43", fontSize: 17, fontWeight: "800" },
  wideAction: { width: "100%" },
  actionCopy: { color: "#627D98", fontSize: 12, lineHeight: 17, marginTop: 5, paddingRight: 12 },
  actionArrow: { bottom: 10, color: "#16776A", fontSize: 19, fontWeight: "700", position: "absolute", right: 13 },
});
