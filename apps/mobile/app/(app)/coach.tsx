import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Icon } from "../../src/ui/icon";
import { Pressable } from "../../src/ui/pressable";
import { colors, surfaces } from "../../src/ui/theme";

export default function CoachScreen() {
  return (
    <ScreenScrollView contentContainerStyle={styles.page}>
      <Text style={surfaces.title}>AI Coach</Text>
      <View style={[surfaces.card, styles.card]}>
        <View style={styles.symbol}>
          <Icon name="sparkles" size={38} color={colors.purple} />
        </View>
        <Text style={styles.badge}>COMING LATER</Text>
        <Text style={styles.title}>AI Coach is on the way</Text>
        <Text style={styles.copy}>
          Explore your daily summary while coaching is in development.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/(app)")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>View your summary</Text>
          <Icon name="chevron" color={colors.blue} size={15} />
        </Pressable>
      </View>
    </ScreenScrollView>
  );
}
const styles = StyleSheet.create({
  page: { padding: 20 },
  card: { marginTop: 18, padding: 20, alignItems: "center" },
  symbol: {
    width: 86,
    height: 86,
    backgroundColor: "#F3EDFC",
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  badge: {
    color: colors.purple,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.7,
    textAlign: "center",
    marginTop: 12,
  },
  copy: {
    color: colors.secondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 12,
    maxWidth: 320,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.blueSoft,
    borderRadius: 16,
    minHeight: 50,
    paddingHorizontal: 20,
    marginTop: 26,
  },
  buttonText: { color: colors.blue, fontSize: 15, fontWeight: "600" },
});
