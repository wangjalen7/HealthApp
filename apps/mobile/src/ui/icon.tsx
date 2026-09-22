import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ColorValue } from "react-native";
import { Platform } from "react-native";

export type IconName =
  | "check"
  | "calendar"
  | "heart"
  | "history"
  | "plus"
  | "minus"
  | "reorder"
  | "sparkles"
  | "person"
  | "food"
  | "water"
  | "weight"
  | "workout"
  | "bell"
  | "chevron"
  | "close"
  | "camera"
  | "image"
  | "scan"
  | "edit"
  | "delete"
  | "protein"
  | "arrow-up"
  | "eye"
  | "eye-off"
  | "arrow-down";

/** Consistent line icons on native and web, with no additional native dependency. */
export function Icon({
  name,
  size = 24,
  color = "#007AFF",
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(Platform.OS === "web"
        ? { "aria-hidden": true }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          })}
    >
      {name === "check" && <Path d="m5 12 4 4L19 6" />}
      {name === "calendar" && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} />
          <Path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2" />
        </>
      )}
      {name === "heart" && (
        <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      )}
      {name === "history" && (
        <>
          <Path d="M3 10a9 9 0 1 1 1.6 7M3 4v6h6M12 7v5l3 2" />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" />}
      {name === "minus" && <Path d="M5 12h14" />}
      {name === "reorder" && <Path d="M5 7h14M5 12h14M5 17h14" />}
      {name === "sparkles" && (
        <Path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3ZM20 2v4m-2-2h4" />
      )}
      {name === "person" && (
        <>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
      {name === "food" && (
        <Path d="M5 3v6m3-6v6M2 3v6a3 3 0 0 0 6 0M5 12v9M20 21V3c-4 1-6 5-6 10h6" />
      )}
      {name === "water" && (
        <Path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13ZM9 16a3 3 0 0 0 3 3" />
      )}
      {name === "weight" && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={5} />
          <Path d="M7 8a7 7 0 0 1 10 0l-5 5-5-5Zm5 5 2-6" />
        </>
      )}
      {name === "workout" && (
        <>
          <Path d="M8 12h8M3 9v6m18-6v6" />
          <Rect x={5} y={6} width={3} height={12} rx={1} />
          <Rect x={16} y={6} width={3} height={12} rx={1} />
        </>
      )}
      {name === "bell" && (
        <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      )}
      {name === "chevron" && <Path d="m9 5 7 7-7 7" />}
      {name === "close" && <Path d="m6 6 12 12M18 6 6 18" />}
      {(name === "eye" || name === "eye-off") && (
        <>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <Circle cx={12} cy={12} r={3} />
          {name === "eye-off" && <Path d="m3 3 18 18" />}
        </>
      )}
      {name === "camera" && (
        <>
          <Path d="M3 7h4l2-3h6l2 3h4v13H3Z" />
          <Circle cx={12} cy={13} r={4} />
        </>
      )}
      {name === "image" && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={3} />
          <Circle cx={8} cy={8} r={1} />
          <Path d="m3 17 5-5 4 4 4-6 5 7" />
        </>
      )}
      {name === "scan" && (
        <Path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M7 7v10m4-10v10m3-10v10m3-10v10" />
      )}
      {name === "edit" && <Path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />}
      {name === "delete" && (
        <Path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      )}
      {name === "arrow-up" && <Path d="M12 20V4m-6 6 6-6 6 6" />}
      {name === "arrow-down" && <Path d="M12 4v16m-6-6 6 6 6-6" />}
      {name === "protein" && (
        <Path d="M19 14c-2 5-9 7-13 4C1 14 4 5 10 3c5-2 12 6 9 11ZM9 8c-2 1-3 5-1 6s5-1 5-3-2-4-4-3Z" />
      )}
    </Svg>
  );
}
