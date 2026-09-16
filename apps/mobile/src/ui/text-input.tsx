import { forwardRef, useState } from "react";
import {
  TextInput as NativeTextInput,
  type TextInputProps,
} from "react-native";
import { colors, surfaces } from "./profile-theme";

/** Native editing, autofill, refs and Dynamic Type with shared focus feedback. */
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
  function TextInput({ style, onFocus, onBlur, editable, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <NativeTextInput
        placeholderTextColor={colors.tertiary}
        selectionColor={colors.blue}
        {...props}
        ref={ref}
        editable={editable}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          surfaces.input,
          style,
          focused && { borderColor: colors.blue },
          editable === false && { opacity: 0.55 },
        ]}
      />
    );
  },
);
export type TextInput = NativeTextInput;
