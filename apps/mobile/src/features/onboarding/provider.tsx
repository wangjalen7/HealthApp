import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/auth-provider";
import { getAccountSetup, resumeSetupWrite } from "./repository";
import type { AccountSetup } from "./model";
type State = {
  setup?: AccountSetup;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  accept: (value: AccountSetup) => void;
};
const Context = createContext<State | undefined>(undefined);
export function SetupProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const current = useRef(userId);
  const generation = useRef(0);
  current.current = userId;
  const [state, setState] = useState<{
    userId?: string;
    setup?: AccountSetup;
    loading: boolean;
    error: string;
  }>({ loading: true, error: "" });
  const reload = useCallback(async () => {
    if (!userId) return;
    const requestGeneration = ++generation.current;
    setState((s) => ({ ...s, userId, loading: true, error: "" }));
    try {
      await resumeSetupWrite(userId);
      const setup = await getAccountSetup(userId);
      if (
        current.current === userId &&
        generation.current === requestGeneration
      )
        setState({ userId, setup, loading: false, error: "" });
    } catch (e) {
      if (
        current.current === userId &&
        generation.current === requestGeneration
      )
        setState({
          userId,
          loading: false,
          error: e instanceof Error ? e.message : "Could not load setup.",
        });
    }
  }, [userId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void reload();
    });
    return () => sub.remove();
  }, [reload]);
  const matched = state.userId === userId;
  return (
    <Context.Provider
      value={{
        setup: matched ? state.setup : undefined,
        loading: Boolean(userId) && (!matched || state.loading),
        error: matched ? state.error : "",
        reload,
        accept: (value) => {
          if (current.current === value.user_id) generation.current++;
          if (current.current === value.user_id)
            setState({
              userId: value.user_id,
              setup: value,
              loading: false,
              error: "",
            });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAccountSetup() {
  const value = useContext(Context);
  if (!value) throw Error("SetupProvider required");
  return value;
}
