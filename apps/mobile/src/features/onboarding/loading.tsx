import { ActivityIndicator, Text, View } from "react-native";
import { useAccountSetup } from "./provider";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
export function SetupLoading() {
  const { loading, error, reload } = useAccountSetup();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 28,
        gap: 20,
        backgroundColor: colors.background,
      }}
    >
      {loading ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <>
          <Text
            accessibilityRole="alert"
            style={{ color: colors.text, fontSize: 17 }}
          >
            {error || "Account setup is unavailable. Try again."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void reload()}
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <Text style={{ color: colors.blue }}>Retry account setup</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
