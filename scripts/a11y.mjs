#!/usr/bin/env node
/**
 * Structural accessibility audit for the deployed app.
 *
 *   node scripts/a11y.mjs https://hackthon-dcdf7.web.app
 *   CHROME_BIN=/path/to/chrome node scripts/a11y.mjs <url>
 *
 * Visits every section at desktop and phone width and checks the things that are easy to
 * regress and cheap to verify: one h1 per page, landmarks, labelled controls, duplicate
 * ids, image alts, and horizontal overflow. Exits non-zero when something the app owns is
 * wrong.
 *
 * Note on `g-recaptcha-response`: Google's reCAPTCHA script injects a hidden textarea on
 * every page (App Check uses it). It is third-party and not ours, so it is reported as
 * expected rather than counted as a failure.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "https://hackthon-dcdf7.web.app";
const SECTIONS = ["Ask", "Quiz", "History", "Settings"];
const WIDTHS = [1440, 390];

function chromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    join(process.env.HOME ?? "", ".local/opt/google-chrome/chrome"),
  ].filter(Boolean);
  return candidates;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(port) {
  const profile = mkdtempSync(join(tmpdir(), "sahayogi-a11y-"));
  for (const bin of chromeBinary()) {
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
  throw new Error("could not start a Chrome/Chromium binary (set CHROME_BIN)");
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
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    }
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  return { send, evaluate: async (expression) => (await send("Runtime.evaluate", { returnByValue: true, expression })).result.value };
}

const AUDIT = `(() => {
  const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").trim();
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
  const fields = [...document.querySelectorAll("input, textarea, select")];
  const unlabeledFields = fields
    .filter((f) => {
      if (f.getAttribute("aria-label")) return false;
      if (f.id && document.querySelector('label[for="' + f.id + '"]')) return false;
      return !f.closest("label") && f.id !== "g-recaptcha-response" && !f.className.includes("g-recaptcha");
    })
    .map((f) => f.id || f.tagName.toLowerCase());
  // Controls that are laid out past the viewport edge cannot be tapped. Document-level
  // overflow checks miss this: a card with overflow:hidden clips its children silently.
  const clipped = [...document.querySelectorAll('button, a[href], input, textarea, select')]
    .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 28), right: Math.round(r.right), left: Math.round(r.left) };
    })
    .filter((c) => c.right > window.innerWidth + 1 || c.left < -1);

  return {
    clipped,
    h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()).filter(Boolean),
    hasMain: !!document.querySelector("main"),
    hasLabelledNav: !!document.querySelector("nav[aria-label]"),
    unlabeledButtons: [...document.querySelectorAll("button")].filter((b) => !name(b)).length,
    emptyLinks: [...document.querySelectorAll("a[href]")].filter((a) => !name(a)).length,
    duplicateIds: [...new Set(ids.filter((value, index) => ids.indexOf(value) !== index))],
    imagesWithoutAlt: [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).length,
    unlabeledFields,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    lang: document.documentElement.getAttribute("lang"),
    title: document.title,
  };
})()`;

const port = 9400 + Math.floor(Math.random() * 300);
let browser;
let failures = 0;

try {
  browser = await launch(port);
  const { send, evaluate } = await connect(port);
  await send("Runtime.enable");
  await send("Page.enable");

  for (const width of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    console.log(`\n${width}px`);
    for (const section of SECTIONS) {
      await send("Page.navigate", { url });
      await sleep(4500);
      await evaluate(`[...document.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(section)})?.click()`);
      await sleep(2000);

      // Audit an *interacted* state, not just first paint: controls that only appear once the
      // user acts (the route preview, the enabled generators) were never covered before.
      if (section === "Ask") {
        await evaluate(`(() => {
          const ta = document.querySelector("textarea");
          if (!ta) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          setter.call(ta, "Explain Ohm's law in one sentence.");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        })()`);
      }
      if (section === "Quiz") {
        await evaluate(`(() => {
          const sample = [...document.querySelectorAll("button")].find((b) => /use a sample/i.test(b.textContent || ""));
          sample?.click();
        })()`);
      }
      if (section === "Ask" || section === "Quiz") await sleep(900);

      // A self-validating audit: prove the interaction changed the page, otherwise the extra
      // state was never audited and this run would be reassuring for no reason.
      let interactionProblem = null;
      if (section === "Ask") {
        const shown = await evaluate(`/PREDICTED/.test(document.body.innerText)`);
        if (!shown) interactionProblem = "typing did not reveal the route preview";
      }
      if (section === "Quiz") {
        const filled = await evaluate(`(document.querySelector("textarea")?.value || "").length > 50`);
        if (!filled) interactionProblem = "the sample button did not fill the notes";
      }
      let result = await evaluate(AUDIT);
      if (!result || result.h1.length !== 1) {
        // one retry: sections are judged on a slow connection too, and a single missed
        // render is a timing artefact, not an accessibility defect
        await sleep(2500);
        result = await evaluate(AUDIT);
      }
      const problems = [
        ...(result.clipped.length
          ? [`${result.clipped.length} control(s) outside the viewport: ${result.clipped.map((c) => c.label).join(', ')}`]
          : []),
        result.h1.length === 1 ? null : `h1 count ${result.h1.length}`,
        result.hasMain ? null : "no <main>",
        result.hasLabelledNav ? null : "nav not labelled",
        result.unlabeledButtons ? `${result.unlabeledButtons} unlabelled button(s)` : null,
        result.emptyLinks ? `${result.emptyLinks} empty link(s)` : null,
        result.duplicateIds.length ? `duplicate ids: ${result.duplicateIds.join(", ")}` : null,
        result.imagesWithoutAlt ? `${result.imagesWithoutAlt} image(s) without alt` : null,
        result.unlabeledFields.length ? `unlabelled fields: ${result.unlabeledFields.join(", ")}` : null,
        result.overflow > 0 ? `horizontal overflow ${result.overflow}px` : null,
        result.lang ? null : "no <html lang>",
        interactionProblem,
      ].filter(Boolean);
      const titleOk = result.title.startsWith(section);
      if (!titleOk) problems.push(`title is "${result.title}"`);
      if (problems.length) failures += 1;
      console.log(`  ${section.padEnd(9)} ${problems.length ? "FAIL  " + problems.join(" · ") : "ok"}`);
    }
  }
  // Reduced motion is a preference, not a suggestion: under it, transitions must be gone.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.navigate", { url });
  await sleep(5000);
  const motion = await evaluate(`(() => {
    const el = document.querySelector("button") || document.body;
    const style = getComputedStyle(el);
    return parseFloat(style.transitionDuration) + parseFloat(style.animationDuration);
  })()`);
  const reducedOk = typeof motion === "number" && motion < 0.05;
  if (!reducedOk) failures += 1;
  console.log(`\nprefers-reduced-motion  ${reducedOk ? "ok" : `FAIL  transitions still animate (${motion}s)`}`);
} catch (error) {
  console.error("audit failed:", error.message);
  failures += 1;
} finally {
  if (browser) {
    browser.child.kill();
    // Chrome keeps writing to its profile for a moment after SIGTERM; wait, then clean up
    // without letting a filesystem hiccup mask the audit result.
    await sleep(600);
    try {
      rmSync(browser.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* a leftover temp profile is not worth failing the audit over */
    }
  }
}

console.log(failures ? `\n${failures} page(s) with issues` : "\nall pages clean");
process.exit(failures ? 1 : 0);
