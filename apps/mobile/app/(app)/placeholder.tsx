import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Icon } from "../../src/ui/icon";
import { colors } from "../../src/ui/profile-theme";

/** An intentionally unrevealed feature, not a locked action or a loading state. */
export default function ComingSoonScreen() {
  const compact = useWindowDimensions().height < 700;

  return (
    <ScreenScrollView
      contentContainerStyle={[styles.page, compact && styles.compactPage]}
    >
      <View style={styles.masthead}>
        <Text style={styles.brand}>HEALTHAPP</Text>
        <Icon name="sparkles" size={20} color={colors.purple} />
      </View>
      <View style={styles.hero}>
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.art, compact && styles.compactArt]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 320 300">
            <Circle
              cx={160}
              cy={150}
              r={148}
              fill="#8C7CFF"
              fillOpacity={0.025}
            />
            <Circle
              cx={160}
              cy={150}
              r={128}
              fill="#8C7CFF"
              fillOpacity={0.035}
            />
            <Circle
              cx={160}
              cy={150}
              r={104}
              fill="#8C7CFF"
              fillOpacity={0.045}
            />
            <Circle
              cx={160}
              cy={150}
              r={128}
              fill="none"
              stroke="#929AD0"
              strokeOpacity={0.17}
            />
            <Circle
              cx={160}
              cy={150}
              r={104}
              fill="none"
              stroke="#929AD0"
              strokeOpacity={0.2}
              strokeDasharray="2 9"
            />
            <G transform="rotate(-14 160 150)">
              <Rect
                x={91}
                y={57}
                width={138}
                height={186}
                rx={24}
                fill="#777DA7"
                fillOpacity={0.09}
                stroke="#929AD0"
                strokeOpacity={0.28}
              />
            </G>
            <G transform="rotate(9 160 150)">
              <Rect
                x={91}
                y={57}
                width={138}
                height={186}
                rx={24}
                fill="#777DA7"
                fillOpacity={0.12}
                stroke="#929AD0"
                strokeOpacity={0.4}
              />
            </G>
            <Rect
              x={88}
              y={54}
              width={144}
              height={192}
              rx={24}
              fill="#1C233A"
              stroke="#7380B0"
            />
            <Circle
              cx={160}
              cy={129}
              r={32}
              fill="#A5A5FF"
              fillOpacity={0.08}
              stroke="#ADB8FA"
              strokeOpacity={0.16}
            />
            <Path
              d="M151 128v-8a9 9 0 0 1 18 0v8"
              fill="none"
              stroke="#CCD3FF"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Rect
              x={145}
              y={127}
              width={30}
              height={23}
              rx={7}
              fill="#CCD3FF"
            />
            <Circle cx={160} cy={136} r={2.5} fill="#252D4A" />
            <Path
              d="M160 137v5"
              stroke="#252D4A"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <Rect
              x={115}
              y={185}
              width={90}
              height={6}
              rx={3}
              fill="#91A0D4"
              fillOpacity={0.32}
            />
            <Rect
              x={133}
              y={201}
              width={54}
              height={6}
              rx={3}
              fill="#91A0D4"
              fillOpacity={0.17}
            />
            <Path
              d="M257 76v12m-6-6h12M61 209v8m-4-4h8"
              stroke="#929AD0"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <Circle cx={62} cy={89} r={2.5} fill="#929AD0" />
            <Circle cx={256} cy={210} r={3} fill="#929AD0" fillOpacity={0.5} />
          </Svg>
        </View>
        <Text style={styles.eyebrow}>UNDER WRAPS</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Coming soon.
        </Text>
        <Text style={styles.copy}>
          Something new is taking shape.{"\n"}We're keeping the details quiet.
          For now.
        </Text>
      </View>
      <View style={styles.footer}>
        <View style={styles.status}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>IN THE WORKS</Text>
        </View>
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 24,
    justifyContent: "space-between",
    gap: 24,
    maxWidth: 620,
  },
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 36,
  },
  compactPage: { gap: 8 },
  compactArt: { maxWidth: 180, marginBottom: 12 },
  brand: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.6,
  },
  hero: { alignItems: "center", paddingVertical: 12, flexShrink: 0 },
  art: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 320 / 300,
    marginBottom: 20,
  },
  eyebrow: {
    color: colors.purple,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.4,
    textAlign: "center",
    marginBottom: 16,
  },
  copy: {
    color: colors.secondary,
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center",
    maxWidth: 310,
  },
  footer: { alignItems: "center", paddingTop: 12, paddingBottom: 12 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.purple },
  statusText: {
    color: colors.secondary,
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "600",
  },
});
