import { createContext, useContext, type ReactNode } from "react";
import { View } from "react-native";
import type { Widget } from "./layout";
const WidgetEditContext = createContext<(() => void) | undefined>(undefined);
export const useWidgetEdit = () => useContext(WidgetEditContext);
export function widgetWidth(widget: Widget, width: number, fullWidth: boolean) {
  return !fullWidth && widget.size === "small" ? (width - 12) / 2 : width;
}
// Renderers own one surface and heading in Summary and every preview.
export function WidgetFrame({
  children,
  onEdit,
  widget,
}: {
  widget: Widget;
  children: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <WidgetEditContext.Provider value={onEdit}>
      <View
        style={{
          flex: 1,
          minHeight: ["weight", "bp"].includes(widget.type)
            ? 150
            : ["calories", "protein", "fluids"].includes(widget.type)
              ? 178
              : widget.type.endsWith("_trend")
                ? 360
                : widget.type === "meals"
                  ? 220
                  : widget.type === "training"
                    ? widget.size === "wide"
                      ? 326
                      : 230
                    : widget.type === "streaks"
                      ? 64 +
                        (widget.config.habits ?? []).reduce(
                          (height, habit) =>
                            height + (habit === "training" ? 230 : 200),
                          0,
                        )
                      : undefined,
        }}
      >
        {children}
      </View>
    </WidgetEditContext.Provider>
  );
}
