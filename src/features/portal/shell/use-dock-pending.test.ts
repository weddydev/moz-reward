// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDockPending } from "./use-dock-pending";

describe("[PD-07] dock pending tap", () => {
  it("[PD-07] a tap is pending on the page it was made on", () => {
    const { result } = renderHook(({ path }) => useDockPending(path), {
      initialProps: { path: "/wallet" },
    });
    act(() => {
      result.current[1](4);
    });
    expect(result.current[0]).toEqual({ from: "/wallet", column: 4 });
  });

  it("[PD-07] a route change drops the tap: back on the tapping page the gold settles (code review HIGH-1)", () => {
    const { result, rerender } = renderHook(({ path }) => useDockPending(path), {
      initialProps: { path: "/wallet" },
    });
    act(() => {
      result.current[1](4);
    });
    rerender({ path: "/me" });
    expect(result.current[0]).toBeNull();
    // Android Back: the tapping page again, no new tap → nothing pending.
    rerender({ path: "/wallet" });
    expect(result.current[0]).toBeNull();
  });

  it("[PD-07] a re-render on the same page keeps the tap", () => {
    const { result, rerender } = renderHook(({ path }) => useDockPending(path), {
      initialProps: { path: "/wallet" },
    });
    act(() => {
      result.current[1](2);
    });
    rerender({ path: "/wallet" });
    expect(result.current[0]).toEqual({ from: "/wallet", column: 2 });
  });
});
