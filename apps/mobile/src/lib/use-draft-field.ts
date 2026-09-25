import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

/** Synchronous revision protects typing from an earlier asynchronous draft read. */
export function useDraftField<T>(
  revision: MutableRefObject<number>,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const change = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      revision.current++;
      setValue(next);
    },
    [revision],
  );
  return [value, change];
}
