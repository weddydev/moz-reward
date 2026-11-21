import { describe, expect, it } from "vitest";
import { containerArgs, serverListening } from "./e2e-linux";

describe("[PD-03] pnpm e2e:linux waits for the Playwright server itself, not Docker's port", () => {
  it("[PD-03] not ready while npx is still installing, though Docker already maps the port", () => {
    expect(serverListening("")).toBe(false);
    expect(
      serverListening("npm warn exec The following package was not found and will be installed\n"),
    ).toBe(false);
  });

  it("[PD-03] ready once run-server logs its WebSocket address", () => {
    // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket -- sample run-server log text, not a connection
    expect(serverListening("npm warn exec …\nListening on ws://0.0.0.0:3105/\n")).toBe(true);
    // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket -- sample run-server log text, not a connection
    expect(serverListening("Listening on ws://localhost:3105/")).toBe(true);
  });

  it("[PD-03] another 'Listening on' (e.g. an http dashboard) is not the WebSocket server", () => {
    expect(serverListening("Listening on http://0.0.0.0:9323")).toBe(false);
  });

  it("[PD-03] the container runs the pinned version only", () => {
    expect(containerArgs("1.65.0")).toContain("mcr.microsoft.com/playwright:v1.65.0-noble");
    expect(() => containerArgs("1.65.0; rm -rf /")).toThrow(/unexpected Playwright version/);
  });
});
