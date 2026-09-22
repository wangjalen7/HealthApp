import { useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { colors } from "./theme";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
export function IntegerSlider({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const [width, setWidth] = useState(1);
  const current = useRef({ width, onChange });
  current.current = { width, onChange };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        current.current.onChange(
          Math.max(
            1,
            Math.min(
              7,
              1 +
                Math.round(
                  (e.nativeEvent.locationX / current.current.width) * 6,
                ),
            ),
          ),
        ),
      onPanResponderMove: (e) =>
        current.current.onChange(
          Math.max(
            1,
            Math.min(
              7,
              1 +
                Math.round(
                  (e.nativeEvent.locationX / current.current.width) * 6,
                ),
            ),
          ),
        ),
    }),
  ).current;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>
        {value} days per week
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fewer training days"
          disabled={value === 1}
          onPress={() => onChange(value - 1)}
          style={{ padding: 12 }}
        >
          <Icon name="minus" size={20} />
        </Pressable>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{
            min: 1,
            max: 7,
            now: value,
            text: `${value} days per week`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) =>
            onChange(
              Math.max(
                1,
                Math.min(
                  7,
                  value + (e.nativeEvent.actionName === "increment" ? 1 : -1),
                ),
              ),
            )
          }
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          {...responder.panHandlers}
          style={{ flex: 1, height: 44, justifyContent: "center" }}
        >
          <View
            pointerEvents="none"
            style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill }}
          >
            <View
              style={{
                width: `${((value - 1) / 6) * 100}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.green,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${((value - 1) / 6) * 100}%`,
              marginLeft: -12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: colors.green,
              borderWidth: 3,
              borderColor: colors.surface,
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More training days"
          disabled={value === 7}
          onPress={() => onChange(value + 1)}
          style={{ padding: 12 }}
        >
          <Icon name="plus" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
