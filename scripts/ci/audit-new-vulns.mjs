#!/usr/bin/env node
// Fail only on vulnerabilities a PR *introduces*.
//
// The full `npm run audit` (audit-ci) fails on every advisory already in the
// tree, so it used to fail every PR regardless of what the PR changed. On PRs
// we instead compare `npm audit --json` reports for the base and head
// lockfiles and fail only on advisories present in head but not in base. The
// full audit still runs nightly (security-audit-nightly.yml).
//
//   node scripts/ci/audit-new-vulns.mjs <base-audit.json> <head-audit.json>
//
// Severity levels and the allowlist come from .audit-ci.json, so both audits
// share one policy.
import { readFileSync, existsSync } from "node:fs";

const [basePath, headPath] = process.argv.slice(2);
if (!basePath || !headPath) {
  console.error("usage: audit-new-vulns.mjs <base-audit.json> <head-audit.json>");
  process.exit(2);
}

const config = existsSync(".audit-ci.json")
  ? JSON.parse(readFileSync(".audit-ci.json", "utf8"))
  : { high: true, critical: true };
const LEVELS = ["low", "moderate", "high", "critical"];
// audit-ci semantics: enabling a level blocks that level and everything above it.
const lowest = LEVELS.findIndex((l) => config[l] === true);
const blocking = new Set(lowest === -1 ? ["high", "critical"] : LEVELS.slice(lowest));
// Entries are either plain ids ("GHSA-...", a package name) or audit-ci records
// ({"GHSA-...": {active, expiry, notes}}). Inactive or expired records don't count.
const today = new Date().toISOString().slice(0, 10);
const allowlist = new Set(
  (config.allowlist ?? []).flatMap((entry) =>
    typeof entry === "object" && entry !== null
      ? Object.entries(entry)
          .filter(([, rec]) => rec?.active !== false && !(rec?.expiry && String(rec.expiry).slice(0, 10) < today))
          .map(([id]) => id)
      : [String(entry)],
  ),
);

// Each blocking advisory, keyed by "<package> <advisory url>".
function advisories(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.error) throw new Error(`${path}: npm audit failed: ${report.error.summary ?? report.error.code}`);
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== "object" || !blocking.has(via.severity)) continue;
      const ghsa = via.url?.split("/").pop() ?? "";
      if (allowlist.has(ghsa) || allowlist.has(String(via.source)) || allowlist.has(via.name)) continue;
      found.set(`${via.name} ${via.url}`, via);
    }
  }
  return found;
}

const base = advisories(basePath);
const head = advisories(headPath);
const added = [...head.entries()].filter(([key]) => !base.has(key));
const fixed = [...base.keys()].filter((key) => !head.has(key)).length;

console.log(`Blocking levels: ${[...blocking].join(", ")}`);
console.log(`Base: ${base.size} blocking advisories. Head: ${head.size}. Fixed by this PR: ${fixed}.`);

if (added.length === 0) {
  console.log("No new vulnerabilities introduced.");
  process.exit(0);
}

console.log(`\n${added.length} new vulnerabilit${added.length === 1 ? "y" : "ies"} introduced by this PR:`);
for (const [, via] of added) {
  console.log(`  ${via.severity.padEnd(8)} ${via.name} ${via.range}  ${via.title}\n           ${via.url}`);
}
console.log("\nUpgrade or replace the package, or add the GHSA id to .audit-ci.json's allowlist with a reason.");
process.exit(1);
