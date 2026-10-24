#!/usr/bin/env node
// Fail if the app's retired name creeps back into the repo.
//
// The app is ScrumMonsters. It was briefly called ScrumQuest, and that name  // legacy-name-ok
// kept resurfacing: planning docs and agents copied it from older docs and
// identifiers. Everything was renamed in one sweep; this check keeps it that way.
//
// A line may keep the old name only if it carries the marker `legacy-name-ok`
// (e.g. the local Postgres role in docker-compose.yml, or the localStorage
// keys the client migrates away from).
//
//   node scripts/ci/check-app-name.mjs           # tracked files in the working tree
//   node scripts/ci/check-app-name.mjs --staged  # what is about to be committed
import { execFileSync } from "node:child_process";

const PATTERN = "scrum[ _-]?quest";
const MARKER = "legacy-name-ok";

const args = ["grep", "-n", "-I", "-i", "-E", PATTERN];
if (process.argv.includes("--staged")) args.splice(1, 0, "--cached");

let output = "";
try {
  output = execFileSync("git", args, { encoding: "utf8" });
} catch (error) {
  // git grep exits 1 when nothing matches.
  if (error.status === 1) process.exit(0);
  throw error;
}

const offenders = output.split("\n").filter((line) => line && !line.includes(MARKER));
if (offenders.length === 0) process.exit(0);

console.error(`Found the retired app name in ${offenders.length} line(s). The app is ScrumMonsters:\n`);
for (const line of offenders) console.error(`  ${line}`);
console.error(
  `\nRename these to ScrumMonsters (scrummonsters / scrum-monsters for identifiers).` +
    `\nIf a line must keep the old name, add a "${MARKER}" comment to it.`,
);
process.exit(1);
