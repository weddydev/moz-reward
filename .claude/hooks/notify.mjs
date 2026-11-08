#!/usr/bin/env node
// Plays a short sound (and a desktop banner on macOS) for Claude Code events.
// Usage (from hooks): node .claude/hooks/notify.mjs <attention|done|decision>
// Usage (by Claude):  node .claude/hooks/notify.mjs task "P0 task 8 done" < /dev/null   (soft, keeps working)
//                     node .claude/hooks/notify.mjs review "Stopped for review" < /dev/null (louder two-tone, Claude stopped)
// Disable: set env CLAUDE_SOUNDS=off
import { spawn } from "node:child_process";
import { platform } from "node:os";

const event = process.argv[2] || "done";
const argMessage = process.argv[3];
if ((process.env.CLAUDE_SOUNDS || "").toLowerCase() === "off") process.exit(0);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", run);
setTimeout(run, 300); // in case stdin never closes

let ran = false;
function run() {
  if (ran) return;
  ran = true;
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}

  // "decision" only fires when Claude edits the decisions log
  if (event === "decision") {
    const p = data?.tool_input?.file_path || data?.tool_input?.path || "";
    if (!/DECISIONS\.md$/i.test(p)) process.exit(0);
  }

  const titles = {
    attention: "Claude needs you",
    done: "Claude finished",
    decision: "Claude logged a decision",
    task: "Task complete — continuing",
    review: "Stopped — ready for your review",
  };
  const message = (argMessage || data.message || titles[event] || "Claude Code").slice(0, 120);

  const os = platform();
  const quiet = { stdio: "ignore", detached: true };
  try {
    if (os === "darwin") {
      const sounds = { attention: "Glass", done: "Hero", decision: "Pop", task: "Tink" };
      if (event === "review") {
        // Two-tone, a bit louder than the others: noticeable at your desk, not across the office.
        const play = (name) => `afplay -v 1.5 /System/Library/Sounds/${name}.aiff`;
        spawn("sh", ["-c", `${play("Glass")}; ${play("Hero")}`], quiet).unref();
      } else {
        const volume = event === "task" ? "0.8" : "1";
        spawn("afplay", ["-v", volume, `/System/Library/Sounds/${sounds[event] || "Pop"}.aiff`], quiet).unref();
      }
      const safe = message.replace(/["\\]/g, "");
      spawn("osascript", ["-e", `display notification "${safe}" with title "Moz Rewards · ${titles[event] || "Claude"}"`], quiet).unref();
    } else if (os === "win32") {
      const sounds = { attention: "Exclamation", done: "Asterisk", decision: "Beep", task: "Asterisk", review: "Exclamation" };
      const s = `[System.Media.SystemSounds]::${sounds[event] || "Beep"}.Play(); Start-Sleep -Milliseconds 600`;
      spawn("powershell", ["-NoProfile", "-Command", event === "review" ? `${s}; ${s}` : s], quiet).unref();
    } else {
      const sounds = {
        attention: "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
        done: "/usr/share/sounds/freedesktop/stereo/complete.oga",
        decision: "/usr/share/sounds/freedesktop/stereo/message.oga",
        task: "/usr/share/sounds/freedesktop/stereo/message.oga",
        review: "/usr/share/sounds/freedesktop/stereo/complete.oga",
      };
      const f = sounds[event] || sounds.done;
      spawn("sh", ["-c", event === "review" ? `paplay ${f}; paplay ${f}` : `paplay ${f}`], quiet).unref();
    }
  } catch {
    process.stdout.write("\x07"); // terminal bell fallback
  }
  process.exit(0);
}
