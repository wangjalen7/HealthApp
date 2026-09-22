import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AppState,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pressable } from "../../ui/pressable";
import { useContentLocked } from "../../ui/privacy-boundary";
import { useReducedMotion } from "../../ui/motion";
import { colors } from "../../ui/theme";
import { moveWidget, packRows, registry, type Widget } from "./layout";
import { nearestSlot, type DragSlot } from "./drag";
import { WidgetFrame, widgetWidth } from "./widget-frame";

type Drag = {
  id: string;
  slots: DragSlot[];
  offset: number;
  x: number;
  y: number;
  origin: DragSlot;
  top: number;
  left: number;
  bottom: number;
};

export function EditorGrid({
  widgets,
  width,
  fullWidth,
  render,
  onMove,
  onSelect,
  disabled,
}: {
  widgets: Widget[];
  width: number;
  fullWidth: boolean;
  render: (w: Widget) => ReactNode;
  onMove: (from: number, to: number) => void;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const scroll = useRef<ScrollView>(null),
    viewport = useRef<View>(null);
  const refs = useRef(new Map<string, View>());
  const offset = useRef(0),
    contentHeight = useRef(0),
    viewportHeight = useRef(0);
  const drag = useRef<Drag | undefined>(undefined),
    pointer = useRef({ x: 0, y: 0 });
  const target = useRef(-1),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const generation = useRef(0),
    lastDrag = useRef(0);
  const [active, setActive] = useState<Drag>(),
    [destination, setDestination] = useState(-1);
  const translation = useRef(new Animated.ValueXY()).current;
  const locked = useContentLocked(),
    reduced = useReducedMotion();
  const latest = useRef({
    widgets,
    onMove,
    onSelect,
    disabled,
    locked,
    reduced,
  });
  latest.current = { widgets, onMove, onSelect, disabled, locked, reduced };
  const animate = () => {
    if (!latest.current.reduced && Platform.OS !== "web")
      LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 180 });
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = undefined;
  };
  const finish = (commit: boolean) => {
    generation.current += 1;
    stop();
    const current = drag.current;
    drag.current = undefined;
    if (current) {
      lastDrag.current = Date.now();
      const from = latest.current.widgets.findIndex((w) => w.id === current.id);
      if (commit && from >= 0 && target.current >= 0)
        latest.current.onMove(from, target.current);
    }
    animate();
    setActive(undefined);
    setDestination(-1);
    target.current = -1;
    translation.setValue({ x: 0, y: 0 });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (locked || disabled) finishRef.current(false);
  }, [locked, disabled]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") finishRef.current(false);
    });
    return () => {
      sub.remove();
      generation.current += 1;
      drag.current = undefined;
      stop();
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // Let ordinary touch swipes scroll, but prevent the browser from taking
    // over an already lifted card's vertical drag with a page-pan gesture.
    const preventDragScroll = (event: TouchEvent) => {
      if (drag.current && event.cancelable) event.preventDefault();
    };
    window.addEventListener("touchmove", preventDragScroll, {
      passive: false,
      capture: true,
    });
    return () =>
      window.removeEventListener("touchmove", preventDragScroll, true);
  }, []);
  // Window resizing invalidates the measured destinations.
  useEffect(() => {
    finishRef.current(false);
  }, [width, fullWidth]);
  const updateTarget = () => {
    const current = drag.current;
    if (!current) return;
    const next = nearestSlot(
      current.slots,
      pointer.current.x,
      pointer.current.y + offset.current - current.offset,
    );
    if (next !== target.current) {
      animate();
      target.current = next;
      setDestination(next);
    }
  };
  const measure = (view: View) =>
    new Promise<DragSlot>((resolve) =>
      view.measureInWindow((x, y, width, height) =>
        resolve({ id: "", x, y, width, height }),
      ),
    );
  const start = async (id: string, x: number, y: number) => {
    if (
      drag.current ||
      latest.current.disabled ||
      latest.current.locked ||
      !viewport.current
    )
      return;
    const token = ++generation.current;
    pointer.current = { x, y };
    const initialOffset = offset.current;
    const [bounds, ...slots] = await Promise.all([
      measure(viewport.current),
      ...latest.current.widgets.map(async (w) => ({
        ...(await measure(refs.current.get(w.id)!)),
        id: w.id,
      })),
    ]);
    if (
      token !== generation.current ||
      latest.current.disabled ||
      latest.current.locked
    )
      return;
    const origin = slots.find((slot) => slot.id === id);
    if (!origin) return;
    const current = {
      id,
      slots,
      offset: initialOffset,
      x,
      y,
      origin,
      top: bounds.y,
      left: bounds.x,
      bottom: bounds.y + bounds.height,
    };
    drag.current = current;
    target.current = slots.findIndex((slot) => slot.id === id);
    setDestination(target.current);
    setActive(current);
    translation.setValue({
      x: pointer.current.x - x,
      y: pointer.current.y - y,
    });
    timer.current = setInterval(() => {
      const p = pointer.current;
      const delta =
        p.y < current.top + 65 ? -8 : p.y > current.bottom - 65 ? 8 : 0;
      if (delta) {
        const next = Math.max(
          0,
          Math.min(
            contentHeight.current - viewportHeight.current,
            offset.current + delta,
          ),
        );
        if (next !== offset.current) {
          offset.current = next;
          scroll.current?.scrollTo({ y: next, animated: false });
          updateTarget();
        }
      }
    }, 16);
  };
  const move = (id: string, x: number, y: number) => {
    pointer.current = { x, y };
    const current = drag.current;
    if (current?.id !== id) return;
    translation.setValue({ x: x - current.x, y: y - current.y });
    updateTarget();
  };
  const from = active ? widgets.findIndex((w) => w.id === active.id) : -1;
  const preview = active ? moveWidget(widgets, from, destination) : widgets;
  const floating = active ? widgets.find((w) => w.id === active.id) : undefined;
  // Keep DOM/native view order fixed until release. Reordering a captured node
  // during the gesture makes browsers cancel its pointer capture.
  const positions = new Map<
    string,
    { left: number; top: number; height: number }
  >();
  let previewHeight = 0;
  if (active) {
    for (const row of packRows(preview, fullWidth)) {
      const height = Math.max(
        ...row.map(
          (w) => active.slots.find((slot) => slot.id === w.id)!.height,
        ),
      );
      let left = 0;
      for (const w of row) {
        positions.set(w.id, { left, top: previewHeight, height });
        left += widgetWidth(w, width, fullWidth) + 12;
      }
      previewHeight += height + 12;
    }
  }
  return (
    <View
      ref={viewport}
      style={{ flex: 1 }}
      onLayout={(e) => {
        viewportHeight.current = e.nativeEvent.layout.height;
      }}
    >
      <ScrollView
        ref={scroll}
        testID="summary-editor-scroll"
        scrollEnabled={!active}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_w, h) => {
          contentHeight.current = h;
        }}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.grid,
            active && { height: Math.max(0, previewHeight - 12) },
          ]}
        >
          {widgets.map((w) => (
            <View
              key={w.id}
              testID={`editor-widget-${w.id}`}
              collapsable={false}
              ref={(view) => {
                if (view) refs.current.set(w.id, view);
                else refs.current.delete(w.id);
              }}
              style={[
                {
                  width: widgetWidth(w, width, fullWidth),
                  position: "relative",
                },
                active && { position: "absolute", ...positions.get(w.id) },
              ]}
            >
              {active?.id === w.id ? (
                <View pointerEvents="none" style={styles.placeholder} />
              ) : null}
              <DraggableWidget
                id={w.id}
                title={registry[w.type].title}
                hidden={active?.id === w.id}
                onStart={(x, y) => {
                  void start(w.id, x, y);
                }}
                onMove={(x, y) => move(w.id, x, y)}
                onEnd={(commit) => finishRef.current(commit)}
                onSelect={() => {
                  if (
                    !latest.current.disabled &&
                    !latest.current.locked &&
                    !drag.current &&
                    Date.now() - lastDrag.current > 350
                  )
                    latest.current.onSelect(w.id);
                }}
                onAccessibleMove={(delta) => {
                  const index = widgets.findIndex((item) => item.id === w.id);
                  onMove(index, index + delta);
                }}
              >
                <WidgetFrame widget={w}>{render(w)}</WidgetFrame>
              </DraggableWidget>
            </View>
          ))}
        </View>
        {!widgets.length ? (
          <Text style={styles.hint}>Add a widget to start your Summary.</Text>
        ) : null}
      </ScrollView>
      {active && floating ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.floating,
            {
              top: active.origin.y - active.top,
              left: active.origin.x - active.left,
              width: active.origin.width,
              height: active.origin.height,
              transform: [...translation.getTranslateTransform(), { scale: reduced ? 1 : 1.015 }],
            },
          ]}
        >
          <WidgetFrame widget={floating}>{render(floating)}</WidgetFrame>
        </Animated.View>
      ) : null}
      {active ? (
        <Text
          pointerEvents="none"
          testID="summary-drag-status"
          accessibilityLiveRegion="polite"
          style={styles.status}
        >
          Moving {registry[floating!.type].title} to position {destination + 1}
        </Text>
      ) : null}
    </View>
  );
}

