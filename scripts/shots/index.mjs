// Writes docs/screenshots/index.md from PLAN.json and the files on disk.
// Only files that exist are listed - the index is the checklist the READMEs
// and the site read, so it must never promise an image that is not there.
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n) => process.argv[process.argv.indexOf(`--${n}`) + 1];
const plan = JSON.parse(readFileSync(arg("plan"), "utf8"));
const out = arg("out");
// Widest first: the desktop shot is the one a reader wants.
const labels = Object.keys(plan.viewports).sort((a, b) => Number(b) - Number(a));

const kb = (f) => `${Math.round(statSync(f).size / 1024)} kB`;
const rows = [];
const missing = [];
let bytes = 0;

for (const s of plan.screens) {
  const files = labels.map((l) => ({ label: l, name: `${s.name}@${l}.png` }));
  const present = files.filter((f) => existsSync(join(out, f.name)));
  for (const f of present) {
    bytes += statSync(join(out, f.name)).size;
  }
  missing.push(...files.filter((f) => !present.includes(f)).map((f) => f.name));
  if (present.length) {
    rows.push(
      `| \`${s.name}\` | ${s.caption} | ${present.map((f) => `[${f.label}](${f.name}) <sub>${kb(join(out, f.name))}</sub>`).join("<br>")} |`,
    );
  }
}

writeFileSync(
  join(out, "index.md"),
  `# WarpHold screenshots

Every screen at 1440 px and 412 px, captured over seeded demo data by
\`scripts/screenshots.sh\`. Regenerate rather than edit: see [README.md](README.md).
No real host, address, account or device name appears in any of them.

Total: ${rows.length} screens, ${Math.round(bytes / 1024)} kB.

| Screen | What it shows | Sizes |
| --- | --- | --- |
${rows.join("\n")}
${missing.length ? `\n> Not captured in the last run: ${missing.map((m) => `\`${m}\``).join(", ")}.\n` : ""}`,
);
console.log(`index: ${rows.length} screens, ${missing.length} missing`);
