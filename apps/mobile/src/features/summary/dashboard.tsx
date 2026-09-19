import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { ConfirmationActions } from "../../ui/confirmation-actions";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { EditorGrid } from "./editor-grid";
import { WidgetFrame, widgetWidth } from "./widget-frame";
import { colors, surfaces } from "../../ui/theme";
import { createUuid } from "../../lib/id";
import {
  defaultLayout,
  layoutSchema,
  moveWidget,
  registry,
  actionNames,
  habits,
  habitLabels,
  type Widget,
  type Layout,
  type WidgetType,
} from "./layout";
import { loadLayout, saveLayout } from "./storage";

export function Action({
  label,
  onPress,
  disabled = false,
  displayLabel,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  displayLabel?: string;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={{ color: colors.blue, fontWeight: "600", flexShrink: 1 }}>
        {displayLabel ?? label}
      </Text>
    </Pressable>
  );
}
export function Dashboard({
  user,
  render,
  onLayoutChange,
  onEditingChange,
}: {
  user: string;
  render: (widget: Widget) => ReactNode;
  onLayoutChange: (widgets: Widget[]) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [saved, setSaved] = useState<Layout>();
  const [draft, setDraft] = useState<Layout>();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string>();
  const [gallery, setGallery] = useState(false),
    [confirm, setConfirm] = useState<"discard" | "restore">(),
    [busy, setBusy] = useState(false);
  const { width, fontScale } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const fullWidth = width < 370 || fontScale > 1.25;
  const contentWidth = Math.min(width, 760) - 40;
  const changeRef = useRef(onLayoutChange);
  changeRef.current = onLayoutChange;
  const editRef = useRef(onEditingChange);
  editRef.current = onEditingChange;
  useEffect(() => {
    let live = true;
    void loadLayout(user)
      .then((result) => {
        if (live) {
          setSaved(result.layout);
          if (result.recovered)
            setMessage(
              "Layout could not be read. Defaults are shown; save to replace it.",
            );
        }
      })
      .catch(() => {
        if (live)
          setMessage(
            "Could not read this device's layout. Retry by reopening Summary.",
          );
      });
    return () => {
      live = false;
      editRef.current(false);
    };
  }, [user]);
  useEffect(() => {
    const layout = draft ?? saved;
    if (layout) changeRef.current(layout.widgets);
  }, [draft, saved]);
  const begin = () => {
    if (saved) {
      setDraft(JSON.parse(JSON.stringify(saved)));
      onEditingChange(true);
    }
  };
  const close = () => {
    setDraft(undefined);
    setGallery(false);
    setSelected(undefined);
    onEditingChange(false);
  };
  const cancel = () => {
    if (JSON.stringify(draft) !== JSON.stringify(saved)) setConfirm("discard");
    else close();
  };
  const navigation = useNavigation();
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    if (!draft) return;
    const remove = navigation.addListener("beforeRemove", (event) => {
      event.preventDefault();
      cancelRef.current();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(draft) !== JSON.stringify(saved)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // React Native also defines window, but it has no browser unload events.
    const browser = Platform.OS === "web" && typeof window !== "undefined";
    if (browser) window.addEventListener("beforeunload", beforeUnload);
    return () => {
      remove();
      if (browser) window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [draft, saved, navigation]);
  const update = (widgets: Widget[]) => setDraft({ version: 1, widgets });
  const patch = (id: string, changes: Partial<Widget>) => {
    if (draft)
      update(
        draft.widgets.map((w) => (w.id === id ? { ...w, ...changes } : w)),
      );
  };
  const add = (type: WidgetType) => {
    if (!draft) return;
    const widget: Widget = {
      id: createUuid(),
      type,
      size: "wide",
      config: JSON.parse(JSON.stringify(registry[type].defaults)),
    };
    if (type === "streaks") {
      const available = habits.find(
        (h) =>
          !draft.widgets.some(
            (w) =>
              w.type === "streaks" &&
              w.config.habits?.length === 1 &&
              w.config.habits[0] === h,
          ),
      );
      if (!available) {
        setMessage("All individual streak cards have been added.");
        return;
      }
      widget.config = { habits: [available] };
    }
    update([...draft.widgets, widget]);
    setGallery(false);
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: "flex-end" }}>
        <Action label="Edit Summary" onPress={begin} disabled={!saved} />
      </View>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      {!saved ? (
        <ActivityIndicator color={colors.blue} />
      ) : saved.widgets.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Make Summary your own</Text>
          <Action
            label="Add widgets"
            onPress={() => {
              begin();
              setGallery(true);
            }}
          />
        </View>
      ) : (
        <View style={styles.grid}>
          {saved.widgets.map((w) => (
            <View
              key={w.id}
              testID={`summary-widget-${w.id}`}
              style={{ width: widgetWidth(w, contentWidth, fullWidth) }}
            >
              <WidgetFrame widget={w} onEdit={begin}>
                {render(w)}
              </WidgetFrame>
            </View>
          ))}
        </View>
      )}
      <Modal visible={!!draft} animationType="slide" onRequestClose={cancel}>
        <GestureHandlerRootView
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View style={styles.toolbar}>
            <Action label="Cancel" onPress={cancel} disabled={busy} />
            <Text accessibilityRole="header" style={styles.title}>
              Edit Summary
            </Text>
            <Action
              label={busy ? "Saving…" : "Done"}
              disabled={busy}
              onPress={() => {
                if (!draft) return;
                const parsed = layoutSchema.safeParse(draft);
                if (!parsed.success) {
                  setMessage(
                    "Choose unique streak selections and valid widget settings before saving.",
                  );
                  return;
                }
                setBusy(true);
                void saveLayout(user, draft)
                  .then(() => {
                    setSaved(draft);
                    setMessage("");
                    close();
                  })
                  .catch(() =>
                    setMessage(
                      "Could not save the layout. Your changes are still here.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            />
          </View>
          <Text style={[styles.copy, { paddingHorizontal: 16 }]}>
            Hold any widget to drag. Tap a widget for size and options.
          </Text>
          {message ? (
            <Text
              accessibilityRole="alert"
              style={[styles.copy, { padding: 16 }]}
            >
              {message}
            </Text>
          ) : null}
          {draft ? (
            <EditorGrid
              widgets={draft.widgets}
              fullWidth={fullWidth}
              width={contentWidth}
              disabled={busy || gallery || !!confirm || !!selected}
              onMove={(from, to) => update(moveWidget(draft.widgets, from, to))}
              onSelect={setSelected}
              render={render}
            />
          ) : null}
          <View style={styles.toolbar}>
            <Action label="Add widget" onPress={() => setGallery(true)} />
            <Action
              label="Restore default layout"
              onPress={() => setConfirm("restore")}
            />
          </View>
        </GestureHandlerRootView>
        <Modal
          visible={!!selected}
          transparent
          animationType="fade"
          onRequestClose={() => setSelected(undefined)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close widget options"
              onPress={() => setSelected(undefined)}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
                {draft?.widgets
                  .filter((w) => w.id === selected)
                  .map((w) => (
                    <View key={w.id} style={{ gap: 12 }}>
                      <View style={styles.toolbar}>
                        <Text accessibilityRole="header" style={styles.title}>
                          {registry[w.type].title}
                        </Text>
                        <Action
                          label="Back to layout"
                          onPress={() => setSelected(undefined)}
                        />
                      </View>
                      <View style={styles.controls}>
                        {registry[w.type].sizes.map((size) => (
                          <Pressable
                            key={size}
                            accessibilityRole="radio"
                            accessibilityLabel={`${registry[w.type].title} ${size === "small" ? "Small" : "Large"}`}
                            accessibilityState={{ checked: w.size === size }}
                            style={[
                              styles.button,
                              w.size === size && {
                                backgroundColor: colors.blueSoft,
                              },
                            ]}
                            onPress={() =>
                              patch(w.id, {
                                size,
                                config:
                                  w.type === "streaks" && size === "small"
                                    ? { habits: [w.config.habits![0]] }
                                    : w.type === "actions"
                                      ? {
                                          actions:
                                            size === "small"
                                              ? w.config.actions!.slice(0, 2)
                                              : [
                                                  ...new Set([
                                                    ...w.config.actions!,
                                                    ...actionNames,
                                                  ]),
                                                ].slice(0, 4),
                                        }
                                      : w.config,
                              })
                            }
                          >
                            <Text style={{ color: colors.blue }}>
                              {size === "small" ? "Small" : "Large"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {w.type === "training" ? (
                        <View style={styles.controls}>
                          {(["week", "last7"] as const).map((period) => (
                            <Action
                              key={period}
                              selected={w.config.period === period}
                              label={`${w.config.period === period ? "Selected: " : ""}${period === "week" ? "This week" : "Last 7 days"}`}
                              onPress={() =>
                                patch(w.id, { config: { period } })
                              }
                            />
                          ))}
                        </View>
                      ) : null}
                      {w.type === "actions" ? (
                        <>
                          <Text style={styles.copy}>
                            Selected order: {w.config.actions!.join(" → ")}.
                            Toggle actions off and on to reorder.
                          </Text>
                          <View style={styles.controls}>
                            {actionNames.map((action) => (
                              <Action
                                key={action}
                                selected={w.config.actions!.includes(action)}
                                label={`${w.config.actions!.includes(action) ? "✓ " : ""}${action}`}
                                onPress={() => {
                                  const list = w.config.actions!;
                                  patch(w.id, {
                                    config: {
                                      actions: list.includes(action)
                                        ? list.filter((a) => a !== action)
                                        : [...list, action].slice(
                                            0,
                                            w.size === "small" ? 2 : 6,
                                          ),
                                    },
                                  });
                                }}
                              />
                            ))}
                          </View>
                          <Text style={styles.copy}>
                            {w.size === "small"
                              ? "Choose two actions."
                              : "Choose four to six actions."}
                          </Text>
                        </>
                      ) : null}
                      {w.type === "streaks" ? (
                        <View style={styles.controls}>
                          {habits.map((h) => (
                            <Action
                              key={h}
                              selected={w.config.habits!.includes(h)}
                              label={`${w.config.habits!.includes(h) ? "✓ " : ""}${habitLabels[h]}`}
                              onPress={() => {
                                const list = w.config.habits!;
                                patch(w.id, {
                                  config: {
                                    habits:
                                      w.size === "small"
                                        ? [h]
                                        : list.includes(h)
                                          ? list.filter((a) => a !== h)
                                          : [...list, h].slice(0, 4),
                                  },
                                });
                              }}
                            />
                          ))}
                        </View>
                      ) : null}
                      <Action
                        label={`Remove ${registry[w.type].title}`}
                        displayLabel="Remove"
                        onPress={() => {
                          update(
                            draft.widgets.filter((item) => item.id !== w.id),
                          );
                          setSelected(undefined);
                        }}
                      />
                    </View>
                  ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <Modal
          visible={gallery}
          animationType="slide"
          onRequestClose={() => setGallery(false)}
        >
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingTop: insets.top + 20,
              gap: 16,
              backgroundColor: colors.background,
            }}
          >
            <Text accessibilityRole="header" style={styles.title}>
              Add widget
            </Text>
            <Action label="Close gallery" onPress={() => setGallery(false)} />
            {(Object.keys(registry) as WidgetType[]).map((type) => {
              const def = registry[type],
                added =
                  type !== "streaks" &&
                  draft?.widgets.some((w) => w.type === type);
              return (
                <View key={type} style={styles.card}>
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <WidgetFrame
                      widget={{
                        id: `preview-${type}`,
                        type,
                        size: "wide",
                        config: def.defaults,
                      }}
                    >
                      {render({
                        id: `preview-${type}`,
                        type,
                        size: "wide",
                        config: def.defaults,
                      })}
                    </WidgetFrame>
                  </View>
                  <Text style={styles.copy}>
                    {def.sizes
                      .map((size) => (size === "small" ? "Small" : "Large"))
                      .join(" / ")}
                  </Text>
                  <Text style={styles.copy}>{def.description}</Text>
                  <Action
                    label={added ? `${def.title} — Added` : `Add ${def.title}`}
                    disabled={added}
                    onPress={() => add(type)}
                  />
                </View>
              );
            })}
          </ScrollView>
        </Modal>
        <Modal
          visible={!!confirm}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirm(undefined)}
        >
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.title}>
                {confirm === "restore"
                  ? "Restore default layout?"
                  : "Discard layout changes?"}
              </Text>
              <Text style={styles.copy}>
                {confirm === "restore"
                  ? "Only card presentation changes. Health entries, goals and streak settings are kept."
                  : "Your saved layout will be kept."}
              </Text>
              <ConfirmationActions
                onCancel={() => setConfirm(undefined)}
                confirmLabel={confirm === "restore" ? "Restore" : "Discard"}
                onConfirm={() => {
                  if (confirm === "restore") setDraft(defaultLayout());
                  else close();
                  setConfirm(undefined);
                }}
              />
            </View>
          </View>
        </Modal>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  sheet: {
    maxHeight: "65%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  card: { ...surfaces.card, padding: 16, gap: 10 },
  button: {
    maxWidth: "100%",
    flexShrink: 1,
    minHeight: 44,
    padding: 10,
    justifyContent: "center",
    borderRadius: 10,
  },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 16, fontWeight: "600" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    flexWrap: "wrap",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
});
