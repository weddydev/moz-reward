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

/** A FormData entry as text; a File (never expected in our text fields) becomes "". */
export const formString = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";

/** Reads a trimmed string field from a submitted form. */
export const formValue = (form: HTMLFormElement, name: string): string =>
  formString(new FormData(form).get(name)).trim();
