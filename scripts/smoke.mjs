#!/usr/bin/env node
/**
 * End-to-end smoke test against the deployed app.
 *
 *   node scripts/smoke.mjs                       # app-level checks only, no quota spent
 *   node scripts/smoke.mjs --inference           # also asks the model one short question
 *   BASE_URL=… node scripts/smoke.mjs            # a different deployment
 *   CHROME_BIN=/path/to/chrome node scripts/smoke.mjs
 *
 * Run this right before recording: it answers "is the live site actually working?" rather
 * than "did the deploy succeed?", which are different questions.
 *
 * Exit code is non-zero only for app-level failures. A quota failure from the inference
 * probe is reported clearly but does not fail the run — it is an environment problem, and
 * pretending otherwise would make this script untrustworthy.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "https://hackthon-dcdf7.web.app";
const WITH_INFERENCE = process.argv.includes("--inference");
const SECTIONS = [
  { name: "Ask", expect: "Nothing asked yet" },
  { name: "Quiz", expect: "STUDY NOTES" },
  { name: "History", expect: "CHATS" },
  { name: "Settings", expect: "SELF-CHECK" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail, fatal = true) => results.push({ name, ok, detail, fatal });

function chromeCandidates() {
  return [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    join(process.env.HOME ?? "", ".local/opt/google-chrome/chrome"),
  ].filter(Boolean);
}

async function launch(port) {
  const profile = mkdtempSync(join(tmpdir(), "sahayogi-smoke-"));
  for (const bin of chromeCandidates()) {
    const child = spawn(
      bin,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${port}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) return { child, profile };
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
  const target = targets.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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

const port = 9500 + Math.floor(Math.random() * 300);
let browser;

try {
  browser = await launch(port);
  const { send, evaluate } = await connect(port);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: BASE });
  await sleep(8000);

  const shell = await evaluate(`({
    brand: /Sahayogi/.test(document.body.innerText || ""),
    title: document.title,
    nav: document.querySelectorAll('nav[aria-label="Sections"] button').length,
  })`);
  record("shell renders", !!shell?.brand && shell.nav >= 4, `title "${shell?.title ?? "?"}", ${shell?.nav ?? 0} nav buttons`);

  for (const section of SECTIONS) {
    await evaluate(`[...document.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(section.name)})?.click()`);
    await sleep(2500);
    const text = (await evaluate(`document.body.innerText`)) ?? "";
    const heading = await evaluate(`document.querySelector('h1')?.innerText ?? ""`);
    const ok = text.includes(section.expect) && heading.startsWith(section.name);
    record(`${section.name} renders`, ok, ok ? `heading "${heading.slice(0, 40)}"` : `expected "${section.expect}" and an "${section.name} —" heading`);
  }

  // self-check: the app proving its own wiring
  await evaluate(`[...document.querySelectorAll('button')].find((b) => /Run self-check/.test(b.innerText))?.click()`);
  await sleep(9000);
  const rows = (await evaluate(`document.querySelector('ul')?.innerText ?? ""`)) ?? "";
  const passed = (rows.match(/^pass$/gm) || []).length;
  const failed = (rows.match(/^fail$/gm) || []).length;
  record("in-app self-check", failed === 0 && passed >= 5, `${passed} pass, ${failed} fail`);

  if (WITH_INFERENCE) {
    await evaluate(`[...document.querySelectorAll('button')].find((b) => /Test one answer/.test(b.innerText))?.click()`);
    for (let i = 0; i < 40; i += 1) {
      if (!(await evaluate(`/Asking the model/.test(document.body.innerText)`))) break;
      await sleep(2000);
    }
    const probe = (await evaluate(`(document.body.innerText.match(/One real answer[\\s\\S]{0,160}/) || [""])[0]`)) ?? "";
    const answered = /in_cloud|on_device/.test(probe);
    const quota = /QUOTA_EXCEEDED|exceeded your current quota/i.test(probe);
    // A quota failure is not the app's fault, so it must not read as PASS and must not
    // fail the run — but it absolutely must be visible before a recording session.
    record(
      "one real answer",
      answered,
      quota
        ? `quota exhausted (environment, not the app): ${probe.replace(/\s+/g, " ").slice(0, 110)}`
        : probe.replace(/\s+/g, " ").slice(0, 140),
      !quota,
    );
    if (quota) console.warn("\n! quota is exhausted right now — wait for the free-tier window or enable billing before recording");
  }
} catch (error) {
  record("smoke test could not run", false, error.message);
} finally {
  if (browser) {
    browser.child.kill();
    await sleep(600);
    try {
      rmSync(browser.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* a leftover temp profile is not worth failing on */
    }
  }
}

console.log("");
for (const result of results) {
  const tag = result.ok ? "PASS" : result.fatal ? "FAIL" : "WARN";
  console.log(`${tag}  ${result.name.padEnd(22)} ${result.detail}`);
}

const failed = results.filter((r) => !r.ok && r.fatal).length;
console.log(failed ? `\n${failed} app-level failure(s) — do not record yet` : "\nthe live app is behaving");
process.exit(failed ? 1 : 0);
