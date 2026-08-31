import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function CoachScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <Text style={styles.eyebrow}>COMING NEXT</Text>
      <Text style={styles.title}>AI Coach</Text>
      <Text style={styles.copy}>
        A future wellness-only coach will turn your own trends into clear daily
        suggestions.
      </Text>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Your data, in context</Text>
        <Text style={styles.heroCopy}>
          It will consider workouts, cardio, nutrition, weight, blood pressure,
          goals, and recent consistency before offering ideas for the day.
        </Text>
      </View>
      <Text style={styles.section}>Designed safeguards</Text>
      <View style={styles.list}>
        <Text style={styles.item}>• Suggestions, never diagnosis or treatment.</Text>
        <Text style={styles.item}>• Clear explanation of which trends informed an idea.</Text>
        <Text style={styles.item}>• Your data stays private and requires explicit consent before any AI request.</Text>
      </View>
      <Text style={styles.placeholder}>No AI service is connected yet.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  eyebrow: { color: "#16776A", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800", marginTop: 3 },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 18, marginTop: 7 },
  heroCard: {
    backgroundColor: "#102A43",
    borderRadius: 18,
    marginBottom: 24,
    padding: 19,
  },
  heroTitle: { color: "#fff", fontSize: 19, fontWeight: "800" },
  heroCopy: { color: "#D9E2EC", lineHeight: 21, marginTop: 7 },
  section: { color: "#243B53", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  list: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 15,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  item: { color: "#486581", lineHeight: 20 },
  placeholder: { color: "#7B8794", fontSize: 13, fontWeight: "700", marginTop: 18, textAlign: "center" },
});
