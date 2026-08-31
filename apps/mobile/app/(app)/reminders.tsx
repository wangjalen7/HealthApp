import { ScrollView, StyleSheet, Text, View } from "react-native";

const reminderPlans = [
  {
    title: "Supplements and medication",
    copy: "Choose times, receive a reminder, and mark each item complete for the day.",
  },
  {
    title: "Blood pressure check",
    copy: "Set a routine prompt to take and log a blood-pressure measurement.",
  },
];

export default function RemindersScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <Text style={styles.eyebrow}>COMING NEXT</Text>
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.copy}>
        This page will keep daily health routines in one calm checklist.
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Notifications are not active yet</Text>
        <Text style={styles.noticeCopy}>
          Nothing is scheduled or marked complete from this placeholder. That
          will be added when iPhone notification permissions are implemented.
        </Text>
      </View>
      <Text style={styles.section}>Planned routines</Text>
      {reminderPlans.map((plan) => (
        <View key={plan.title} style={styles.card}>
          <View style={styles.check}>
            <Text style={styles.checkText}>○</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{plan.title}</Text>
            <Text style={styles.cardCopy}>{plan.copy}</Text>
          </View>
          <Text style={styles.future}>Planned</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  eyebrow: { color: "#16776A", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800", marginTop: 3 },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 18, marginTop: 7 },
  notice: {
    backgroundColor: "#E6F7F3",
    borderColor: "#BFE7DB",
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 22,
    padding: 15,
  },
  noticeTitle: { color: "#12685D", fontSize: 15, fontWeight: "800" },
  noticeCopy: { color: "#486581", lineHeight: 20, marginTop: 5 },
  section: { color: "#243B53", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  card: {
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 15,
  },
  check: {
    alignItems: "center",
    borderColor: "#9FB3C8",
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    marginRight: 11,
    width: 24,
  },
  checkText: { color: "#486581", fontSize: 18, lineHeight: 21 },
  cardContent: { flex: 1 },
  cardTitle: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  cardCopy: { color: "#627D98", fontSize: 13, lineHeight: 19, marginTop: 4 },
  future: { color: "#7B8794", fontSize: 11, fontWeight: "700", marginLeft: 8 },
});
