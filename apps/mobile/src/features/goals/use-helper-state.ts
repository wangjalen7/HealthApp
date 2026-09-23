import { useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import type { HelperKind, HelperResult } from "./helper-model";
import {
  getDailyGoals,
  saveGoalCalculation,
  type DailyGoals,
} from "./repository";
import { loadHelperDraft, storeHelperDraft } from "./helper-draft";

export function useHelperState<D, R extends HelperResult>({
  userId,
  kind,
  schema,
  defaults,
  restore,
  onGoalsChange,
}: {
  userId: string;
  kind: HelperKind;
  schema: ZodType<D>;
  defaults: D;
  restore: (goals: DailyGoals) => { inputs: D; result?: R };
  onGoalsChange?: (goals: DailyGoals) => void;
}) {
  const config = useRef({ restore, onGoalsChange });
  config.current = { restore, onGoalsChange };
  const owner = useRef(userId);
  owner.current = userId;
  const mounted = useRef(true);
  const [inputs, setInputs] = useState(defaults);
  const [result, setResult] = useState<R>();
  const [goals, setGoals] = useState<DailyGoals>({});
  const [editing, setEditing] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError("");
    void Promise.all([
      getDailyGoals(userId),
      loadHelperDraft(userId, kind, schema),
    ])
      .then(([saved, draft]) => {
        if (!active) return;
        const restored = config.current.restore(saved);
        setInputs(draft ?? restored.inputs);
        setResult(restored.result);
        setHasDraft(Boolean(draft));
        setGoals(saved);
        setEditing(!restored.result);
        setLoaded(true);
        config.current.onGoalsChange?.(saved);
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load saved calculations.",
          );
      });
    return () => {
      active = false;
    };
  }, [userId, kind, schema, revision]);
  function change(next: D) {
    setInputs(next);
    setHasDraft(true);
    setError("");
    void storeHelperDraft(userId, kind, next).catch(() => {
      if (mounted.current && owner.current === userId)
        setError(
          "Could not save these edits on this device. Keep the helper open and try again.",
        );
    });
  }
  async function cancel() {
    try {
      await storeHelperDraft(userId, kind, null);
      if (!mounted.current || owner.current !== userId) return;
      setInputs(result ? (result.inputs as D) : defaults);
      setHasDraft(false);
      setEditing(!result);
      setError("");
    } catch {
      setError("Could not discard edits. Please try again.");
    }
  }
  async function calculate(build: (input: D) => R) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const calculated = build(inputs);
      const accepted = await saveGoalCalculation(userId, calculated);
      // A reopened helper may already contain newer edits while this save completes.
      await storeHelperDraft(userId, kind, null, inputs);
      if (!mounted.current || owner.current !== userId) return;
      // A retry may confirm the original attempt's timestamp and date-based estimate.
      setResult(config.current.restore(accepted).result ?? calculated);
      setGoals(accepted);
      setEditing(false);
      setHasDraft(false);
      config.current.onGoalsChange?.(accepted);
    } catch (e) {
      if (mounted.current && owner.current === userId)
        setError(
          e instanceof Error
            ? e.message
            : "Could not save this calculation. Your previous result is unchanged.",
        );
    } finally {
      if (mounted.current && owner.current === userId) setBusy(false);
    }
  }
  async function apply(use: (result: R) => Promise<void>) {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      await use(result);
      if (mounted.current && owner.current === userId) {
        const saved = await getDailyGoals(userId);
        if (mounted.current && owner.current === userId) setGoals(saved);
      }
    } catch (e) {
      if (mounted.current && owner.current === userId)
        setError(e instanceof Error ? e.message : "Could not apply this goal.");
    } finally {
      if (mounted.current && owner.current === userId) setBusy(false);
    }
  }
  return {
    inputs,
    result,
    goals,
    editing,
    hasDraft,
    loaded,
    busy,
    error,
    change,
    cancel,
    calculate,
    apply,
    edit: () => {
      setEditing(true);
      setError("");
    },
    retry: () => setRevision((n) => n + 1),
  };
}
