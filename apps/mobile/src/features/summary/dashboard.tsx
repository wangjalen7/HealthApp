import { SettingsSheet, ChoiceRow } from "../../ui/settings-sheet";
import { Icon } from "../../ui/icon";
import { SegmentedControl } from "../../ui/segmented-control";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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
import { cachedLayout, loadLayout, saveLayout } from "./storage";
import { WidgetSkeleton } from "./widget-skeleton";

export function Action({
  label,
  onPress,
  disabled = false,
  displayLabel,
  selected,
  primary = false,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  displayLabel?: string;
  selected?: boolean;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary && {
          backgroundColor: colors.blue,
          paddingHorizontal: 20,
          alignItems: "center",
        },
        destructive && {
          backgroundColor: colors.dangerSoft,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
        },
        disabled && { opacity: 0.4 },
      ]}
    >
      {destructive ? (
        <Icon name="delete" size={18} color={colors.danger} />
      ) : null}
      <Text
        style={{
          color: primary
            ? colors.onAccent
            : destructive
              ? colors.danger
              : colors.blue,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
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
  header,
  onCommit,
}: {
  user: string;
  header?: (begin: () => void, ready: boolean) => ReactNode;
  onCommit?: (layout: Layout) => Promise<void>;
  reminders?: { id: string; label: string }[];
  render: (widget: Widget) => ReactNode;
  onLayoutChange: (widgets: Widget[]) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [saved, setSaved] = useState<Layout | undefined>(() =>
    cachedLayout(user),
  );
  const [draft, setDraft] = useState<Layout>();
  const [message, setMessage] = useState("");
  const [layoutAttempt, setLayoutAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [direct, setDirect] = useState(false);
  const [preview, setPreview] = useState(false);
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
    setMessage("");
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
            "Could not read this device's layout. Your saved arrangement has not been changed.",
          );
      });
    return () => {
      live = false;
      editRef.current(false);
    };
  }, [user, layoutAttempt]);
  useEffect(() => {
    const layout = draft ?? saved;
    if (layout)
      changeRef.current(
        gallery
          ? [
              ...layout.widgets,
              ...(Object.keys(registry) as WidgetType[])
                .filter((type) => !layout.widgets.some((w) => w.type === type))
                .map((type) => ({
                  id: `gallery-${type}`,
                  type,
                  size: "wide" as const,
                  config: registry[type].defaults,
                })),
            ]
          : layout.widgets,
      );
  }, [draft, saved, gallery]);
  const begin = () => {
    if (saved) {
      setMessage("");
      setDirect(false);
      setDraft(JSON.parse(JSON.stringify(saved)));
      onEditingChange(true);
    }
  };
  const close = () => {
    setPreview(false);
    setDirect(false);
    setConfirm(undefined);
    setDraft(undefined);
    setGallery(false);
    setSelected(undefined);
    onEditingChange(false);
  };
  const cancel = () => {
    if (busy) return;
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
  function saveDraft() {
    if (busy) return;
    if (!draft) return;
    const parsed = layoutSchema.safeParse(draft);
    if (!parsed.success) {
      setMessage(
        "Choose unique streak selections and valid widget settings before saving.",
      );
      return;
    }
    setBusy(true);
    void (async () => {
      await onCommit?.(draft);
      await saveLayout(user, draft);
    })()
      .then(() => {
        setSaved(draft);
        setMessage("");
        close();
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not save the layout. Your changes are still here.",
        ),
      )
      .finally(() => setBusy(false));
  }
  function editWidget(id: string) {
    if (!saved || draft) return;
    setMessage("");
    setDraft(JSON.parse(JSON.stringify(saved)));
    setSelected(id);
    setDirect(true);
    onEditingChange(true);
  }
  const renderWidgetOptions = () => (
    <SettingsSheet
      visible={!!selected}
      title={preview ? "Widget preview" : "Widget options"}
      icon="edit"
      footer={
        direct && !confirm ? (
          <View style={styles.toolbar}>
            <Action label="Cancel" onPress={cancel} disabled={busy} />
            <Action
              label={busy ? "Saving..." : "Save changes"}
              onPress={saveDraft}
              primary
              disabled={busy}
            />
          </View>
        ) : null
      }
      onClose={() => {
        if (!busy) {
          if (preview) setPreview(false);
          else if (direct) cancel();
          else setSelected(undefined);
        }
      }}
    >
      {direct && confirm === "discard" ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.heading}>Discard widget changes?</Text>
          <Text style={styles.copy}>Your saved widget will be kept.</Text>
          <ConfirmationActions
            onCancel={() => setConfirm(undefined)}
            onConfirm={close}
            confirmLabel="Discard"
          />
        </View>
      ) : (
        <>
          {direct && message ? (
            <Text accessibilityRole="alert" style={styles.copy}>
              {message}
            </Text>
          ) : null}
          {direct && !draft?.widgets.some((w) => w.id === selected) ? (
            <Text style={styles.copy}>
              This widget will be removed when you save changes.
            </Text>
          ) : null}
          <View pointerEvents={busy ? "none" : "auto"}>
            {draft?.widgets
              .filter((w) => w.id === selected)
              .map((w) => (
                <View key={w.id} style={{ gap: 12 }}>
                  {preview ? (
                    <>
                      <Action
                        label="Back to options"
                        onPress={() => setPreview(false)}
                      />
                      <View
                        testID="widget-options-preview"
                        pointerEvents="none"
                        style={{
                          width: widgetWidth(w, contentWidth, fullWidth),
                          alignSelf: "center",
                        }}
                      >
                        {render(w)}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.toolbar}>
                        <Text accessibilityRole="header" style={styles.title}>
                          {registry[w.type].title}
                        </Text>
                        {!direct ? (
                          <Action
                            label="Back to layout"
                            onPress={() => setSelected(undefined)}
                          />
                        ) : null}
                      </View>
                      <Action
                        label="Preview widget"
                        onPress={() => setPreview(true)}
                      />
                      <Text style={styles.heading}>Size</Text>
                      {!direct ? <View style={styles.controls}>
                        <Action label="Move earlier" disabled={draft.widgets[0]?.id === w.id} onPress={() => { const i=draft.widgets.findIndex(item=>item.id===w.id); update(moveWidget(draft.widgets,i,i-1)); }} />
                        <Action label="Move later" disabled={draft.widgets[draft.widgets.length-1]?.id === w.id} onPress={() => { const i=draft.widgets.findIndex(item=>item.id===w.id); update(moveWidget(draft.widgets,i,i+1)); }} />
                      </View> : null}
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
                                    ? {
                                        ...w.config,
                                        habits: [w.config.habits![0]],
                                      }
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
                            <View
                              style={{
                                height: 30,
                                width: size === "small" ? 30 : 62,
                                borderRadius: 7,
                                borderWidth: 2,
                                borderColor:
                                  w.size === size
                                    ? colors.blue
                                    : colors.separator,
                                marginBottom: 6,
                              }}
                            />
                            <Text style={{ color: colors.blue }}>
                              {size === "small" ? "Small" : "Large"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {w.type === "training" ? (
                        <SegmentedControl
                          label="Training period"
                          value={w.config.period ?? "week"}
                          options={[
                            { value: "week", label: "This week" },
                            { value: "last7", label: "Last 7 days" },
                          ]}
                          onChange={(period) =>
                            patch(w.id, { config: { period } })
                          }
                        />
                      ) : null}
                      {w.type === "actions" ? (
                        <>
                          <Text style={styles.copy}>
                            Choose shortcuts in the order you want them. Toggle
                            actions off and on to reorder.
                          </Text>
                          <View style={{ gap: 4 }}>
                            {actionNames.map((action) => (
                              <ChoiceRow
                                key={action}
                                disabled={
                                  !w.config.actions!.includes(action) &&
                                  w.config.actions!.length >=
                                    (w.size === "small" ? 2 : 6)
                                }
                                selected={w.config.actions!.includes(action)}
                                label={action}
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
                          <Text
                            accessibilityRole={
                              w.config.actions!.length <
                              (w.size === "small" ? 2 : 4)
                                ? "alert"
                                : undefined
                            }
                            style={[
                              styles.copy,
                              w.config.actions!.length <
                                (w.size === "small" ? 2 : 4) && {
                                color: colors.danger,
                              },
                            ]}
                          >
                            {w.size === "small"
                              ? "Choose two actions."
                              : "Choose four to six actions."}
                          </Text>
                        </>
                      ) : null}
                      {w.type === "streaks" ? (
                        <View style={{ gap: 4 }}>
                          <Text
                            accessibilityRole={
                              !w.config.habits?.length ? "alert" : undefined
                            }
                            style={[
                              styles.copy,
                              !w.config.habits?.length && {
                                color: colors.danger,
                              },
                            ]}
                          >
                            {!w.config.habits?.length
                              ? "Select at least one streak."
                              : w.size === "small"
                                ? "Choose one streak."
                                : "Choose one to four streaks."}
                          </Text>
                          {habits.map((h) => (
                            <ChoiceRow
                              key={h}
                              disabled={
                                w.size === "wide" &&
                                !w.config.habits!.includes(h) &&
                                w.config.habits!.length >= 4
                              }
                              selected={w.config.habits!.includes(h)}
                              label={habitLabels[h]}
                              onPress={() => {
                                const list = w.config.habits!;
                                patch(w.id, {
                                  config: {
                                    ...w.config,
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
                        destructive
                        label={`Remove ${registry[w.type].title}`}
                        displayLabel="Remove Widget"
                        onPress={() => {
                          update(
                            draft.widgets.filter((item) => item.id !== w.id),
                          );
                          if (!direct) setSelected(undefined);
                        }}
                      />
                    </>
                  )}
                </View>
              ))}
          </View>
        </>
      )}
    </SettingsSheet>
  );
  return (
    <View style={{ gap: 12 }}>
      {header ? (
        header(begin, !!saved)
      ) : (
        <Action label="Edit Summary" onPress={begin} disabled={!saved} />
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      {!saved && message ? (
        <Action
          label="Retry saved layout"
          onPress={() => setLayoutAttempt((attempt) => attempt + 1)}
        />
      ) : null}
      {!saved ? (
        <View style={styles.grid}>
          {defaultLayout().widgets.map((widget) => (
            <View
              key={widget.id}
              style={{ width: widgetWidth(widget, contentWidth, fullWidth) }}
            >
              <WidgetFrame widget={widget}>
                <WidgetSkeleton widget={widget} />
              </WidgetFrame>
            </View>
          ))}
        </View>
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
              <WidgetFrame
                widget={w}
                onEdit={
                  w.type === "streaks" || w.type === "actions"
                    ? () => editWidget(w.id)
                    : undefined
                }
              >
                {render(w)}
              </WidgetFrame>
            </View>
          ))}
        </View>
      )}
      <Modal
        visible={!!draft && !direct}
        animationType="slide"
        onRequestClose={cancel}
      >
        <GestureHandlerRootView
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View style={[styles.toolbar, { flexWrap: "nowrap", minHeight: 60 }]}>
            <View style={{ width: 80 }}>
              <Action label="Cancel" onPress={cancel} disabled={busy} />
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { flex: 1, textAlign: "center", fontSize: 18 },
              ]}
            >
              Edit Summary
            </Text>
            <Action
              primary
              label={busy ? "Saving…" : "Done"}
              disabled={busy}
              onPress={saveDraft}
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
          <View style={{ gap: 4, paddingHorizontal: 20, paddingVertical: 8 }}>
            <Action
              primary
              label="Add widget"
              onPress={() => setGallery(true)}
            />
            <Action
              label="Restore default layout"
              onPress={() => setConfirm("restore")}
            />
          </View>
        </GestureHandlerRootView>
        {!direct ? renderWidgetOptions() : null}
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
                <View key={type} style={{ gap: 10 }}>
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
          visible={!!confirm && !direct}
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
      {direct ? renderWidgetOptions() : null}
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
