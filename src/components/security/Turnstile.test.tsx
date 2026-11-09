// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_BYPASS_TOKEN, TURNSTILE_FIELD } from "@/lib/turnstile";
import { Turnstile, type TurnstileApi } from "./Turnstile";

const field = (c: HTMLElement): HTMLInputElement | null =>
  c.querySelector<HTMLInputElement>(`input[name="${TURNSTILE_FIELD}"]`);

afterEach(() => {
  delete (window as { turnstile?: TurnstileApi }).turnstile;
});

describe("[P0-05] Turnstile widget", () => {
  it("without a site key (local/test): no Cloudflare script, the form carries the bypass token", () => {
    const onToken = vi.fn();
    const { container } = render(<Turnstile siteKey={undefined} onToken={onToken} />);
    expect(field(container)?.value).toBe(TURNSTILE_BYPASS_TOKEN);
    expect(onToken).toHaveBeenCalledWith(TURNSTILE_BYPASS_TOKEN);
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });

  it("with a site key: renders the widget, puts the token in the form, clears it on expiry, removes on unmount", () => {
    const callbacks: { callback?: (t: string) => void; expired?: () => void } = {};
    const api: TurnstileApi = {
      render: vi.fn<TurnstileApi["render"]>((_el, opts) => {
        callbacks.callback = opts.callback;
        callbacks.expired = opts["expired-callback"];
        return "widget-1";
      }),
      remove: vi.fn(),
    };
    (window as { turnstile?: TurnstileApi }).turnstile = api;
    const onToken = vi.fn();
    const { container, unmount } = render(
      <Turnstile siteKey="0x4AAAAAAA-site" action="magic-link" onToken={onToken} />,
    );
    expect(api.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: "0x4AAAAAAA-site", action: "magic-link" }),
    );
    expect(field(container)?.value).toBe("");

    act(() => callbacks.callback?.("tok-1"));
    expect(field(container)?.value).toBe("tok-1");
    expect(onToken).toHaveBeenLastCalledWith("tok-1");

    act(() => callbacks.expired?.());
    expect(field(container)?.value).toBe("");
    expect(onToken).toHaveBeenLastCalledWith("");

    unmount();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });
});
