import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "./pressable";
import { colors } from "./theme";

/** Quiet, balanced actions for destructive confirmations; icons stay on entry points. */
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
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCancel}
        style={[styles.button, styles.cancel]}
      >
        <Text style={[styles.label, styles.cancelLabel]}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onConfirm}
        style={[styles.button, styles.confirm]}
      >
        <Text style={[styles.label, styles.confirmLabel]}>
          {busy ? "Deleting…" : confirmLabel}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    alignSelf: "stretch",
  },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  cancel: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
  },
  confirm: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  cancelLabel: { color: colors.secondary },
  confirmLabel: { color: colors.danger },
});
