# SKILL: Content-gaps אפיון — find what real content a site still needs

Use this playbook when asked to audit a client site (usually a fresh
Lovable/AI-generated draft) for content that is still placeholder — stock
images, dummy text, fake contact details — and to produce the אפיון: a
client-facing checklist of exactly what real material the business owner
still has to supply before launch.

Deliverable: a filled `content-gaps-report` (Hebrew, non-technical) the
agency sends the client. Not a redesign, not a copywriting pass — a precise
"send us these N things" list.

## Step 1 — Run the automated sweep

```
node scripts/audit-content.mjs <site-url> --json content-inventory.json
```

(Needs `playwright-core` resolvable from where the script lives — run it from
a project that has it installed, or `npm i playwright-core` next to it.
`AUDIT_CHROMIUM=/path/to/chrome` overrides browser discovery, same as the
a11y audit.)

It crawls every same-origin route it can discover and prints findings at
three levels:

- **PLACEHOLDER** — fake content is live (stock-photo hosts, lorem ipsum,
  לורם איפסום, dummy names, fake-looking phones/emails, `#` social links,
  default Lovable title/og:image/favicon)
- **MISSING** — expected info found nowhere (no phone, no email/form, no
  meta description, no legal pages)
- **CHECK** — a human must judge (empty/generic alts, "בקרוב" sections,
  no recognizable address/hours, lang/dir mismatch)

The `--json` inventory contains every page's headings, full text, images,
and links — read it when writing the report so items reference real
locations ("בעמוד הבית, בקטע 'הצוות שלנו'"), not guesses.

## Step 2 — Manual pass (mandatory; the script can't see these)

Open every crawled page and check:

- **AI-generated or unrelated real-looking photos.** A crawler flags
  `images.unsplash.com`; it cannot tell that a professional-looking dish
  photo is not from THIS kitchen. Rule: any photo presented as the client's
  premises/staff/products that the client didn't provide = PLACEHOLDER.
- **Invented facts.** AI drafts invent founding years, staff names, menu
  items, prices, opening hours that *parse* as real. Verify every concrete
  claim against material from the client (or mark it for confirmation).
  Cross-check with the business's Google Business profile / Instagram /
  Facebook if they exist.
- **Testimonials.** Generated reviews with plausible names are still fake
  reviews — illegal to publish under Israeli consumer-protection law. All
  go on the list for replacement with real ones (or removal).
- **Wrong-language leftovers** (English filler on a Hebrew site), tone
  mismatches, and the business name spelled inconsistently.
- **Anything behind interactions** the crawler missed: modals, accordion
  content, form success/error messages, 404 page.

## Step 3 — Write the אפיון

Fill `templates/content-gaps-report.md.template` (by hand — it is NOT
processed by `fill-templates.mjs`). Rules:

- Audience is the business owner: no jargon, no file paths, no "og:image" —
  say "התמונה שמופיעה כששולחים את הקישור בוואטסאפ".
- Every item = where on the site + what's there today + exactly what to
  send + format (count, orientation, resolution, "send as document not
  WhatsApp photo").
- Split into **חוסם השקה** (placeholder visible on page — same blocker rule
  as the a11y audit) vs **מומלץ**.
- Group so the owner can act in one sitting: all photos to shoot in one
  section, all facts to answer in another.
- If the site also lacks the legal pages, keep the template's section 6 and
  plan a run of the main compliance kit (`SKILL.md`) — its Step 0 questions
  can ride along in the same email to the client.

## Step 4 — Intake loop until clean

1. Track what arrives; swap real content in as it lands.
2. Re-run `audit-content.mjs` after each batch; before launch run with
   `--strict` (exits non-zero on any PLACEHOLDER/MISSING) — wire it into CI
   next to the a11y audit if the placeholder risk is recurring.
3. Content the client never supplies gets **removed**, not left as
   placeholder — a missing section beats invented information.
4. New real images: re-check alts (describe the actual photo) and re-run the
   a11y audit; new facts (address, hours) may also belong in the
   accessibility statement and `site-legal.config.json`.

## Hard rules

- Never invent content to close a gap — not text, not facts, and no
  AI-generated images passed off as the real business. Gaps are the
  client's to fill or the section is cut.
- Fake testimonials are never "good enough for now".
- A PLACEHOLDER finding visible on a live page is a launch blocker, period.
- The report may only claim "נבדק" for pages actually crawled or opened —
  list them at the bottom of the report.
