import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** false during SSR and before hydration, true once React owns the page. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** Reads a trimmed string field from a submitted form. */
export const formValue = (form: HTMLFormElement, name: string): string =>
  String(new FormData(form).get(name) ?? "").trim();