function DraggableWidget({
  id,
  title,
  children,
  hidden,
  onStart,
  onMove,
  onEnd,
  onSelect,
  onAccessibleMove,
}: {
  id: string;
  title: string;
  children: ReactNode;
  hidden: boolean;
  onStart: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: (commit: boolean) => void;
  onSelect: () => void;
  onAccessibleMove: (delta: number) => void;
}) {
  const latest = useRef({ onStart, onMove, onEnd, onSelect });
  latest.current = { onStart, onMove, onEnd, onSelect };
  const gesture = useMemo(() => {
    let dragging = false;
    return Gesture.Pan()
      .activateAfterLongPress(280)
      .runOnJS(true)
      .onStart((e) => {
        dragging = true;
        latest.current.onStart(e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => latest.current.onMove(e.absoluteX, e.absoluteY))
      .onEnd((_e, success) => {
        dragging = false;
        latest.current.onEnd(success);
      })
      .onFinalize(() => {
        if (dragging) {
          dragging = false;
          latest.current.onEnd(false);
        }
      });
  }, []);
  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View style={{ flex: 1, opacity: hidden ? 0 : 1 }}>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1 }}
        >
          {children}
        </View>
        <Pressable
          testID={`edit-hit-${id}`}
          accessibilityRole="button"
          accessibilityLabel={`Customize ${title}`}
          accessibilityHint="Tap for size and options. Hold anywhere and drag to move."
          accessibilityActions={[
            { name: "increment", label: "Move later" },
            { name: "decrement", label: "Move earlier" },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "increment") onAccessibleMove(1);
            if (e.nativeEvent.actionName === "decrement") onAccessibleMove(-1);
          }}
          onPress={() => latest.current.onSelect()}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    alignSelf: "center",
    width: "100%",
    maxWidth: 760,
    flexGrow: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  placeholder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  floating: {
    position: "absolute",
    zIndex: 30,
    backgroundColor: colors.background,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  hint: { color: colors.secondary, paddingVertical: 20 },
  status: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    backgroundColor: colors.surface,
    color: colors.blue,
    borderRadius: 12,
    padding: 8,
    fontSize: 12,
    zIndex: 40,
  },
});
