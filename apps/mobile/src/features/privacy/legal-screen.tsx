import { Link, router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import policies from "../../../../../legal/policies.json";
import release from "../../../../../legal/release.json";
import {
  DetailScreen,
  SettingsGroup,
  SettingsRow,
  styles,
} from "../profile/settings-ui";
import { colors } from "../../ui/profile-theme";

export function LegalScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const policy = policies.find((p) => p.slug === document);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/(auth)/sign-in");
  return (
    <DetailScreen
      title={policy?.title ?? "Privacy & Legal"}
      onBack={back}
      backLabel="Back"
    >
      {release.status !== "approved" ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>
            Development draft
          </Text>
          <Text style={styles.copy}>
            Not yet effective. Owner, contact and launch details must be
            approved before public release.
          </Text>
          <Text style={styles.caption}>
            Version {release.version} · Reviewed {release.reviewedAt}
          </Text>
        </View>
      ) : (
        <Text style={styles.caption}>
          Version {release.version} · Effective {release.effectiveDate}
        </Text>
      )}
      {policy ? (
        policy.sections.map((section) => (
          <View key={section.heading} style={{ marginBottom: 20 }}>
            <Text
              accessibilityRole="header"
              style={[styles.label, { marginBottom: 10 }]}
            >
              {section.heading}
            </Text>
            {section.paragraphs.map((p) => (
              <Text
                selectable
                key={p}
                style={[styles.copy, { color: colors.text }]}
              >
                {p}
              </Text>
            ))}
          </View>
        ))
      ) : (
        <SettingsGroup>
          {policies.map((p, i) => (
            <SettingsRow
              key={p.slug}
              icon="shield"
              label={p.title}
              last={i === policies.length - 1}
              onPress={() =>
                router.push({
                  pathname: "/legal/[document]",
                  params: { document: p.slug },
                })
              }
            />
          ))}
        </SettingsGroup>
      )}
      {(!policy || policy.slug === "acknowledgments") && (
        <Link
          href="/legal/licenses"
          style={{ color: colors.blue, paddingVertical: 16, fontSize: 16 }}
        >
          Third-party license notices
        </Link>
      )}
    </DetailScreen>
  );
}
