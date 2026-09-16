import { ConfirmationActions } from "../../ui/confirmation-actions";
import { IconButton } from "../../ui/icon-button";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { prepareProgressPhoto, selectProgressPhoto } from "./image";
import { progressPhotoEntryLimit } from "./model";
import {
  deleteProgressPhoto,
  getProgressPhotos,
  getEntryProgressPhotoCount,
  type ProgressPhoto,
  uploadProgressPhoto,
} from "./repository";

const photoPageSize = 250;

export function ProgressPhotoGallery({
  weightSampleId,
  onClose,
  onPhotosChanged,
  userId,
  visible,
}: {
  weightSampleId: string;
  onClose: () => void;
  onPhotosChanged?: () => void;
  userId: string;
  visible: boolean;
}) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<FlatList<ProgressPhoto>>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selected = photos[index];
  const [entryCount, setEntryCount] = useState<number>();

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError("");
    setEntryCount(undefined);
    void Promise.all([
      getProgressPhotos(userId, weightSampleId, 0, photoPageSize),
      getEntryProgressPhotoCount(userId, weightSampleId),
    ])
      .then(([next, count]) => {
        if (!active) return;
        setPhotos(next);
        setEntryCount(count);
        setHasMore(next.length === photoPageSize);
        const nextIndex = 0;
        setIndex(nextIndex);
        requestAnimationFrame(() => {
          scroller.current?.scrollToOffset({
            animated: false,
            offset: nextIndex * width,
          });
        });
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Could not load photos.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [weightSampleId, userId, visible, width]);

  async function loadOlderPhotos() {
    if (!hasMore || loadingMore || busy) return;
    setLoadingMore(true);
    try {
      const next = await getProgressPhotos(
        userId,
        weightSampleId,
        photos.length,
        photoPageSize,
      );
      setPhotos((current) => {
        const unique = new Map(
          [...current, ...next].map((photo) => [photo.id, photo]),
        );
        return [...unique.values()];
      });
      setHasMore(next.length === photoPageSize);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load older photos.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function addPhoto(source: "camera" | "library") {
    if (entryCount === undefined || loading) return;
    if (entryCount >= progressPhotoEntryLimit) {
      setError("Three progress photos are allowed per weight entry.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const selectedPhoto = await selectProgressPhoto(source);
      if (!selectedPhoto) return;
      const prepared = await prepareProgressPhoto(selectedPhoto);
      const uploaded = await uploadProgressPhoto(
        userId,
        prepared,
        weightSampleId,
      );
      setPhotos((current) => [uploaded, ...current]);
      setIndex(0);
      requestAnimationFrame(() => {
        scroller.current?.scrollToOffset({ animated: false, offset: 0 });
      });
      onPhotosChanged?.();
      setEntryCount(undefined);
      setEntryCount(await getEntryProgressPhotoCount(userId, weightSampleId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not upload photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setConfirmingDelete(false);
    try {
      await deleteProgressPhoto(userId, selected);
      const next = photos.filter((photo) => photo.id !== selected.id);
      const nextIndex = Math.min(index, Math.max(0, next.length - 1));
      setPhotos(next);
      setIndex(nextIndex);
      requestAnimationFrame(() => {
        scroller.current?.scrollToOffset({
          animated: false,
          offset: nextIndex * width,
        });
      });
      onPhotosChanged?.();
      setEntryCount(undefined);
      setEntryCount(await getEntryProgressPhotoCount(userId, weightSampleId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateIndex(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(
      Math.max(
        0,
        Math.min(
          photos.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / width),
        ),
      ),
    );
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView edges={["bottom"]} style={styles.page}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.title}>Progress photos</Text>
          <Pressable
            accessibilityLabel="Close progress photos"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={10}
            onPress={onClose}
            style={styles.iconButton}
          >
            <SymbolView
              fallback={<Text style={styles.fallback}>×</Text>}
              name="xmark"
              size={20}
              tintColor={colors.text}
              weight="semibold"
            />
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <View
            style={[styles.viewer, { height: Math.min(560, height * 0.5) }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.blue} />
            ) : photos.length ? (
              <FlatList
                data={photos}
                decelerationRate="fast"
                getItemLayout={(_, itemIndex) => ({
                  index: itemIndex,
                  length: width,
                  offset: width * itemIndex,
                })}
                horizontal
                initialNumToRender={1}
                keyExtractor={(photo) => photo.id}
                maxToRenderPerBatch={2}
                onMomentumScrollEnd={updateIndex}
                onEndReached={() => void loadOlderPhotos()}
                onEndReachedThreshold={0.5}
                pagingEnabled
                ref={scroller}
                removeClippedSubviews
                renderItem={({ item: photo }) => (
                  <View style={[styles.slide, { width }]}>
                    <Image
                      accessibilityLabel={`Progress photo from ${new Date(photo.takenAt).toLocaleDateString()}`}
                      resizeMode="contain"
                      source={{ uri: photo.signedUrl }}
                      style={styles.image}
                    />
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
                windowSize={3}
              />
            ) : (
              <Text style={styles.empty}>
                No photos attached to this weight entry.
              </Text>
            )}
          </View>
          <View style={styles.details}>
            {selected ? (
              <>
                <Text style={styles.date}>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selected.takenAt))}
                </Text>
                <Text style={styles.count}>
                  {index + 1} of {photos.length}
                  {hasMore ? "+" : ""}
                </Text>
                <View style={styles.deleteAction}>
                  <IconButton
                    name="delete"
                    label="Delete"
                    destructive
                    disabled={busy || !selected}
                    onPress={() => setConfirmingDelete(true)}
                  />
                </View>
                {loadingMore ? (
                  <ActivityIndicator color={colors.blue} size="small" />
                ) : null}
              </>
            ) : null}
            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <PhotoAction
                disabled={
                  busy ||
                  loading ||
                  entryCount === undefined ||
                  entryCount >= progressPhotoEntryLimit
                }
                fallback="C"
                label="Camera"
                name="camera.fill"
                onPress={() => void addPhoto("camera")}
              />
              <PhotoAction
                disabled={
                  busy ||
                  loading ||
                  entryCount === undefined ||
                  entryCount >= progressPhotoEntryLimit
                }
                fallback="L"
                label="Library"
                name="photo.on.rectangle"
                onPress={() => void addPhoto("library")}
              />
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.limit}>
              {entryCount === undefined
                ? loading || busy
                  ? "Loading photo count..."
                  : "Photo count unavailable"
                : `${entryCount} of ${progressPhotoEntryLimit} photos attached to this entry`}
            </Text>
          </View>
        </ScrollView>
        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
        {confirmingDelete ? (
          <View style={styles.confirmBackdrop}>
            <View accessibilityViewIsModal style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Delete photo?</Text>
              <ConfirmationActions
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => void removeSelected()}
                busy={busy}
              />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function PhotoAction({
  destructive = false,
  disabled,
  fallback,
  label,
  name,
  onPress,
}: {
  destructive?: boolean;
  disabled: boolean;
  fallback: string;
  label: string;
  name: "camera.fill" | "photo.on.rectangle" | "trash";
  onPress: () => void;
}) {
  const tintColor = destructive ? "#B42318" : colors.blue;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <SymbolView
        fallback={
          <Text style={[styles.actionFallback, { color: tintColor }]}>
            {fallback}
          </Text>
        }
        name={name}
        size={23}
        tintColor={tintColor}
        weight="regular"
      />
      <Text style={[styles.actionLabel, { color: tintColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  title: { color: colors.text, fontSize: 21, fontWeight: "600" },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.fill,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  fallback: { color: colors.text, fontSize: 22, fontWeight: "700" },
  viewer: {
    alignItems: "center",
    backgroundColor: "#0B1720",
    justifyContent: "center",
  },
  slide: { alignItems: "center", height: "100%", justifyContent: "center" },
  image: { height: "100%", width: "100%" },
  empty: { color: colors.separator, fontSize: 15, fontWeight: "700" },
  details: { alignItems: "center", padding: 18 },
  deleteAction: { position: "absolute", right: 12, top: 14 },
  date: { color: colors.text, fontSize: 15, fontWeight: "700" },
  count: { color: colors.tertiary, fontSize: 12, marginTop: 4 },
  error: { color: "#B42318", marginTop: 10, textAlign: "center" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 232,
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
  },
  action: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    justifyContent: "center",
    maxWidth: 110,
    minHeight: 62,
  },
  actionFallback: { fontSize: 15, fontWeight: "600" },
  actionLabel: { fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  limit: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  busyOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(11, 23, 32, 0.55)",
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
  },
  confirmBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(16, 42, 67, 0.52)",
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderCurve: "continuous",
    maxWidth: 360,
    padding: 18,
    width: "100%",
  },
  confirmTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelButton: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  cancelText: { color: colors.secondary, fontWeight: "600" },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#B42318",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  deleteText: { color: "#fff", fontWeight: "600" },
});
