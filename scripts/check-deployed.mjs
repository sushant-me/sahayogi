/**
 * Post-deploy check: is the build we just made the build that is actually being served?
 *
 * `firebase deploy` reporting "Deploy complete!" proves the upload finished, not that the URL
 * serves that upload. Hosting can keep serving a previous release (a cached edge, a release that
 * was not activated, or — the case that caught this project out — a shell pipeline that swallowed
 * the deploy's failure entirely).
 *
 * So compare a content-addressed fact: the hashed entry bundle referenced by the served HTML must
 * be the one in dist/index.html. Hashes change on every build, so this cannot false-pass.
 */
import { readFileSync } from "node:fs";

const URL_TO_CHECK = process.env.DEPLOY_URL ?? "https://hackthon-dcdf7.web.app/";
const ENTRY_PATTERN = /assets\/index-[A-Za-z0-9_-]+\.js/;

function entryFrom(html) {
  const match = html.match(ENTRY_PATTERN);
  return match ? match[0] : null;
}

const localHtml = readFileSync("dist/index.html", "utf8");
const expected = entryFrom(localHtml);
if (!expected) {
  console.error("check-deployed: dist/index.html has no hashed entry bundle — run a build first.");
  process.exit(1);
}

const response = await fetch(URL_TO_CHECK, {
  // bypass any intermediary cache: this asks what the origin serves right now
  headers: { "cache-control": "no-cache" },
});
if (!response.ok) {
  console.error(`check-deployed: ${URL_TO_CHECK} returned ${response.status}.`);
  process.exit(1);
}

const served = entryFrom(await response.text());
if (served !== expected) {
  console.error(
    [
      "check-deployed: the deployment is STALE.",
      `  built:  ${expected}`,
      `  served: ${served ?? "(no hashed entry found)"}`,
      "  The URL is not serving this build. Re-run the deploy and check its exit code.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`check-deployed: ok — ${URL_TO_CHECK} serves ${expected}`);
