import { describe, expect, it } from "vitest";
import { deviceLabel } from "./device-label";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

describe("[P0-06] deviceLabel: readable device names for the signed-in devices list", () => {
  it.each([
    [UA.iphoneSafari, "Safari on iPhone"],
    [UA.ipadSafari, "Safari on iPad"],
    [UA.iphoneChrome, "Chrome on iPhone"],
    [UA.androidChrome, "Chrome on Android"],
    [UA.androidSamsung, "Samsung Internet on Android"],
    [UA.windowsEdge, "Edge on Windows"],
    [UA.windowsChrome, "Chrome on Windows"],
    [UA.macSafari, "Safari on Mac"],
    [UA.macFirefox, "Firefox on Mac"],
    [UA.linuxFirefox, "Firefox on Linux"],
    [UA.chromeOs, "Chrome on ChromeOS"],
  ])("%#: %s → %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it("falls back to a neutral name when the browser sent nothing useful", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel("curl/8.5.0")).toBe("Unknown device");
  });

  it("names the platform even when the browser is unknown, and never echoes raw input", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) SomeApp/1.0")).toBe("Browser on Android");
    expect(deviceLabel("<script>alert(1)</script> (Windows NT 10.0)")).toBe("Browser on Windows");
  });
});
