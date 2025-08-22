import { useRef, type RefObject } from "react";

export function useLazyRef<T>(init: (() => T)) {
  const ref = useRef<T>(undefined);

  if(!ref.current)
    ref.current = init();

  return ref as RefObject<T>;
}
