/**
 * Fill {{TOKEN}} placeholders in the kit templates from site-legal.config.json
 * and write the ready files into the project.
 *
 * Usage:  node scripts/fill-templates.mjs <kit-templates-dir> [--routes-dir src/routes] [--components-dir src/components]
 *
 * Conditional blocks: lines between {{#flagName}} and {{/flagName}} are kept
 * only when config.flags.flagName is true ({{#!flagName}} inverts — kept when
 * false). Markers must sit on their own lines and cannot nest.
 *
 * Fails loudly (non-zero exit) if:
 *   - a template token in KEPT content has no value in config.placeholders
 *   - a config.placeholders key is never used by any template (typo guard;
 *     tokens inside disabled blocks still count as "used")
 *   - a block marker references a flag missing from config.flags, or blocks
 *     are unbalanced/nested
 *   - any {{TOKEN}} or block marker survives in the output
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const templatesDir = args[0];
if (!templatesDir || !existsSync(templatesDir)) {
  console.error("Usage: node scripts/fill-templates.mjs <kit-templates-dir> [--routes-dir d] [--components-dir d]");
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : dflt;
};
const routesDir = opt("--routes-dir", "src/routes");
const componentsDir = opt("--components-dir", "src/components");

const cfg = JSON.parse(readFileSync("site-legal.config.json", "utf8"));
const values = cfg.placeholders ?? {};
const flags = cfg.flags ?? {};

// Values are substituted into JS string literals and JSX attributes — an ASCII
// double quote, backslash, or newline would produce broken code. Hebrew names
// like בע"מ must use the typographic gershayim ״ instead of ".
for (const [key, val] of Object.entries(values)) {
  if (/["\\\n\r]/.test(String(val))) {
    console.error(
      `config.placeholders.${key} contains a forbidden character (\" \\ or newline). ` +
        `Use the Hebrew gershayim ״ instead of an ASCII quote (e.g. בע״מ, not בע"מ).`,
    );
    process.exit(1);
  }
}

// Keep or drop {{#flag}}…{{/flag}} blocks according to config.flags.
function applyBlocks(text, src) {
  const out = [];
  let open = null; // { name, keep }
  for (const line of text.split("\n")) {
    const start = line.match(/^\s*\{\{#(!?)([A-Za-z_]+)\}\}\s*$/);
    const end = line.match(/^\s*\{\{\/(!?)([A-Za-z_]+)\}\}\s*$/);
    if (start) {
      const [, neg, name] = start;
      if (open) throw new Error(`[${src}] nested block {{#${neg}${name}}} inside {{#${open.marker}}} — blocks cannot nest`);
      if (!(name in flags))
        throw new Error(`[${src}] block flag "${name}" is missing from config.flags — add "flags": { "${name}": true|false } to site-legal.config.json`);
      open = { marker: `${neg}${name}`, keep: neg ? !flags[name] : !!flags[name] };
      continue;
    }
    if (end) {
      const marker = `${end[1]}${end[2]}`;
      if (!open || open.marker !== marker) throw new Error(`[${src}] unbalanced block marker {{/${marker}}}`);
      open = null;
      continue;
    }
    if (/\{\{[#/]/.test(line)) throw new Error(`[${src}] block markers must sit alone on their own line: "${line.trim()}"`);
    if (!open || open.keep) out.push(line);
  }
  if (open) throw new Error(`[${src}] block {{#${open.marker}}} is never closed`);
  return out.join("\n");
}

const plan = [
  { src: "accessibility.tsx.template", dest: join(routesDir, "accessibility.tsx") },
  { src: "privacy.tsx.template", dest: join(routesDir, "privacy.tsx") },
  { src: "terms.tsx.template", dest: join(routesDir, "terms.tsx") },
  { src: "LegalPageLayout.tsx.template", dest: join(componentsDir, "LegalPageLayout.tsx") },
  { src: "AnalyticsNotice.tsx", dest: join(componentsDir, "AnalyticsNotice.tsx") },
];

const usedTokens = new Set(); // tokens anywhere in a template, incl. disabled blocks
let failed = false;

for (const { src, dest } of plan) {
  const srcPath = join(templatesDir, src);
  if (!existsSync(srcPath)) {
    console.error(`missing template: ${srcPath}`);
    failed = true;
    continue;
  }
  let text = readFileSync(srcPath, "utf8");
  for (const m of text.matchAll(/\{\{([A-Z_]+)\}\}/g)) usedTokens.add(m[1]);
  try {
    text = applyBlocks(text, src);
  } catch (err) {
    console.error(err.message);
    failed = true;
    continue;
  }
  text = text.replace(/\{\{([A-Z_]+)\}\}/g, (m, token) => {
    if (!(token in values)) {
      console.error(`[${src}] no value for {{${token}}} in site-legal.config.json placeholders`);
      failed = true;
      return m;
    }
    return values[token];
  });
  if (/\{\{[A-Z_]+\}\}/.test(text)) failed = true;
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, text);
  console.log(`wrote ${dest}`);
}

for (const key of Object.keys(values)) {
  if (!usedTokens.has(key)) {
    console.error(`config.placeholders.${key} is never used by any template (typo?)`);
    failed = true;
  }
}

if (failed) {
  console.error("\nFILL FAILED — fix the issues above before shipping.");
  process.exit(1);
}
console.log("\nAll templates filled cleanly.");
