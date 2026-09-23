import {
  createContext,
  useContext,
  useId,
  type PropsWithChildren,
} from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Text,
  View,
} from "react-native";
import { Pressable } from "./pressable";
import { colors } from "./profile-theme";

const KeyboardAccessoryContext = createContext<string | undefined>(undefined);
export const useKeyboardAccessory = () => useContext(KeyboardAccessoryContext);

/** Each screen/modal owns its toolbar so decimal keyboards always have a Done action. */
export function KeyboardInputScope({ children }: PropsWithChildren) {
  const id = `healthapp-keyboard-${useId()}`;
  return (
    <KeyboardAccessoryContext.Provider
      value={Platform.OS === "ios" ? id : undefined}
    >
      {children}
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={id} backgroundColor={colors.surface}>
          <View
            style={{
              alignItems: "flex-end",
              borderTopWidth: 0.5,
              borderTopColor: colors.separator,
              paddingHorizontal: 12,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done typing"
              onPress={Keyboard.dismiss}
              style={{
                minHeight: 44,
                minWidth: 64,
                padding: 12,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: colors.blue, fontSize: 17, fontWeight: "600" }}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </KeyboardAccessoryContext.Provider>
  );
}
