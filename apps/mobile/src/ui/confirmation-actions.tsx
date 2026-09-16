import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "./pressable";
import { colors } from "./theme";

/** Equal-size text actions for destructive confirmations; icons belong on entry points. */
export function ConfirmationActions({
  onCancel,
  onConfirm,
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  confirmAccessibilityLabel,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmAccessibilityLabel?: string;
}) {
  return (
    <View testID="confirmation-actions" style={styles.actions}>
      <Pressable
        disabled={busy}
        onPress={onCancel}
        style={[styles.button, styles.cancel]}
      >
        <Text style={[styles.label, styles.cancelLabel]}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onConfirm}
        style={[styles.button, styles.confirm]}
      >
        <Text style={[styles.label, styles.confirmLabel]}>
          {busy ? "Deleting..." : confirmLabel}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    alignSelf: "stretch",
  },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancel: { backgroundColor: colors.fill, borderColor: colors.fill },
  confirm: { backgroundColor: "#B42318", borderColor: "#B42318" },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  cancelLabel: { color: colors.text },
  confirmLabel: { color: "#FFFFFF" },
});
