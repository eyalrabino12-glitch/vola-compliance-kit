/**
 * Content-gaps audit (אפיון חוסרי תוכן) — finds everything on a site that is
 * still placeholder/stock/missing and must be replaced with the client's real
 * material before launch.
 *
 * Crawls the rendered site (same-origin routes discovered from links) and, per
 * page + site-wide, flags:
 *   1. Images: stock/placeholder sources (Unsplash, Pexels, picsum, avatar
 *      generators, /placeholder.svg, "placeholder" filenames), empty/generic alt
 *   2. Text: lorem ipsum (Latin + Hebrew), TODO/TBD, [insert …], dummy names
 *      (John Doe / ישראל ישראלי), unfilled {{TOKEN}}s, "coming soon"
 *   3. Contact & business data: missing or obviously fake phone/email/address,
 *      no opening hours, social links pointing nowhere (# or bare facebook.com)
 *   4. SEO & branding: default/Lovable title, missing meta description,
 *      missing/default og:image and favicon, html lang mismatch vs page language
 *   5. Structure: dead "#" links, missing legal pages (→ apply the main
 *      compliance kit, SKILL.md)
 *
 * Levels:
 *   PLACEHOLDER  fake content is live — client must supply the real thing
 *   MISSING      expected info not found anywhere on the site
 *   CHECK        heuristic can't decide — a human must look
 *
 * The findings feed templates/content-gaps-report.md.template (the client-facing
 * checklist). This script finds *signals*; SKILL-content-gaps.md Step 2 lists
 * what it cannot catch (AI-generated "realistic" images, invented facts).
 *
 * Usage:  node scripts/audit-content.mjs <baseUrl> [--pages /,/menu] [--max 30]
 *                                        [--json inventory.json] [--strict]
 * Deps:   playwright-core
 * Exit codes: 0 report done · 1 (--strict only) placeholder/missing found · 2 setup problem
 */
import { chromium } from "playwright-core";
import { writeFileSync, existsSync, readdirSync } from "node:fs";

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith("--")) ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(BASE)) {
  console.error("Usage: node scripts/audit-content.mjs <baseUrl> [--pages /a,/b] [--max 30] [--json out.json] [--strict]");
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : dflt;
};
const FORCED_PAGES = opt("--pages", "").split(",").filter(Boolean);
const MAX_PAGES = Number(opt("--max", "30"));
const JSON_OUT = opt("--json", "");
const STRICT = args.includes("--strict");

const findings = [];
const add = (level, where, category, what) => findings.push({ level, where, category, what });

const STOCK_IMAGE_RE =
  /(images\.unsplash\.com|source\.unsplash\.com|plus\.unsplash\.com|picsum\.photos|placehold\.co|placekitten\.com|images\.pexels\.com|cdn\.pixabay\.com|loremflickr\.com|dummyimage\.com|via\.placeholder\.com|i\.pravatar\.cc|randomuser\.me|api\.dicebear\.com|ui-avatars\.com)/i;
const PLACEHOLDER_FILE_RE = /(placeholder|dummy|sample|temp-?image|stock-?photo)/i;
const GENERIC_ALT_RE = /^(image|photo|img|picture|icon|תמונה|לוגו|logo)?$/i;
const DUMMY_TEXT_RES = [
  [/lorem ipsum/i, "lorem ipsum"],
  [/לורם איפסום/, "לורם איפסום (Hebrew filler)"],
  [/\b(TODO|TBD|FIXME)\b/, "TODO/TBD marker"],
  [/\[insert[^\]]{0,60}\]/i, "[insert …] marker"],
  [/\byour (text|content|title|name) here\b/i, '"your … here" filler'],
  [/טקסט (כאן|לדוגמה|זמני)/, "Hebrew filler text"],
  [/תוכן (זמני|לדוגמה)/, "Hebrew filler text"],
  [/\b(john|jane) doe\b/i, "dummy person name"],
  [/ישראל(ה)? ישראלי/, "dummy person name (ישראל ישראלי)"],
  [/\{\{[A-Z_]+\}\}/, "unfilled {{TOKEN}}"],
];
const FAKE_PHONE_RES = [/(\d)\1{6,}/, /1234567/, /123[- ]?456[- ]?7890/, /555[- ]?01\d\d/];
const FAKE_EMAIL_RE = /@(example|test|email|domain|yoursite|mysite|yourdomain)\.|^(test|demo|your-?email|user|sample)@/i;
const ADDRESS_RE = /(רח'|רחוב |שד'|שדרות |כתובתנו|הכתובת|\b\d+\s+[A-Z][a-z]+ (St|Street|Ave|Avenue|Rd|Road|Blvd)\b)/;
const HOURS_RE = /(שעות (פתיחה|פעילות)|ימי (פעילות|קבלה)|א'\s*[-–]\s*ה'|ראשון\s*[-–]\s*חמישי|open(ing)? hours|business hours|\b(sun|mon)(day)?\s*[-–]\s*(thu|fri|sat))/i;
const LEGAL_LINK_RE = /(נגישות|פרטיות|תקנון|privacy|accessibility|terms)/i;
const SOCIAL_HOST_RE = /(facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|wa\.me|api\.whatsapp\.com)/i;
const DEFAULT_TITLE_RE = /(lovable|vite \+ react|untitled|my app|new project)/i;

