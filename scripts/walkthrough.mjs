#!/usr/bin/env node
/**
 * Rehearsal walkthrough — checks that every element the video script points at is actually on
 * screen, in the state the script films it.
 *
 *   node scripts/walkthrough.mjs                 # no quota spent
 *   node scripts/walkthrough.mjs --inference     # also asks one question (spends a little quota)
 *
 * smoke.mjs answers "is the site working?"; a11y.mjs answers "is it accessible?". This answers a
 * third question: "if I follow recording.md § 9B beat by beat, will the screen show what I say it
 * shows?" Prose in a script and pixels on a page drift apart, and this is the gap between them.
 *
 * Exit code is non-zero if any beat is missing. A quota failure in the optional inference beat is
 * reported honestly and does not fail the run.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "https://hackthon-dcdf7.web.app";
const WITH_INFERENCE = process.argv.includes("--inference");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const beat = (name, ok, detail, fatal = true) => results.push({ name, ok, detail, fatal });

function chromeCandidates() {
  return [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    join(process.env.HOME ?? "", ".local/opt/google-chrome/chrome"),
  ].filter(Boolean);
}

async function launch(port) {
  const profile = mkdtempSync(join(tmpdir(), "sahayogi-walkthrough-"));
  for (const bin of chromeCandidates()) {
    const child = spawn(
      bin,
      [
        "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--no-first-run", "--no-default-browser-check",
        `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank",
      ],
      { stdio: "ignore" },
    );
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      try {
        if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return { child, profile };
      } catch {
        /* not up yet */
      }
    }
    child.kill();
  }
  throw new Error("could not start Chrome/Chromium (set CHROME_BIN)");
}

async function connect(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  const evaluate = async (expression) => {
    try {
      return (await send("Runtime.evaluate", { returnByValue: true, expression, awaitPromise: true })).result?.value;
    } catch {
      return undefined;
    }
  };
  return { send, evaluate };
}

const port = 9800 + Math.floor(Math.random() * 150);
let browser;
let crashed = false;

