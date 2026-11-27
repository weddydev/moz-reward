// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { focusNewPage } from "./RouteContent";

describe("[P1-18] focus after a client navigation (P1-B close QA L4)", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<nav><a id="dock" href="/offers">Offers</a></nav>' +
      '<div data-route-content><h1 id="title">Brew &amp; Bloom</h1><a href="#">Join</a></div>';
  });
  const content = (): HTMLElement => document.querySelector<HTMLElement>("[data-route-content]")!;

  it("[P1-18] focus lost with the old page goes to the new page's heading, focusable from script only", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    focusNewPage(content());
    const title = document.getElementById("title");
    expect(document.activeElement).toBe(title);
    expect(title?.getAttribute("tabindex")).toBe("-1");
  });

  it("[P1-18] focus still on the page (the dock link that was pressed) stays where it is", () => {
    const dock = document.getElementById("dock")!;
    dock.focus();
    focusNewPage(content());
    expect(document.activeElement).toBe(dock);
    expect(document.getElementById("title")?.hasAttribute("tabindex")).toBe(false);
  });

  it("[P1-18] a page streamed in after its skeleton: the heading gets focus when it arrives, if focus is still lost", async () => {
    content().innerHTML = "<p>Loading…</p>";
    const stop = focusNewPage(content());
    expect(document.activeElement).toBe(document.body);
    content().innerHTML = '<h1 id="late">Brew &amp; Bloom</h1>';
    await Promise.resolve(); // MutationObserver callbacks run as a microtask
    expect(document.activeElement).toBe(document.getElementById("late"));
    stop();
  });

  it("[P1-18] a heading that arrives after the user moved focus, or after the next navigation, takes nothing", async () => {
    content().innerHTML = "<p>Loading…</p>";
    focusNewPage(content());
    const dock = document.getElementById("dock")!;
    dock.focus();
    content().innerHTML = "<h1>Brew &amp; Bloom</h1>";
    await Promise.resolve();
    expect(document.activeElement).toBe(dock);

    dock.blur();
    content().innerHTML = "<p>Loading…</p>";
    const stop = focusNewPage(content());
    stop(); // the next navigation
    content().innerHTML = "<h1>Brew &amp; Bloom</h1>";
    await Promise.resolve();
    expect(document.activeElement).toBe(document.body);
  });
});
