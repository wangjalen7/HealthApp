import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  CoachActionPayload,
  CoachProfile,
} from "../../../../supabase/functions/_shared/coach";
import { useAuth } from "../../src/features/auth/auth-provider";
import { CoachActionReview } from "../../src/features/coach/coach-action-review";
import { CoachSetup } from "../../src/features/coach/coach-setup";
import {
  deleteCoachThread,
  getCoachMessages,
  getCoachProfile,
  listCoachThreads,
  saveCoachProfile,
  sendCoachMessage,
  updateCoachActionStatus,
  type CoachAction,
  type CoachMessage,
  type CoachThread,
} from "../../src/features/coach/repository";
import { createId } from "../../src/features/vitals/storage";
import { Icon } from "../../src/ui/icon";
import { Pressable } from "../../src/ui/pressable";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { colors } from "../../src/ui/theme";
import { trackingStyles as shared } from "../../src/ui/tracking-styles";

const quickPrompts = [
  {
    title: "What should I eat next?",
    icon: "food" as const,
  },
  {
    title: "Plan my next workout",
    icon: "workout" as const,
  },
  {
    title: "Review my progress",
    icon: "history" as const,
  },
];

function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function CoachScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<CoachProfile>();
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [quota, setQuota] = useState<{
    standardRemaining: number;
    deepRemaining: number;
  }>();
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(
    new Set(),
  );
  const [reviewAction, setReviewAction] = useState<CoachAction>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const input = useRef<TextInput>(null);

  const loadThread = useCallback(
    async (nextThreadId: string) => {
      if (!userId) return;
      setLoadingThread(true);
      setFeedback("");
      try {
        setMessages(await getCoachMessages(userId, nextThreadId));
        setThreadId(nextThreadId);
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Could not load this conversation.",
        );
      } finally {
        setLoadingThread(false);
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!userId) return () => undefined;
      setLoading(true);
      void Promise.all([getCoachProfile(userId), listCoachThreads(userId)])
        .then(([savedProfile, savedThreads]) => {
          if (!active) return;
          setProfile(savedProfile);
          setThreads(savedThreads);
        })
        .catch((error) => {
          if (active)
            setFeedback(
              error instanceof Error
                ? error.message
                : "Could not load AI Coach.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        request.current?.abort();
      };
    }, [userId]),
  );

  async function storeProfile(value: CoachProfile) {
    setSavingSetup(true);
    try {
      const saved = await saveCoachProfile(value);
      setProfile(saved);
      setEditingSetup(false);
      setFeedback("");
    } finally {
      setSavingSetup(false);
    }
  }

  function newChat() {
    request.current?.abort();
    setThreadId(undefined);
    setMessages([]);
    setText("");
    setFeedback("");
    setConfirmDelete(false);
    setShowThreads(false);
  }

  async function chooseThread(id: string) {
    if (busy || id === threadId) return;
    await loadThread(id);
    setShowThreads(false);
  }

  async function submit(prompt = text) {
    const message = prompt.trim();
    if (!userId || !message || busy) return;
    const controller = new AbortController();
    request.current = controller;
    const optimisticUser: CoachMessage = {
      id: createId(),
      role: "user",
      content: message,
      evidence: [],
      sources: [],
      actions: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);
    setText("");
    setBusy(true);
    setFeedback("");
    try {
      const response = await sendCoachMessage(
        {
          threadId,
          message,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          localDate: localDate(),
        },
        controller.signal,
      );
      const assistant: CoachMessage = {
        id: response.messageId,
        role: "assistant",
        content: response.answer,
        evidence: response.evidence,
        sources: response.sources,
        actions: response.actions,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, assistant]);
      setThreadId(response.threadId);
      setQuota(response.quota);
      const updated = await listCoachThreads(userId);
      setThreads(
        updated.length
          ? updated
          : [
              {
                id: response.threadId,
                title: message.slice(0, 60),
                updatedAt: new Date().toISOString(),
              },
            ],
      );
    } catch (error) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimisticUser.id),
      );
      if (controller.signal.aborted) {
        setFeedback("Coach response canceled. Your message is ready to retry.");
      } else {
        setFeedback(
          error instanceof Error
            ? error.message
            : "AI Coach could not respond.",
        );
      }
      setText(message);
    } finally {
      if (request.current === controller) request.current = undefined;
      setBusy(false);
    }
  }

  async function removeThread() {
    if (!userId || !threadId) return;
    setLoadingThread(true);
    try {
      await deleteCoachThread(userId, threadId);
      setThreads((current) => current.filter((item) => item.id !== threadId));
      newChat();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not delete conversation.",
      );
    } finally {
      setLoadingThread(false);
      setConfirmDelete(false);
    }
  }

  function setActionStatus(actionId: string, status: "applied" | "dismissed") {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        actions: message.actions.map((action) =>
          action.id === actionId ? { ...action, status } : action,
        ),
      })),
    );
  }

  async function applied(actionId: string, payload: CoachActionPayload) {
    if (!userId) return;
    await updateCoachActionStatus(userId, actionId, "applied");
    setActionStatus(actionId, "applied");
    setReviewAction(undefined);
    if (payload.kind === "next_meal") {
      router.navigate("/(app)/nutrition");
    } else if (payload.recommendation !== "rest") {
      router.navigate({
        pathname: "/(app)/workout",
        params: {
          section: payload.recommendation === "cardio" ? "cardio" : "lifting",
        },
      });
    }
  }

  async function dismissed(actionId: string) {
    if (!userId) return;
    await updateCoachActionStatus(userId, actionId, "dismissed");
    setActionStatus(actionId, "dismissed");
    setReviewAction(undefined);
  }

  const activeThread = threads.find((thread) => thread.id === threadId);

  if (!userId)
    return (
      <ScreenScrollView contentContainerStyle={shared.page}>
        <Text style={shared.error}>Sign in to use AI Coach.</Text>
      </ScreenScrollView>
    );

  if (loading)
    return (
      <ScreenScrollView contentContainerStyle={[shared.page, styles.center]}>
        <ActivityIndicator accessibilityLabel="Loading AI Coach" />
      </ScreenScrollView>
    );

  if (!profile || editingSetup)
    return (
      <ScreenScrollView contentContainerStyle={shared.page}>
        <CoachSetup
          key={editingSetup ? profile?.consentedAt : "new"}
          userId={userId}
          initial={profile}
          saving={savingSetup}
          onSave={storeProfile}
          onCancel={profile ? () => setEditingSetup(false) : undefined}
        />
      </ScreenScrollView>
    );

  return (
    <>
      <ScreenScrollView contentContainerStyle={shared.page}>
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Icon name="sparkles" size={20} color={colors.purple} />
            </View>
            <View style={styles.headingWrap}>
              <Text style={styles.title}>Coach</Text>
              <Text style={styles.subtitle}>
                Your health and training history
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="Coach conversations"
              accessibilityState={{ expanded: showThreads }}
              onPress={() => setShowThreads((current) => !current)}
              style={[
                styles.iconButton,
                showThreads && styles.iconButtonActive,
              ]}
            >
              <Icon
                name="history"
                size={19}
                color={showThreads ? colors.blue : colors.secondary}
              />
              {threads.length ? (
                <View style={styles.threadBadge}>
                  <Text style={styles.threadBadgeText}>{threads.length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityLabel="New Coach chat"
              onPress={newChat}
              style={styles.iconButton}
            >
              <Icon name="plus" size={20} color={colors.secondary} />
            </Pressable>
            <Pressable
              accessibilityLabel="Coach settings"
              onPress={() => setEditingSetup(true)}
              style={styles.iconButton}
            >
              <Icon name="edit" size={18} color={colors.secondary} />
            </Pressable>
          </View>
        </View>

        {showThreads ? (
          <View style={styles.threadPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Conversations</Text>
              <Pressable onPress={newChat} style={styles.newButton}>
                <Icon name="plus" size={16} color={colors.blue} />
                <Text style={styles.newButtonText}>New</Text>
              </Pressable>
            </View>
            {threads.length ? (
              threads.map((thread) => (
                <Pressable
                  key={thread.id}
                  accessibilityState={{ selected: thread.id === threadId }}
                  onPress={() => void chooseThread(thread.id)}
                  style={[
                    styles.threadRow,
                    thread.id === threadId && styles.threadRowActive,
                  ]}
                >
                  <Icon
                    name="history"
                    size={16}
                    color={
                      thread.id === threadId ? colors.blue : colors.tertiary
                    }
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.threadText,
                      thread.id === threadId && styles.threadTextActive,
                    ]}
                  >
                    {thread.title}
                  </Text>
                  <Icon name="chevron" size={15} color={colors.tertiary} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.panelEmpty}>No saved conversations yet.</Text>
            )}
          </View>
        ) : null}

        {threadId ? (
          <View style={styles.activeThreadBar}>
            {confirmDelete ? (
              <View style={styles.deleteConfirm}>
                <Text style={styles.activeThreadText}>
                  Delete this conversation?
                </Text>
                <Pressable
                  onPress={() => void removeThread()}
                  style={styles.textButton}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  style={styles.textButton}
                >
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text numberOfLines={1} style={styles.activeThreadText}>
                  {activeThread?.title ?? "Conversation"}
                </Text>
                <Pressable
                  accessibilityLabel="Delete current conversation"
                  onPress={() => setConfirmDelete(true)}
                  style={styles.compactDelete}
                >
                  <Text style={styles.mutedLink}>Delete</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {!messages.length && !loadingThread ? (
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Icon name="sparkles" size={26} color={colors.purple} />
            </View>
            <Text style={styles.heroTitle}>How can I help today?</Text>
            <Text style={styles.heroCopy}>
              Ask about your next meal, workout, or recent progress.
            </Text>
            <View style={styles.quickGrid}>
              {quickPrompts.map((prompt) => (
                <Pressable
                  key={prompt.title}
                  onPress={() => void submit(prompt.title)}
                  style={styles.quickCard}
                >
                  <Icon name={prompt.icon} size={18} color={colors.blue} />
                  <Text style={styles.quickTitle}>{prompt.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {loadingThread ? (
          <ActivityIndicator accessibilityLabel="Loading conversation" />
        ) : null}
        <View style={styles.messages}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              evidenceExpanded={expandedEvidence.has(message.id)}
              onToggleEvidence={() =>
                setExpandedEvidence((current) => {
                  const next = new Set(current);
                  if (next.has(message.id)) next.delete(message.id);
                  else next.add(message.id);
                  return next;
                })
              }
              onReview={setReviewAction}
            />
          ))}
          {busy ? (
            <View style={styles.typing}>
              <ActivityIndicator
                accessibilityLabel="Coach is responding"
                size="small"
              />
              <Text style={styles.muted}>Reviewing your data...</Text>
            </View>
          ) : null}
        </View>

        {feedback ? (
          <View style={styles.errorCard}>
            <Text accessibilityLiveRegion="polite" style={shared.error}>
              {feedback}
            </Text>
            {text ? (
              <Pressable
                onPress={() => void submit()}
                style={styles.retryButton}
              >
                <Text style={styles.link}>Retry message</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            ref={input}
            accessibilityLabel="Message AI Coach"
            editable={!busy}
            maxLength={4000}
            multiline
            onChangeText={setText}
            placeholder="Ask about meals, training, recovery, or progress"
            placeholderTextColor={colors.tertiary}
            style={styles.composerInput}
            value={text}
          />
          {busy ? (
            <Pressable
              accessibilityLabel="Cancel Coach response"
              onPress={() => request.current?.abort()}
              style={styles.sendButton}
            >
              <Icon name="close" color={colors.surface} size={19} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="Send message to AI Coach"
              disabled={!text.trim()}
              onPress={() => void submit()}
              style={styles.sendButton}
            >
              <Icon name="chevron" color={colors.surface} size={20} />
            </Pressable>
          )}
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.quota}>
            {quota
              ? `${quota.standardRemaining} standard • ${quota.deepRemaining} deep left today`
              : "30 standard • 3 deep per day"}
          </Text>
          <Pressable
            accessibilityLabel="Open AI meal estimator"
            onPress={() =>
              router.navigate({
                pathname: "/(app)/nutrition",
                params: { estimate: "true" },
              })
            }
            style={styles.mealEstimatorLink}
          >
            <Icon name="camera" size={16} color={colors.blue} />
            <Text style={styles.link}>Estimate a meal</Text>
          </Pressable>
        </View>
      </ScreenScrollView>
      <CoachActionReview
        userId={userId}
        action={reviewAction}
        onClose={() => setReviewAction(undefined)}
        onApplied={applied}
        onDismissed={dismissed}
      />
    </>
  );
}

function MessageBubble({
  message,
  evidenceExpanded,
  onToggleEvidence,
  onReview,
}: {
  message: CoachMessage;
  evidenceExpanded: boolean;
  onToggleEvidence: () => void;
  onReview: (action: CoachAction) => void;
}) {
  const assistant = message.role === "assistant";
  return (
    <View style={[styles.bubbleRow, !assistant && styles.userBubbleRow]}>
      <View
        style={[
          styles.bubble,
          assistant ? styles.assistantBubble : styles.userBubble,
        ]}
      >
        <Text
          style={[styles.messageText, !assistant && styles.userMessageText]}
        >
          {message.content}
        </Text>
        {assistant && (message.evidence.length || message.sources.length) ? (
          <View style={styles.evidence}>
            <Pressable
              accessibilityState={{ expanded: evidenceExpanded }}
              onPress={onToggleEvidence}
              style={styles.evidenceButton}
            >
              <Text style={styles.evidenceButtonText}>Data used</Text>
              <Text style={styles.evidenceButtonText}>
                {evidenceExpanded ? "Hide" : "Show"}
              </Text>
            </Pressable>
            {evidenceExpanded ? (
              <View style={styles.evidenceBody}>
                {message.evidence.map((item, index) => (
                  <View key={`${item.label}-${index}`}>
                    <Text style={styles.evidenceLabel}>{item.label}</Text>
                    <Text style={styles.evidenceValue}>
                      {item.value} · {item.period}
                    </Text>
                  </View>
                ))}
                {message.sources.map((source) => (
                  <Pressable
                    key={source.url}
                    onPress={() => void Linking.openURL(source.url)}
                    style={styles.sourceButton}
                  >
                    <Text style={styles.link}>{source.title}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {assistant
          ? message.actions.map((action) => (
              <View key={action.id} style={styles.actionCard}>
                <View style={styles.actionHeader}>
                  <Icon
                    name={
                      action.payload.kind === "next_meal" ? "food" : "workout"
                    }
                    size={21}
                    color={colors.blue}
                  />
                  <View style={styles.quickText}>
                    <Text style={styles.actionTitle}>
                      {action.payload.title}
                    </Text>
                    <Text style={styles.quickDetail}>
                      {action.payload.kind === "next_meal"
                        ? `${action.payload.items.length} food${action.payload.items.length === 1 ? "" : "s"}`
                        : action.payload.recommendation === "rest"
                          ? "Recovery recommendation"
                          : action.payload.recommendation === "cardio"
                            ? `${action.payload.cardio?.durationMinutes ?? 0} minutes cardio`
                            : action.payload.recommendation === "combo"
                              ? `${action.payload.exercises.length} exercises + cardio`
                              : `${action.payload.exercises.length} exercise${action.payload.exercises.length === 1 ? "" : "s"}`}
                    </Text>
                  </View>
                </View>
                {action.status === "pending" ? (
                  <Pressable
                    accessibilityLabel={`Review ${action.payload.title}`}
                    onPress={() => onReview(action)}
                    style={styles.reviewButton}
                  >
                    <Text style={styles.reviewButtonText}>Review and edit</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.actionStatus}>
                    {action.status === "applied"
                      ? action.payload.kind === "next_workout" &&
                        action.payload.recommendation === "rest"
                        ? "Rest day confirmed"
                        : "Applied to draft"
                      : "Dismissed"}
                  </Text>
                )}
              </View>
            ))
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brand: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10 },
  brandIcon: {
    alignItems: "center",
    backgroundColor: "#F3ECFC",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headingWrap: { flex: 1, gap: 1 },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  subtitle: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  iconButton: {
    alignItems: "center",
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 40,
    width: 40,
  },
  iconButtonActive: { backgroundColor: colors.blueSoft },
  threadBadge: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 15,
    paddingHorizontal: 3,
    position: "absolute",
    right: 1,
    top: 1,
  },
  threadBadgeText: { color: colors.surface, fontSize: 9, fontWeight: "700" },
  threadPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    marginBottom: 12,
    padding: 8,
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
    paddingHorizontal: 7,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  newButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 6,
  },
  newButtonText: { color: colors.blue, fontSize: 14, fontWeight: "600" },
  threadRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 10,
  },
  threadRowActive: { backgroundColor: colors.blueSoft },
  threadText: { color: colors.secondary, flex: 1, fontSize: 14 },
  threadTextActive: { color: colors.text, fontWeight: "600" },
  panelEmpty: {
    color: colors.secondary,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  activeThreadBar: {
    alignItems: "center",
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    minHeight: 38,
  },
  activeThreadText: {
    color: colors.secondary,
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  compactDelete: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    paddingLeft: 12,
  },
  deleteConfirm: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  textButton: {
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 4,
  },
  deleteText: { color: "#B42318", fontSize: 14, fontWeight: "600" },
  muted: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  mutedLink: { color: colors.secondary, fontSize: 13 },
  link: { color: colors.blue, fontSize: 14, fontWeight: "600" },
  hero: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
    paddingTop: 22,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "#F3ECFC",
    borderRadius: 20,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  heroCopy: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420,
    textAlign: "center",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    maxWidth: 580,
    width: "100%",
  },
  quickCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: 160,
    flexGrow: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickText: { flex: 1, gap: 3 },
  quickTitle: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "600" },
  quickDetail: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  messages: { gap: 16, marginTop: 14 },
  bubbleRow: { alignItems: "flex-start" },
  userBubbleRow: { alignItems: "flex-end" },
  bubble: { borderRadius: 18, gap: 10, maxWidth: "94%" },
  assistantBubble: {
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  userBubble: {
    backgroundColor: colors.blue,
    borderBottomRightRadius: 5,
    maxWidth: "86%",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  typing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 2,
    paddingVertical: 12,
  },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  userMessageText: { color: colors.surface },
  evidence: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  evidenceButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
  },
  evidenceButtonText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "600",
  },
  evidenceBody: { gap: 10, paddingBottom: 5 },
  evidenceLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  evidenceValue: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  sourceButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 13,
  },
  actionHeader: { alignItems: "center", flexDirection: "row", gap: 9 },
  actionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  reviewButton: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 44,
  },
  reviewButtonText: { color: colors.surface, fontSize: 14, fontWeight: "600" },
  actionStatus: { color: colors.blue, fontSize: 13, fontWeight: "600" },
  errorCard: {
    backgroundColor: "#FFF1F0",
    borderRadius: 12,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    padding: 6,
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 150,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: "top",
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  quota: { color: colors.secondary, fontSize: 12 },
  mealEstimatorLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 38,
  },
  disclaimer: {
    color: colors.tertiary,
    fontSize: 12,
    lineHeight: 17,
    paddingBottom: 4,
    textAlign: "center",
  },
});