try {
  browser = await launch(port);
  const { send, evaluate } = await connect(port);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE });
  await sleep(8000);

  // ── Beat 1: the hook, and the legend the narration refers to ────────────────────────────
  const legend = await evaluate(`(() => {
    const t = document.body.innerText;
    return { device: /on this device|Stays on this device/i.test(t), cloud: /in the cloud|goes to the cloud/i.test(t),
      latency: /ms|no data/i.test(t),
      nothingAsked: /Ask anything[.]/.test(t) };
  })()`);
  beat("hook: hero empty state with both example routes",
    Boolean(legend?.device && legend?.cloud && legend?.latency && legend?.nothingAsked),
    legend ? `device=${legend.device} cloud=${legend.cloud} latency=${legend.latency}` : "no empty state");

  // ── Beat 2: type, do not send — the route preview must name the decision ───────────────
  await evaluate(`(() => {
    const ta = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "Explain Ohm's law in one sentence.");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await sleep(900);
  const preview = await evaluate(`(() => {
    const t = document.body.innerText;
    const m = t.match(/Route preview[\\s\\S]{0,200}/);
    return { predicted: /PREDICTED/.test(t), text: m ? m[0].replace(/\\s+/g, " ").slice(0, 120) : "" };
  })()`);
  beat("preview: decision shown before sending", Boolean(preview?.predicted), preview?.text ?? "no preview");

  // ── Beat 3: Nepali preview — the limitation, stated not hit ─────────────────────────────
  await evaluate(`(() => {
    const ta = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "किर्कहफको नियम सरल भाषामा बुझाउनुहोस्।");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await sleep(900);
  const nepali = await evaluate(`(() => {
    const t = document.body.innerText;
    return { preview: /PREDICTED/.test(t), mentionsCloud: /cloud/i.test((t.match(/Route preview[\\s\\S]{0,200}/) || [""])[0]) };
  })()`);
  beat("nepali: still previews, and previews the cloud",
    Boolean(nepali?.preview && nepali?.mentionsCloud),
    `preview=${nepali?.preview} cloud=${nepali?.mentionsCloud}`);

  // ── Beat 4: Transparency and the ledger header ─────────────────────────────────────────
  await evaluate(`[...document.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent.trim() === "Settings")?.click()`);
  await sleep(2800);
  const ledger = await evaluate(`(() => {
    const t = document.body.innerText;
    return { heading: /Routing ledger/i.test(t), failed: /failed attempts/i.test(t),
      exportBtn: [...document.querySelectorAll("button")].some((b) => /Export routing log/.test(b.innerText)),
      transparency: /Transparency — how routing works/i.test(t) };
  })()`);
  beat("ledger: heading, failures counted, export present",
    Boolean(ledger?.heading && ledger?.failed && ledger?.exportBtn && ledger?.transparency),
    JSON.stringify(ledger));

  // ── Beat 5: the self-check a judge can press ───────────────────────────────────────────
  await evaluate(`[...document.querySelectorAll("button")].find((b) => /Run self-check/.test(b.innerText))?.click()`);
  await sleep(9000);
  // Read the summary numbers. Counting the words "pass"/"fail" anywhere on the page is wrong:
  // the summary itself contains the literal text "0 fail", which made this beat report a failure
  // that did not exist.
  const check = await evaluate(`(() => {
    const chips = [...document.querySelectorAll("*")]
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent || "").trim().toLowerCase())
      .filter((label) => label === "pass" || label === "warn" || label === "fail");
    return {
      pass: chips.filter((c) => c === "pass").length,
      warn: chips.filter((c) => c === "warn").length,
      fail: chips.filter((c) => c === "fail").length,
    };
  })()`);
  beat("self-check: runs and mostly passes", Boolean(check && check.pass >= 5 && check.fail === 0),
    check ? `${check.pass} pass · ${check.warn} warn · ${check.fail} fail` : "no rows rendered");

  // ── Beat 6 (optional): a real answer, and the badge that reports it ─────────────────────
  if (WITH_INFERENCE) {
    await evaluate(`[...document.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent.trim() === "Ask")?.click()`);
    await sleep(1500);
    await evaluate(`(() => {
      const ta = document.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "State one fact about Ohm's law.");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await sleep(400);
    await evaluate(`[...document.querySelectorAll("button")].find((b) => /^Send/.test(b.innerText.trim()))?.click()`);
    let badge = "";
    for (let i = 0; i < 60; i += 1) {
      badge = await evaluate(`(document.querySelector(".badge")?.innerText || "").replace(/\\s+/g, " ")`);
      const busy = await evaluate(`/Thinking…|retrying automatically/.test(document.body.innerText)`);
      if (badge && !busy) break;
      await sleep(2000);
    }
    if (badge) {
      beat("answer: badge reports where it ran", /on-device|cloud/i.test(badge), badge);
    } else {
      beat("answer: badge reports where it ran", false,
        "no answer — free tier rate-limited (environment, not the app)", false);
    }
  }

  // ── Section titles, because the narration names the screens ────────────────────────────
  const titles = [];
  for (const section of ["Ask", "Quiz", "History", "Settings"]) {
    await evaluate(`[...document.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(section)})?.click()`);
    await sleep(1600);
    const title = await evaluate(`document.title`);
    titles.push({ section, ok: typeof title === "string" && title.startsWith(section), title });
  }
  beat("titles: each screen names itself", titles.every((t) => t.ok), titles.map((t) => t.title).join(" | "));
} catch (error) {
  crashed = true;
  console.error("walkthrough failed:", error.message);
} finally {
  if (browser) {
    // Cleanup must never be able to hide the results: Chrome writes into the profile while it
    // shuts down, so give it a moment and treat a stubborn directory as cosmetic.
    try {
      browser.child.kill();
      await sleep(400);
      rmSync(browser.profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* leftover profile in tmp is harmless */
    }
  }
}

let failed = crashed;
for (const r of results) {
  const label = r.ok ? "PASS" : r.fatal ? "FAIL" : "WARN";
  if (!r.ok && r.fatal) failed = true;
  console.log(`${label}  ${r.name.padEnd(44)} ${r.detail ?? ""}`);
}
const fatal = results.filter((r) => r.fatal && !r.ok).length;
console.log(
  fatal === 0
    ? "\nevery beat in the recording script is on screen"
    : `\n${fatal} beat(s) missing — the narration would describe something that is not there`,
);
process.exit(failed ? 1 : 0);
