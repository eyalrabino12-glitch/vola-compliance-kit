/**
 * Self-running accessibility & privacy-claims audit (config-driven).
 *
 * Reads site-legal.config.json from the current working directory and, for
 * every page × viewport, checks:
 *   1. WCAG 2.0/2.1/2.2 A+AA violations (axe-core)
 *   2. Structure: single h1, heading order, lang/dir, non-empty title,
 *      alt on every img, rel=noopener/noreferrer on target=_blank,
 *      zoomable viewport, no horizontal overflow
 *   3. Accessibility-statement claims: first Tab reaches a skip link,
 *      prefers-reduced-motion CSS exists (searched recursively — works
 *      with Tailwind v4 nested @layer rules)
 *   4. Privacy-claims vs reality: every third-party host contacted on ANY
 *      page must be in audit.disclosedHosts (ERROR — this gates CI);
 *      /privacy must keep mentioning cookies
 *   5. No unfilled {{TOKEN}} placeholders in body text, title, or head
 *
 * Usage:  node scripts/audit-a11y.mjs [baseUrl]
 * Deps:   axe-core, playwright-core (devDependencies)
 * Exit codes: 0 clean · 1 findings · 2 setup problem
 */
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const cfgPath = "site-legal.config.json";
if (!existsSync(cfgPath)) {
  console.error(`Missing ${cfgPath} — copy site-legal.config.example.json from the compliance kit and fill it in.`);
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const A = cfg.audit ?? {};
const BASE = (process.argv[2] ?? A.baseUrl ?? "http://127.0.0.1:5174").replace(/\/+$/, "");
const PAGES = A.pages ?? ["/"];
const LANG = A.lang ?? "he";
const DIR = A.dir ?? "rtl";
const DISCLOSED = A.disclosedHosts ?? [];
const EXPECTS_ANALYTICS = /google analytics/i.test(cfg.placeholders?.ANALYTICS_TOOLS ?? "");
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const findings = [];
const add = (level, where, what) => findings.push({ level, where, what });

function launchOptions() {
  // 1. explicit override; 2. any Claude-sandbox chromium; 3. system Chrome
  // (preinstalled on GitHub Actions ubuntu-latest — no install step needed).
  if (process.env.AUDIT_CHROMIUM && existsSync(process.env.AUDIT_CHROMIUM))
    return { executablePath: process.env.AUDIT_CHROMIUM };
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    for (const dir of readdirSync(root)) {
      const candidate = `${root}/${dir}/chrome-linux/chrome`;
      if (dir.startsWith("chromium") && existsSync(candidate)) return { executablePath: candidate };
    }
  }
  return { channel: "chrome" };
}

