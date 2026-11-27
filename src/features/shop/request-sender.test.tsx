// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUEUE_KEY, readQueue } from "./request-queue";

const action = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({ requestPointsAction: action }));
vi.mock("@/components/ui/Toast", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const USER = "user-1";
const SHOP = "shop-1";
const ok = { ok: true, data: { outcome: "created" } };

let online = true;

function queueOne(): void {
  localStorage.setItem(
    QUEUE_KEY,
    JSON.stringify([{ userId: USER, shopId: SHOP, key: "k1", at: new Date().toISOString() }]),
  );
}
const left = (): number => readQueue(localStorage, USER, new Date()).length;
const settle = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  localStorage.clear();
  action.mockReset();
  toast.mockClear();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("[demo-fixes] the saved request is sent once the phone is back online (human, 27 Nov: stuck on 'offline')", () => {
  it("[demo-fixes] the first send after `online` fails (the line isn't really back yet): it retries by itself", async () => {
    const { QueuedRequestSender, REQUEST_RETRY_MS } = await import("./RequestPoints");
    online = false;
    queueOne();
    render(<QueuedRequestSender userId={USER} />);
    await settle();
    expect(action).not.toHaveBeenCalled();
    online = true;
    action.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(ok);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(action).toHaveBeenCalledTimes(1);
    expect(left(), "kept after a failed send").toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(REQUEST_RETRY_MS[0]);
    });
    await settle();
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1]?.[0]).toMatchObject({ idempotencyKey: "k1" });
    expect(left()).toBe(0);
    expect(toast).toHaveBeenCalledWith("Your saved request was sent.", "success");
  });

  it("[demo-fixes] the `online` event was missed (the phone was in Settings): coming back to the page sends it", async () => {
    const { QueuedRequestSender } = await import("./RequestPoints");
    online = false;
    queueOne();
    render(<QueuedRequestSender userId={USER} />);
    await settle();
    online = true; // no `online` event reaches the page
    action.mockResolvedValue(ok);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(action).toHaveBeenCalledTimes(1);
    expect(left()).toBe(0);
  });

  it("[demo-fixes] still offline: no send and no retry timer until the phone is back", async () => {
    const { QueuedRequestSender, REQUEST_RETRY_MS } = await import("./RequestPoints");
    online = false;
    queueOne();
    render(<QueuedRequestSender userId={USER} />);
    await act(async () => {
      vi.advanceTimersByTime(REQUEST_RETRY_MS.at(-1) ?? 0);
    });
    await settle();
    expect(action).not.toHaveBeenCalled();
    expect(left()).toBe(1);
  });
});

describe("[demo-fixes] the queued card says what is happening", () => {
  it("[demo-fixes] offline: 'You're offline'; back online: 'Sending' and a Send now button that sends at once", async () => {
    const { QueuedRequestSender, RequestPoints, REQUEST_QUEUED_TEXT, REQUEST_SENDING_TEXT } =
      await import("./RequestPoints");
    online = false;
    queueOne();
    render(
      <>
        <QueuedRequestSender userId={USER} />
        <RequestPoints shopId={SHOP} shopName="Brew & Bloom" open={null} userId={USER} />
      </>,
    );
    await settle();
    expect(screen.getByTestId("request-queued")).toHaveTextContent(REQUEST_QUEUED_TEXT);
    // Back online, but the first send fails: the card no longer says "offline".
    action.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(ok);
    online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(screen.getByTestId("request-queued")).toHaveTextContent(REQUEST_SENDING_TEXT);
    expect(screen.getByTestId("request-queued")).not.toHaveTextContent("offline");
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    await settle();
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("request-queued")).toBeNull();
  });
});
