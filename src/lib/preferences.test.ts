// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccountPreferences,
  applyMotionPreference,
  connectAccount,
  isReducedMotion,
  MOTION_ATTRIBUTE,
  PREPAINT_SCRIPT,
  type PreferenceSaver,
  readMotionPreference,
  readSoundPreference,
  reconcile,
  resetPreferencesForTest,
  resolveReducedMotion,
  setMotionPreference,
  setSoundPreference,
  STORAGE_KEYS,
  useMotionPreference,
  useSoundPreference,
  watchOtherTabs,
} from "./preferences";

type Mql = { matches: boolean; listeners: Set<() => void> };

/** A controllable `prefers-reduced-motion` media query. */
function mockSystem(reduce: boolean): { set: (reduce: boolean) => void } {
  const mql: Mql = { matches: reduce, listeners: new Set() };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return mql.matches;
      },
      addEventListener: (_: string, l: () => void) => mql.listeners.add(l),
      removeEventListener: (_: string, l: () => void) => mql.listeners.delete(l),
    })),
  );
  return {
    set: (next) => {
      mql.matches = next;
      mql.listeners.forEach((l) => {
        l();
      });
    },
  };
}

/** localStorage that throws on every call, as Safari does with storage blocked. */
function blockStorage(): void {
  const fail = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(fail);
}