const browser = await chromium.launch(launchOptions());
const allThirdPartyHosts = new Set();

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    const where = `${path} @${vp.name}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on("request", (req) => {
      try {
        const host = new URL(req.url()).host;
        if (host && host !== new URL(BASE).host) allThirdPartyHosts.add(host);
      } catch {
        // ignore unparsable URLs (about:, blob:, etc.)
      }
    });

    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });

      // open a mobile nav (if the site has one) so its subtree is audited too
      if (vp.width < 768) {
        const navButton = await page.$("button[aria-expanded][aria-controls]");
        if (navButton) {
          await navButton.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(150);
        }
      }

      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(() =>
        window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        }),
      );
      for (const v of axe.violations) for (const n of v.nodes) add("ERROR", where, `axe:${v.id} -> ${n.target.join(" ")}`);

      const s = await page.evaluate(() => {
        const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => +h.tagName[1]);
        let skips = 0;
        for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips++;
        // recursive scan so @media rules nested in @layer/@supports (Tailwind v4) are found
        const hasReducedMotion = (rules) => {
          for (const r of rules) {
            try {
              if (r.conditionText?.includes("prefers-reduced-motion")) return true;
              if (r.cssRules && hasReducedMotion(r.cssRules)) return true;
            } catch {
              /* cross-origin or unreadable rule */
            }
          }
          return false;
        };
        let reducedMotionCSS = false;
        for (const ss of document.styleSheets) {
          try {
            if (hasReducedMotion(ss.cssRules)) {
              reducedMotionCSS = true;
              break;
            }
          } catch {
            /* cross-origin sheet */
          }
        }
        const placeholderRe = /\{\{[A-Z_]+\}\}/;
        return {
          h1Count: document.querySelectorAll("h1").length,
          headingSkips: skips,
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          title: document.title.trim(),
          imgsWithoutAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
          badBlank: [...document.querySelectorAll('a[target="_blank"]')].filter(
            (a) => !/noopener|noreferrer/.test(a.rel),
          ).length,
          viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? "",
          hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
          reducedMotionCSS,
          hasPlaceholders:
            placeholderRe.test(document.body.innerText) ||
            placeholderRe.test(document.title) ||
            placeholderRe.test(document.head.innerHTML),
        };
      });
      if (s.h1Count !== 1) add("ERROR", where, `expected exactly 1 <h1>, found ${s.h1Count}`);
      if (s.headingSkips) add("WARN", where, `${s.headingSkips} heading-level skip(s)`);
      if (s.lang !== LANG || s.dir !== DIR) add("ERROR", where, `html lang/dir is ${s.lang}/${s.dir}, expected ${LANG}/${DIR}`);
      if (!s.title) add("ERROR", where, "empty document title");
      if (s.imgsWithoutAlt) add("ERROR", where, `${s.imgsWithoutAlt} <img> without alt attribute`);
      if (s.badBlank) add("ERROR", where, `${s.badBlank} target=_blank link(s) without rel=noopener/noreferrer`);
      if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*[01](\.\d+)?\b/.test(s.viewportMeta))
        add("ERROR", where, `viewport meta blocks zoom: "${s.viewportMeta}"`);
      if (s.hScroll) add("ERROR", where, "horizontal scroll/overflow detected");
      if (s.hasPlaceholders) add("ERROR", where, "unfilled {{PLACEHOLDER}} found in page text, title, or head");
      if (path === "/" && vp.name === "desktop" && !s.reducedMotionCSS)
        add("ERROR", where, "no prefers-reduced-motion CSS found (accessibility statement claims it)");

      // claim: keyboard access — first Tab must land on an in-page skip link
      if (path === "/" && vp.name === "desktop") {
        await page.keyboard.press("Tab");
        const first = await page.evaluate(() => {
          const el = document.activeElement;
          return {
            tag: el?.tagName ?? "",
            href: el?.getAttribute?.("href") ?? "",
            text: (el?.textContent ?? "").trim().slice(0, 60),
          };
        });
        if (!(first.tag === "A" && first.href.startsWith("#")))
          add("ERROR", where, `first Tab did not land on a skip link (landed on <${first.tag}> "${first.text}") — see the skip-link snippet in SKILL.md`);
      }

      // only a site that actually runs analytics must keep the cookies wording
      if (path === "/privacy" && EXPECTS_ANALYTICS) {
        const text = await page.evaluate(() => document.body.innerText);
        if (!/עוגיות|Cookies/i.test(text)) add("ERROR", where, "privacy policy no longer mentions cookies");
      }
    } catch (err) {
      add("ERROR", where, `audit could not complete this page: ${err.message}`);
    } finally {
      await page.close();
    }
  }
}
await browser.close();

// privacy-claims vs reality — checked across ALL pages, and it gates CI
for (const host of [...allThirdPartyHosts].sort()) {
  if (!DISCLOSED.includes(host))
    add("ERROR", "site-wide", `third-party request to ${host} is not in audit.disclosedHosts — disclose it in the privacy policy AND the config, or remove the service`);
}
if (EXPECTS_ANALYTICS) {
  const gaLoaded = [...allThirdPartyHosts].some((h) => h.includes("googletagmanager") || h.includes("google-analytics"));
  if (!gaLoaded) add("WARN", "site-wide", "privacy policy discloses Google Analytics but no GA request was observed");
}

const errors = findings.filter((f) => f.level === "ERROR");
const warns = findings.filter((f) => f.level === "WARN");
for (const f of findings) console.log(`[${f.level}] ${f.where} :: ${f.what}`);
console.log(`\n${errors.length} error(s), ${warns.length} warning(s) across ${PAGES.length * VIEWPORTS.length} page/viewport combinations`);
process.exit(errors.length ? 1 : 0);