function launchOptions() {
  // same resolution order as audit-a11y.mjs: override → sandbox chromium → system Chrome
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function extract(url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(800); // let lazy sections mount
  return page.evaluate(() => {
    const abs = (u) => {
      try {
        return new URL(u, location.href).href;
      } catch {
        return u ?? "";
      }
    };
    const meta = {};
    for (const m of document.querySelectorAll("meta[name], meta[property]"))
      meta[m.getAttribute("name") || m.getAttribute("property")] = m.getAttribute("content") ?? "";
    const bgImages = new Set();
    for (const el of document.querySelectorAll("*")) {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\("?([^")]+)"?\)/);
      if (m && !m[1].startsWith("data:")) bgImages.add(abs(m[1]));
    }
    return {
      path: location.pathname,
      title: document.title.trim(),
      lang: document.documentElement.lang,
      meta,
      favicon: abs(document.querySelector('link[rel*="icon"]')?.getAttribute("href") ?? ""),
      headings: [...document.querySelectorAll("h1,h2,h3")].map(
        (h) => `${h.tagName}: ${h.innerText.trim().replace(/\s+/g, " ").slice(0, 120)}`,
      ),
      images: [...document.querySelectorAll("img")].map((i) => ({
        src: abs(i.getAttribute("src") ?? ""),
        alt: i.getAttribute("alt"),
      })),
      bgImages: [...bgImages],
      links: [...document.querySelectorAll("a[href]")].map((a) => ({
        href: a.getAttribute("href"),
        abs: abs(a.getAttribute("href")),
        text: (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 80),
      })),
      hasMapEmbed: !!document.querySelector('iframe[src*="google.com/maps"], iframe[src*="waze.com"]'),
      hasForm: !!document.querySelector("form input, form textarea"),
      text: document.body.innerText,
    };
  });
}

// ---- crawl -----------------------------------------------------------------
const origin = new URL(BASE).origin;
const queue = FORCED_PAGES.length ? [...FORCED_PAGES] : ["/"];
const seen = new Set();
const pages = [];

while (queue.length && pages.length < MAX_PAGES) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  try {
    const p = await extract(origin + path);
    pages.push(p);
    if (!FORCED_PAGES.length) {
      for (const l of p.links) {
        try {
          const u = new URL(l.abs);
          const clean = u.pathname.replace(/\/+$/, "") || "/";
          if (u.origin === origin && !seen.has(clean) && !/\.(pdf|jpe?g|png|webp|svg|zip|mp4)$/i.test(clean))
            queue.push(clean);
        } catch {
          /* mailto:, tel:, javascript: */
        }
      }
    }
  } catch (err) {
    add("CHECK", path, "structure", `page could not be crawled: ${err.message}`);
  }
}
await browser.close();
if (!pages.length) {
  console.error(`Could not load any page of ${BASE} — is the site reachable from this machine?`);
  process.exit(2);
}

// ---- per-page checks ---------------------------------------------------------
const heavilyHebrew = (t) => {
  const he = (t.match(/[֐-׿]/g) ?? []).length;
  return t.length > 200 && he / t.length > 0.15;
};

for (const p of pages) {
  const where = p.path;
  for (const img of p.images) {
    const label = img.src.split("/").pop()?.slice(0, 80) || img.src.slice(0, 80);
    if (STOCK_IMAGE_RE.test(img.src)) add("PLACEHOLDER", where, "images", `stock image (${img.src.match(STOCK_IMAGE_RE)[1]}): ${label}`);
    else if (PLACEHOLDER_FILE_RE.test(new URL(img.src, origin).pathname)) add("PLACEHOLDER", where, "images", `placeholder image file: ${label}`);
    if (img.alt !== null && GENERIC_ALT_RE.test(img.alt.trim()))
      add("CHECK", where, "images", `empty/generic alt ("${img.alt}") on ${label} — describe what the photo shows, or confirm it's decorative`);
  }
  for (const bg of p.bgImages) {
    if (STOCK_IMAGE_RE.test(bg) || PLACEHOLDER_FILE_RE.test(bg))
      add("PLACEHOLDER", where, "images", `stock/placeholder background image: ${bg.slice(0, 100)}`);
  }
  for (const [re, name] of DUMMY_TEXT_RES) {
    const m = p.text.match(re);
    if (m) add("PLACEHOLDER", where, "text", `${name}: "…${p.text.slice(Math.max(0, m.index - 30), m.index + 50).replace(/\s+/g, " ")}…"`);
  }
  if (/\b(coming soon)\b/i.test(p.text) || /בקרוב\s*[!.]?\s*$/m.test(p.text))
    add("CHECK", where, "text", '"coming soon"/"בקרוב" section — real content pending?');

  const dead = p.links.filter((l) => l.href === "#" || l.href === "" || l.href?.startsWith("javascript:"));
  if (dead.length)
    add("CHECK", where, "structure", `${dead.length} link(s) going nowhere (href="#"): ${dead.map((l) => `"${l.text || "unlabeled"}"`).slice(0, 5).join(", ")}`);

  for (const l of p.links) {
    if (!SOCIAL_HOST_RE.test(l.abs)) continue;
    const u = new URL(l.abs);
    if ((u.pathname === "/" || u.pathname === "") && !u.search)
      add("PLACEHOLDER", where, "contact", `social link "${l.text || u.host}" points at bare ${u.host} — needs the business's actual profile URL`);
  }
}

