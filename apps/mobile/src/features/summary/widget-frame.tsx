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
}: {
  widget: Widget;
  children: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <WidgetEditContext.Provider value={onEdit}>
      <View style={{ flex: 1 }}>{children}</View>
    </WidgetEditContext.Provider>
  );
}
