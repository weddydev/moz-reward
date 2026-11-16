// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeviceList } from "./DeviceList";
import { SignOutButton } from "./SignOutButton";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const DEVICES = [
  { id: "a", device: "Chrome on Mac", signedIn: "7 Nov 2026", lastActive: "today", current: true },
  {
    id: "b",
    device: "Safari on iPhone",
    signedIn: "6 Nov 2026",
    lastActive: "today",
    current: false,
  },
];

/**
 * CI 43823399382: axe scanned /me/security while the device list's buttons were still disabled (55% opacity)
 * because the page segment hydrated after the root marked <html data-hydrated>. Like the dev gallery Section,
 * anything disabled until hydration marks itself `data-hydrating`, which the E2E guard waits out.
 */
describe("[P0-15] /me/security controls mark themselves data-hydrating until hydrated (E2E axe guard)", () => {
  it("[P0-15] the server HTML (before hydration) carries the marker on the device list and the sign-out button", () => {
    const html = renderToString(
      <>
        <DeviceList devices={DEVICES} signInPath="/sign-in" />
        <SignOutButton to="/sign-in" />
      </>,
    );
    expect(html.match(/data-hydrating=""/g)).toHaveLength(2);
  });

  it("[P0-15] once hydrated neither carries it", () => {
    render(
      <>
        <DeviceList devices={DEVICES} signInPath="/sign-in" />
        <SignOutButton to="/sign-in" />
      </>,
    );
    expect(screen.getByRole("region", { name: "Signed-in devices" })).not.toHaveAttribute(
      "data-hydrating",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).not.toHaveAttribute("data-hydrating");
    expect(document.querySelector("[data-hydrating]")).toBeNull();
  });
});
