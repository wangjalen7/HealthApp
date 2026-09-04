import { ScrollView, StyleSheet, Text } from "react-native";

export default function CoachScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <Text style={styles.eyebrow}>COMING NEXT</Text>
      <Text style={styles.title}>AI Coach</Text>
      <Text style={styles.placeholder}>Not available yet.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  eyebrow: {
    color: "#16776A",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800", marginTop: 3 },
  placeholder: {
    color: "#7B8794",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
  },
});
