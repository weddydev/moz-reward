/**
 * The offline shell marks its `<main>` with this so the card guard leaves the cached card alone there (the shell
 * always renders signed out). Kept here, not in a "use client" file: a server page importing a value from one
 * gets a client reference, not the string. Its own module, so the guard (on every page) can read it without
 * loading the card cache code (C-91).
 */
export const OFFLINE_SHELL_ATTR = "data-offline-shell";
