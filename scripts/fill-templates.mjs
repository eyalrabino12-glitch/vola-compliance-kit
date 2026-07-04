/**
 * Fill {{TOKEN}} placeholders in the kit templates from site-legal.config.json
 * and write the ready files into the project.
 *
 * Usage:  node scripts/fill-templates.mjs <kit-templates-dir> [--routes-dir src/routes] [--components-dir src/components]
 *
 * Fails loudly (non-zero exit) if:
 *   - a template token has no value in config.placeholders
 *   - a config.placeholders key is never used by any template (typo guard)
 *   - any {{TOKEN}} survives in the output
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

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

const plan = [
  { src: "accessibility.tsx.template", dest: join(routesDir, "accessibility.tsx") },
  { src: "privacy.tsx.template", dest: join(routesDir, "privacy.tsx") },
  { src: "LegalPageLayout.tsx.template", dest: join(componentsDir, "LegalPageLayout.tsx") },
  { src: "AnalyticsNotice.tsx", dest: join(componentsDir, "AnalyticsNotice.tsx") },
];

const usedTokens = new Set();
let failed = false;

for (const { src, dest } of plan) {
  const srcPath = join(templatesDir, src);
  if (!existsSync(srcPath)) {
    console.error(`missing template: ${srcPath}`);
    failed = true;
    continue;
  }
  let text = readFileSync(srcPath, "utf8");
  text = text.replace(/\{\{([A-Z_]+)\}\}/g, (m, token) => {
    usedTokens.add(token);
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
