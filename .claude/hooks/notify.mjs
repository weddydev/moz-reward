#!/usr/bin/env node
// Plays a short sound (and a desktop banner on macOS) for Claude Code events.
// Usage (from hooks): node .claude/hooks/notify.mjs <attention|done|decision>
// Disable: set env CLAUDE_SOUNDS=off
import { spawn } from "node:child_process";
import { platform } from "node:os";

const event = process.argv[2] || "done";
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
  };
  const message = (data.message || titles[event] || "Claude Code").slice(0, 120);

  const os = platform();
  const quiet = { stdio: "ignore", detached: true };
  try {
    if (os === "darwin") {
      const sounds = { attention: "Glass", done: "Hero", decision: "Pop" };
      spawn("afplay", [`/System/Library/Sounds/${sounds[event] || "Pop"}.aiff`], quiet).unref();
      const safe = message.replace(/["\\]/g, "");
      spawn("osascript", ["-e", `display notification "${safe}" with title "Moz Rewards · ${titles[event] || "Claude"}"`], quiet).unref();
    } else if (os === "win32") {
      const sounds = { attention: "Exclamation", done: "Asterisk", decision: "Beep" };
      spawn("powershell", ["-NoProfile", "-Command", `[System.Media.SystemSounds]::${sounds[event] || "Beep"}.Play(); Start-Sleep -Milliseconds 600`], quiet).unref();
    } else {
      const sounds = {
        attention: "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
        done: "/usr/share/sounds/freedesktop/stereo/complete.oga",
        decision: "/usr/share/sounds/freedesktop/stereo/message.oga",
      };
      spawn("paplay", [sounds[event] || sounds.done], quiet).unref();
    }
  } catch {
    process.stdout.write("\x07"); // terminal bell fallback
  }
  process.exit(0);
}
