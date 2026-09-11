import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Icon } from "../../src/ui/icon";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { trackingStyles as shared } from "../../src/ui/tracking-styles";

export default function CoachScreen() {
  return (
    <ScreenScrollView contentContainerStyle={shared.page}>
      <Text style={shared.title}>AI Coach</Text>
      <View style={styles.card}>
        <Icon name="sparkles" size={36} color={colors.purple} />
        <Text style={styles.title}>Turn your meal into food labels</Text>
        <Text style={styles.copy}>
          Take a photo or tell me what you ate and how much. Add preparation
          details for a better estimate.
        </Text>
        <View style={styles.example}>
          <Text style={shared.section}>One plate, separate foods</Text>
          <Text style={styles.copy}>
            Pasta · Tomato sauce · Grilled chicken
          </Text>
          <Text style={styles.copy}>
            Each gets an editable description, portion, calories, protein,
            carbs, fat, fiber, sugar, and sodium.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Estimate meal with AI from a photo or description"
          style={styles.estimateButton}
          onPress={() =>
            router.navigate({
              pathname: "/(app)/nutrition",
              params: { estimate: "true" },
            })
          }
        >
          <Icon name="sparkles" size={20} color={colors.surface} />
          <Text style={shared.buttonText}>Estimate from photo or text</Text>
        </Pressable>
        <Text style={styles.copy}>
          Review the estimates, add them to your current meal, then save. AI
          processing uses OpenAI with your permission.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
const styles = StyleSheet.create({
  card: { ...shared.card, gap: 18 },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  copy: { color: colors.secondary, fontSize: 15, lineHeight: 23 },
  example: {
    backgroundColor: colors.blueSoft,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  estimateButton: {
    ...shared.button,
    flexDirection: "row",
    gap: 8,
  },
});
