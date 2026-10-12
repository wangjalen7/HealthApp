import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";

/** Opening details never sends data. The explicit AI action authorizes a request. */
export function AiPrivacyDetails({ details }: { details: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.detailsButton}
      >
        <Text style={styles.link}>AI privacy details</Text>
      </Pressable>
      {expanded ? <Text style={styles.copy}>{details}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  detailsButton: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  link: { color: colors.blue, fontSize: 14 },
});
