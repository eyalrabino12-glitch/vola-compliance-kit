# SKILL: Apply Israeli legal compliance (accessibility + privacy) to a website

Use this playbook when asked to add/verify the accessibility statement and
privacy policy on a client site. Goal: pages that are true, a site that
passes WCAG AA, and an audit loop that keeps both honest.

## Step 0 — Collect the facts (ask the user; do not invent)

Fill `site-legal.config.json` (copy from `site-legal.config.example.json`):

- Business legal name (Hebrew) and what it does
- Street address, city
- Public phone (display + tel: format) and a contact email
- Accessibility coordinator: business contact (usually the owner) AND
  technical contact (usually Vola Web Design, volawebdesign@gmail.com)
- **Physical accessibility facts** (required in the statement for businesses
  with premises): disabled parking, step-free entrance, accessible restroom,
  aisle width — ask the owner, list what's actually true, never invent
- Response-time commitment for accessibility inquiries (default: 7 business days)
- Analytics/trackers actually installed (GA id? pixel? none?)
- Any forms that collect personal data (name/phone/email)? If yes, the
  privacy template needs data-retention + database-duties sections — extend
  it, don't skip, and flag that lawyer review is mandatory in that case.
  (`hasContactForms` in the config is an advisory flag for this decision —
  it is not substituted into any template.)
- Site production URL (for canonical links + sitemap)

Config rules:
- **CONTACT_EMAIL must be an inbox the BUSINESS actually monitors.** Statutory
  response clocks for access/correction/deletion requests run against the
  business (the controller), not the web agency. Use the agency address only
  with an explicit forwarding commitment.
- Values may not contain ASCII double quotes, backslashes, or newlines
  (the fill script rejects them) — write בע״מ with the Hebrew gershayim ״.

## Step 1 — Install the pages

1. Copy `site-legal.config.example.json` → project root as
   `site-legal.config.json` and fill `placeholders` with the Step 0 facts
   (incl. `UPDATED_MONTH_YEAR` = current Hebrew month + year).
2. Run the fill script — it substitutes every token, writes the four files
   into the project, and FAILS if any token is missing/unused:

   ```
   node <kit>/scripts/fill-templates.mjs <kit>/templates
   ```

   (Defaults: routes → `src/routes`, components → `src/components`;
   override with `--routes-dir` / `--components-dir`. Adjust the route
   files afterwards if the project doesn't use TanStack file-routes.)
3. `LegalPageLayout` uses only generic shadcn tokens
   (primary/background/border) — restyle to the site's brand.
4. Mount `AnalyticsNotice` in the root layout **only if the site runs
   analytics**; delete it otherwise.
5. **Analytics-free site?** Then also edit the generated privacy page:
   delete the analytics bullet, the measurement-cookies sentence, and the
   third-party embed sentence (keep the Local Storage disclosure only if
   the notice component is mounted). Never publish a policy describing
   measurement tools that don't exist.
6. Footer: add links to both pages. Sitemap: add both URLs.
7. Ensure the site has a skip link — the audit requires the first Tab to
   land on an in-page anchor. Reference implementation:

   ```tsx
   {/* first element inside <body>/root layout */}
   <a href="#main" className="skip-link">דלג לתוכן הראשי</a>
   ...
   <main id="main" tabIndex={-1}>...</main>
   ```

   ```css
   .skip-link {
     position: absolute; top: 0; right: 0; z-index: 100;
     background: var(--primary); color: var(--primary-foreground);
     padding: 0.75rem 1.25rem; font-weight: 600;
     transform: translateY(-110%); transition: transform 0.2s ease;
   }
   .skip-link:focus { transform: translateY(0); }
   ```

## Step 2 — Install the audit loop

1. Copy `scripts/audit-a11y.mjs` into the project.
2. `bun add -d axe-core playwright-core` (or npm equivalents).
3. Add `"audit:a11y": "node scripts/audit-a11y.mjs"` to package.json scripts.
4. Put the site's pages + disclosed third-party hosts in
   `site-legal.config.json` — the script reads it.

## Step 3 — Run the loop until clean

Run the dev server, then `bun run audit:a11y`. Fix every ERROR, re-run,
repeat until `0 error(s)`. Known fix patterns:

- **color-contrast**: don't redesign — add darker "ink" variants of brand
  colors for text only (e.g. `--brand-ink`), keep originals for
  icons/backgrounds. Verify mathematically (4.5:1 text, 3:1 large/UI).
- **undisclosed third-party host**: either remove the service or add it to
  the privacy policy AND the config's disclosedHosts. This is an ERROR and
  gates CI by design.
- **first Tab doesn't hit skip-link**: add the skip-link snippet from
  Step 1.7.
- Placeholder text visible on page = ERROR. Internal notes belong in code
  comments, never in rendered content.

Then two MANDATORY manual passes the script cannot do:

- **Keyboard walk-through**: Tab through the whole page (menu, dialogs,
  gallery, embeds) — everything reachable, nothing traps focus, Escape
  closes overlays. The statement's keyboard claim rests on this, not just
  on the automated skip-link check.
- **Alt-text read**: the audit checks alt *presence*, not adequacy — read
  every alt and fix meaningless ones.

Conformance-sentence rule: the generated accessibility page declares
compliance ("אתר זה עומד בדרישות..."). That sentence may go live ONLY
after the audit reports 0 errors AND the manual passes are done. During
remediation, switch to the fallback wording in the template comment
("נבנה בשאיפה לעמוד").

## Step 4 — CI

Copy `.github/workflows/a11y-audit.yml`, adjust the build/serve commands to
the project, commit. The audit must gate every PR.

## Step 5 — Handoff checklist (tell the user)

- [ ] Coordinator name/contact confirmed real and reachable
- [ ] CONTACT_EMAIL inbox confirmed monitored by the business
- [ ] Manually click-test the two gov.il links in a browser (gov.il blocks
      bots, so automated link checks false-negative)
- [ ] Lawyer review recommended (statement + policy); mandatory if the site
      collects personal data via forms
- [ ] Production domain set in canonical/sitemap URLs
- [ ] If a new tracker/widget is ever added: update privacy policy + config
- [ ] Calendar reminder: re-run the audit and review both pages at least
      once a year (and after significant site changes); refresh the
      "עודכן לאחרונה" date each time

## Hard rules

- Never publish a compliance claim the audit can't verify. If the site fails
  contrast, fix the site — do not soften the statement.
- Never guess business facts. Ask.
- Every page the site serves must be in the audit's page list.
