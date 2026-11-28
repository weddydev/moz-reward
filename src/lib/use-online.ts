"use client";

import { useEffect, useState } from "react";

/** `navigator.onLine`, kept current (true on the server and before hydration). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = (): void => {
      setOnline(navigator.onLine);
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return online;
}
