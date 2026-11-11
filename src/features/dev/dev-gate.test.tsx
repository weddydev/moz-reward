import { beforeEach, describe, expect, it, vi } from "vitest";

const appEnv = vi.hoisted(() => ({ value: "test" }));
vi.mock("next/server", () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock("@/server/env", () => ({ env: () => ({ APP_ENV: appEnv.value }) }));

const { DevGate } = await import("./DevGate");

describe("[P0-10] /dev galleries are 404 in production (AC 9)", () => {
  beforeEach(() => {
    appEnv.value = "test";
  });

  it("renders the gallery outside production", async () => {
    for (const value of ["local", "test", "staging"]) {
      appEnv.value = value;
      await expect(DevGate({ children: "gallery" })).resolves.toBeTruthy();
    }
  });

  it("is not found with APP_ENV=production (covers /dev/ui and /dev/motion: one layout)", async () => {
    appEnv.value = "production";
    await expect(DevGate({ children: "gallery" })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
