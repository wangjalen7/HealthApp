import { useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { exerciseGuide } from "./exercise-guides";
export function ExerciseHelp({
  name,
  isNew = false,
}: {
  name: string;
  isNew?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const guide = exerciseGuide(name);
  if (!name.trim()) return null;
  return (
    <View style={{ gap: 8 }}>
      {isNew ? (
        <Text style={{ color: colors.secondary, fontSize: 13 }}>
          Not found in your available exercise history
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"Exercise guide for " + name}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.blue, fontWeight: "600" }}>
          {expanded ? "Hide exercise guide" : "How to do this exercise"}
        </Text>
      </Pressable>
      {expanded ? (
        <View
          style={{
            gap: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.text, lineHeight: 21 }}>
            {guide?.cue ??
              "A detailed description is not available for this exercise yet."}
          </Text>
          {guide ? (
            <Text style={{ color: colors.secondary, lineHeight: 20 }}>
              {guide.easier}
            </Text>
          ) : null}
          <Text style={{ color: colors.secondary, lineHeight: 20 }}>
            Start with a comfortable load and controlled movement. Stop if you
            feel pain or cannot maintain form.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