// ---- site-wide checks --------------------------------------------------------
const allText = pages.map((p) => p.text).join("\n");
const allLinks = pages.flatMap((p) => p.links);
const home = pages[0];

const telLinks = allLinks.filter((l) => l.href?.startsWith("tel:"));
const phoneCandidates = [
  ...telLinks.map((l) => l.href.slice(4)),
  ...(allText.match(/(?:\+972[-\s]?|0)\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/g) ?? []),
];
if (!phoneCandidates.length) add("MISSING", "site-wide", "contact", "no phone number found anywhere (no tel: link, no number in text)");
for (const ph of new Set(phoneCandidates.map((x) => x.replace(/\D/g, "")))) {
  if (FAKE_PHONE_RES.some((re) => re.test(ph))) add("PLACEHOLDER", "site-wide", "contact", `phone number looks fake: ${ph}`);
}

const emails = [...new Set(allText.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? []), ...allLinks.filter((l) => l.href?.startsWith("mailto:")).map((l) => l.href.slice(7).split("?")[0])];
if (!emails.length && !pages.some((p) => p.hasForm)) add("MISSING", "site-wide", "contact", "no email address and no contact form found");
for (const em of new Set(emails)) if (FAKE_EMAIL_RE.test(em)) add("PLACEHOLDER", "site-wide", "contact", `email looks fake: ${em}`);

if (!ADDRESS_RE.test(allText)) add("CHECK", "site-wide", "contact", "no street address recognized — physical business? then the address must appear (and it feeds the accessibility statement)");
if (!HOURS_RE.test(allText)) add("CHECK", "site-wide", "contact", "no opening hours recognized — ask the client for real hours");
if (!pages.some((p) => p.hasMapEmbed) && ADDRESS_RE.test(allText)) add("CHECK", "site-wide", "contact", "address present but no map embed — intended?");

if (!home.title) add("MISSING", "site-wide", "seo", "empty <title>");
else if (DEFAULT_TITLE_RE.test(home.title)) add("PLACEHOLDER", "site-wide", "seo", `default-looking <title>: "${home.title}"`);
if (!home.meta["description"]) add("MISSING", "site-wide", "seo", "no meta description");
const og = home.meta["og:image"] ?? "";
if (!og) add("MISSING", "site-wide", "seo", "no og:image — link previews (WhatsApp/Facebook) will be blank");
else if (/lovable/i.test(og)) add("PLACEHOLDER", "site-wide", "seo", `og:image is the Lovable default: ${og}`);
if (!home.favicon) add("MISSING", "site-wide", "seo", "no favicon");
else if (/lovable/i.test(home.favicon)) add("PLACEHOLDER", "site-wide", "seo", `favicon is the Lovable default: ${home.favicon}`);
if (heavilyHebrew(allText) && !home.lang.startsWith("he"))
  add("CHECK", "site-wide", "seo", `page text is Hebrew but <html lang="${home.lang || "(unset)"}"> — should be lang="he" dir="rtl"`);

if (!allLinks.some((l) => LEGAL_LINK_RE.test(l.text) || LEGAL_LINK_RE.test(l.href ?? "")))
  add("MISSING", "site-wide", "legal", "no accessibility-statement or privacy-policy link found — apply the compliance kit (SKILL.md)");

// ---- report -------------------------------------------------------------------
const order = { PLACEHOLDER: 0, MISSING: 1, CHECK: 2 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.category.localeCompare(b.category));
for (const f of findings) console.log(`[${f.level}] ${f.where} :: ${f.category} :: ${f.what}`);
const count = (lvl) => findings.filter((f) => f.level === lvl).length;
console.log(
  `\n${count("PLACEHOLDER")} placeholder(s), ${count("MISSING")} missing, ${count("CHECK")} to check manually — across ${pages.length} page(s): ${pages.map((p) => p.path).join(" ")}`,
);
console.log("Now do the manual pass (SKILL-content-gaps.md Step 2) — this script cannot judge whether a photo is really the client's business.");

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, crawledAt: new Date().toISOString(), pages, findings }, null, 2));
  console.log(`full inventory written to ${JSON_OUT}`);
}
process.exit(STRICT && (count("PLACEHOLDER") || count("MISSING")) ? 1 : 0);