const attr = (): string | null => document.documentElement.getAttribute(MOTION_ATTRIBUTE);
const saved = (): PreferenceSaver => vi.fn(async () => ({ ok: true as const, saved: true }));
const NO_CHOICE: AccountPreferences = { reduceMotion: null, soundOn: null };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
  resetPreferencesForTest();
  mockSystem(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("[P0-08] motion preference (device)", () => {
  it.each([
    ["system", false, false],
    ["system", true, true],
    ["reduce", false, true],
    ["full", true, false],
  ] as const)("pref=%s system=%s → reduced=%s", (pref, system, expected) => {
    expect(resolveReducedMotion(pref, system)).toBe(expected);
  });

  it("persists the choice and mirrors it to <html data-reduce-motion>", async () => {
    await setMotionPreference("reduce");
    expect(readMotionPreference()).toBe("reduce");
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBe("reduce");
    expect(attr()).toBe("true");
    expect(isReducedMotion()).toBe(true);

    await setMotionPreference("system");
    expect(localStorage.getItem(STORAGE_KEYS.motion)).toBeNull();
    expect(attr()).toBeNull();
    expect(isReducedMotion()).toBe(false);
  });

  it('"full" overrides a system that asks for reduced motion', async () => {
    mockSystem(true);
    await setMotionPreference("full");
    expect(attr()).toBe("false");
    expect(isReducedMotion()).toBe(false);
  });

  it("ignores a stored value it doesn't know", () => {
    localStorage.setItem(STORAGE_KEYS.motion, "sideways");
    expect(readMotionPreference()).toBe("system");
    applyMotionPreference();
    expect(attr()).toBeNull();
  });

  it("storage blocked: follows the system, no error, and a choice still applies to this page", async () => {
    mockSystem(true);
    blockStorage();
    expect(readMotionPreference()).toBe("system");
    expect(isReducedMotion()).toBe(true);
    expect(readSoundPreference()).toBe(true);

    await setMotionPreference("full");
    await setSoundPreference(false);
    expect(attr()).toBe("false");
    expect(isReducedMotion()).toBe(false);
    expect(readSoundPreference()).toBe(false);
  });
});

describe("[P0-08] sound preference (device)", () => {
  it("defaults to on and stores the choice", async () => {
    expect(readSoundPreference()).toBe(true);
    await setSoundPreference(false);
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe("off");
    expect(readSoundPreference()).toBe(false);
    await setSoundPreference(true);
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe("on");
  });
});

describe("[P0-08] pre-paint script", () => {
  const run = (): void => {
    // The script is our own constant; this is how the browser runs it from the inline <script>.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (new Function(PREPAINT_SCRIPT) as () => void)();
  };

  it.each([
    ["reduce", "true"],
    ["full", "false"],
    [null, null],
    ["junk", null],
  ] as const)("stored %s → attribute %s", (stored, expected) => {
    if (stored) localStorage.setItem(STORAGE_KEYS.motion, stored);
    run();
    expect(attr()).toBe(expected);
  });

  it("agrees with applyMotionPreference for every stored value", () => {
    for (const stored of ["reduce", "full", "junk", null]) {
      localStorage.clear();
      if (stored) localStorage.setItem(STORAGE_KEYS.motion, stored);
      document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
      run();
      const fromScript = attr();
      document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
      applyMotionPreference();
      expect(attr()).toBe(fromScript);
    }
  });

  it("storage blocked: does nothing and does not throw", () => {
    blockStorage();
    expect(run).not.toThrow();
    expect(attr()).toBeNull();
  });

  it("cannot break out of its <script> element", () => {
    expect(PREPAINT_SCRIPT).not.toMatch(/<\/?script|<!--/i);
  });
});

describe("[P0-08] reconcile (device vs profile)", () => {
  const device = (
    reduceMotion: boolean | null,
    soundOn: boolean | null,
    sync: "synced" | "pending" | null = null,
  ) => ({ reduceMotion, soundOn, sync });

  it("fresh device takes the profile's choices", () => {
    expect(reconcile(device(null, null), { reduceMotion: true, soundOn: false })).toEqual({
      adopt: { reduceMotion: true, soundOn: false },
      push: false,
    });
  });

  it("signed-out choice is kept and saved when the profile has none", () => {
    expect(reconcile(device(true, false), NO_CHOICE)).toEqual({ adopt: null, push: true });
  });

  it("decides per setting: profile motion wins, device sound is saved", () => {
    expect(reconcile(device(true, false), { reduceMotion: false, soundOn: null })).toEqual({
      adopt: { reduceMotion: false, soundOn: false },
      push: true,
    });
  });

  it("nothing chosen anywhere: nothing to do", () => {
    expect(reconcile(device(null, null), NO_CHOICE)).toEqual({ adopt: null, push: false });
  });

  it("a synced device follows the profile back to 'no choice'", () => {
    expect(reconcile(device(true, false, "synced"), NO_CHOICE)).toEqual({
      adopt: NO_CHOICE,
      push: false,
    });
  });

  it("a synced device that already matches changes nothing", () => {
    expect(reconcile(device(true, null, "synced"), { reduceMotion: true, soundOn: null })).toEqual({
      adopt: null,
      push: false,
    });
  });

  it("an unsent change wins over the profile and is sent again", () => {
    expect(
      reconcile(device(false, true, "pending"), { reduceMotion: true, soundOn: false }),
    ).toEqual({ adopt: null, push: true });
  });
});

describe("[P0-08] profile sync", () => {
  it("a fresh device adopts the profile and marks itself synced, without saving", async () => {
    const save = saved();
    await connectAccount({ reduceMotion: true, soundOn: false }, save);
    expect(attr()).toBe("true");
    expect(readMotionPreference()).toBe("reduce");
    expect(readSoundPreference()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
    expect(save).not.toHaveBeenCalled();
  });

  it("a signed-out choice is saved to a profile that has none", async () => {
    await setMotionPreference("reduce");
    const save = saved();
    await connectAccount(NO_CHOICE, save);
    expect(save).toHaveBeenCalledExactlyOnceWith({ reduceMotion: true, soundOn: null });
    expect(readMotionPreference()).toBe("reduce");
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
  });

  it("a change while signed in is saved", async () => {
    const save = saved();
    await connectAccount(NO_CHOICE, save);
    await setSoundPreference(false);
    expect(save).toHaveBeenLastCalledWith({ reduceMotion: null, soundOn: false });
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
  });

  it.each([
    ["rejects (offline)", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["answers with an error (500)", () => Promise.resolve({ ok: false as const })],
  ])("save %s: the device keeps the choice and sends it on the next page load", async (_, impl) => {
    const failing: PreferenceSaver = vi.fn(impl);
    await connectAccount(NO_CHOICE, failing);
    await setMotionPreference("reduce");
    expect(attr()).toBe("true");
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("pending");

    // Next page load: the profile still has the old value; the device's unsent change wins.
    resetPreferencesForTest();
    const save = saved();
    await connectAccount({ reduceMotion: false, soundOn: null }, save);
    expect(save).toHaveBeenCalledExactlyOnceWith({ reduceMotion: true, soundOn: null });
    expect(readMotionPreference()).toBe("reduce");
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
  });

  it("an older save finishing after a newer change does not mark the device synced", async () => {
    let finishFirst: (v: { ok: true; saved: true }) => void = () => {};
    const save = vi
      .fn<PreferenceSaver>()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    await connectAccount(NO_CHOICE, save);
    const first = setMotionPreference("reduce");
    await setMotionPreference("full"); // its save fails
    finishFirst({ ok: true, saved: true });
    await first;
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("pending");
  });

  it("no customer profile (staff, admin): device-only, no error, no further saves", async () => {
    const save: PreferenceSaver = vi.fn(async () => ({ ok: true as const, saved: false }));
    await setMotionPreference("reduce");
    await connectAccount(NO_CHOICE, save);
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBeNull();
    await setMotionPreference("full");
    expect(save).toHaveBeenCalledTimes(1);
    expect(readMotionPreference()).toBe("full");
  });

  it("signed out: nothing is saved and the device forgets it was synced", async () => {
    const save = saved();
    await connectAccount({ reduceMotion: true, soundOn: null }, save);
    await connectAccount("none", save);
    await setMotionPreference("full");
    expect(save).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBeNull();
    expect(readMotionPreference()).toBe("full"); // kept on the device
  });

  it("a change made while the profile can't be reached is kept and sent on the next load", async () => {
    // The device follows a profile that says "reduce".
    const save = saved();
    await connectAccount({ reduceMotion: true, soundOn: null }, save);
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
    // Next page load: the profile can't be read (or ApplyPreferences has not mounted yet): no saver.
    resetPreferencesForTest();
    await connectAccount("unknown", save);
    await setMotionPreference("full");
    expect(save).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("pending");
    // The load after that: the device's newer choice wins over the profile's old one and is sent.
    resetPreferencesForTest();
    await connectAccount({ reduceMotion: true, soundOn: null }, save);
    expect(readMotionPreference()).toBe("full");
    expect(save).toHaveBeenCalledExactlyOnceWith({ reduceMotion: false, soundOn: null });
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("synced");
  });

  it("profile unreadable: nothing changes", async () => {
    await setMotionPreference("reduce");
    localStorage.setItem(STORAGE_KEYS.sync, "pending");
    const save = saved();
    await connectAccount("unknown", save);
    expect(save).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.sync)).toBe("pending");
    expect(readMotionPreference()).toBe("reduce");
  });
});

describe("[P0-08] hooks", () => {
  it("useMotionPreference follows the system while the choice is 'system'", () => {
    const system = mockSystem(false);
    const { result } = renderHook(() => useMotionPreference());
    expect(result.current).toMatchObject({ pref: "system", reduced: false });
    act(() => {
      system.set(true);
    });
    expect(result.current.reduced).toBe(true);
  });

  it("setPref updates every mounted hook, the attribute and storage", () => {
    const a = renderHook(() => useMotionPreference());
    const b = renderHook(() => useMotionPreference());
    act(() => {
      a.result.current.setPref("reduce");
    });
    expect(a.result.current).toMatchObject({ pref: "reduce", reduced: true });
    expect(b.result.current).toMatchObject({ pref: "reduce", reduced: true });
    expect(attr()).toBe("true");
    act(() => {
      b.result.current.setPref("system");
    });
    expect(a.result.current).toMatchObject({ pref: "system", reduced: false });
  });

  it("a change in another tab applies here (storage event)", () => {
    const stop = watchOtherTabs();
    const motion = renderHook(() => useMotionPreference());
    const sound = renderHook(() => useSoundPreference());
    act(() => {
      localStorage.setItem(STORAGE_KEYS.motion, "reduce");
      localStorage.setItem(STORAGE_KEYS.sound, "off");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.motion }));
    });
    expect(motion.result.current).toMatchObject({ pref: "reduce", reduced: true });
    expect(sound.result.current.on).toBe(false);
    expect(attr()).toBe("true");

    stop();
    act(() => {
      localStorage.removeItem(STORAGE_KEYS.motion);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.motion }));
    });
    expect(attr()).toBe("true"); // no longer watching
  });

  it("an unrelated storage key is ignored", () => {
    const stop = watchOtherTabs();
    const seen = vi.fn();
    const { result } = renderHook(() => {
      seen();
      return useMotionPreference();
    });
    const renders = seen.mock.calls.length;
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "moz_consent" }));
    });
    expect(seen.mock.calls.length).toBe(renders);
    expect(result.current.pref).toBe("system");
    stop();
  });

  it("useSoundPreference: on by default, setOn persists", () => {
    const { result } = renderHook(() => useSoundPreference());
    expect(result.current.on).toBe(true);
    act(() => {
      result.current.setOn(false);
    });
    expect(result.current.on).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.sound)).toBe("off");
  });

  it("storage blocked: hooks work for the page and nothing throws", () => {
    blockStorage();
    const { result } = renderHook(() => useMotionPreference());
    expect(result.current.pref).toBe("system");
    act(() => {
      result.current.setPref("reduce");
    });
    expect(result.current).toMatchObject({ pref: "reduce", reduced: true });
  });
});
