import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../src/ui/icon";
import { Pressable } from "../src/ui/pressable";
import { colors, surfaces } from "../src/ui/theme";
import { Redirect } from "expo-router";
import { useAuth } from "../src/features/auth/auth-provider";

const actions = [
  {
    title: "Food",
    copy: "Meals & nutrition",
    href: "/(app)/nutrition",
    icon: "food",
    color: colors.orange,
    tint: colors.orangeSoft,
  },
  {
    title: "Water",
    copy: "Water & other fluids",
    href: "/(app)/water",
    icon: "water",
    color: colors.blue,
    tint: colors.blueSoft,
  },
  {
    title: "Blood pressure",
    copy: "A reading & pulse",
    href: "/(app)/track",
    icon: "heart",
    color: colors.pink,
    tint: colors.pinkSoft,
  },
  {
    title: "Weight",
    copy: "A reading & photo",
    href: "/(app)/weight",
    icon: "weight",
    color: colors.purple,
    tint: colors.purpleSoft,
  },
  {
    title: "Workout",
    copy: "Lifting or cardio",
    href: "/(app)/workout",
    icon: "workout",
    color: colors.green,
    tint: colors.greenSoft,
  },
  {
    title: "Reminders",
    copy: "Your daily routine",
    href: "/(app)/reminders",
    icon: "bell",
    color: colors.teal,
    tint: colors.tealSoft,
  },
] as const;

export default function CreateScreen() {
  const { session, biometricLocked } = useAuth();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  // The root navigator dismisses this sheet back to the existing screen.
  if (biometricLocked) return null;
  return (
    <SafeAreaView edges={["bottom"]} style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={[surfaces.title, { fontSize: 28 }]}
            >
              Quick log
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close create menu"
            accessibilityRole="button"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/(app)")
            }
            style={styles.close}
          >
            <Icon name="close" color={colors.secondary} size={20} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {actions.map((action) => (
            <Pressable
              key={action.title}
              accessibilityLabel={`Open ${action.title}`}
              accessibilityRole="button"
              onPress={() => router.replace(action.href)}
              style={[surfaces.card, styles.action]}
            >
              <View style={[styles.icon, { backgroundColor: action.tint }]}>
                <Icon name={action.icon} color={action.color} size={25} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionCopy}>{action.copy}</Text>
              </View>
              <Icon name="chevron" color={colors.tertiary} size={18} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    paddingTop: 28,
    alignSelf: "center",
    maxWidth: 760,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { gap: 8 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    minHeight: 76,
    borderRadius: 20,
  },
  actionContent: { flex: 1, minWidth: 0 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  actionCopy: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
