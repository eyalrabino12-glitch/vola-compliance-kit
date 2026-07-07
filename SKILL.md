# SKILL: Apply Israeli legal compliance (accessibility + privacy + terms) to a website

Use this playbook when asked to add/verify the accessibility statement,
privacy policy and terms of use on a client site. Goal: pages that are true,
a site that passes WCAG AA (ת"י 5568 / WCAG 2.1), and an audit loop that
keeps both honest.

## Step 0 — Collect the facts (ask the user; do not invent)

Fill `site-legal.config.json` (copy from `site-legal.config.example.json`):

- Business legal name (Hebrew) and what it does
- Street address, city
- Public phone (display + tel: format) and a contact email
- **Employee count.** 25 or more employees → the business MUST appoint a
  statutory accessibility coordinator (רכז נגישות, סעיף 19מא1 לחוק שוויון
  זכויות): set `flags.hasStatutoryCoordinator: true` and
  `COORDINATOR_TITLE: "רכז/ת הנגישות"`. Under 25 → no coordinator duty;
  use `COORDINATOR_TITLE: "איש/אשת הקשר לפניות בנושא נגישות"` (calling a
  non-statutory contact "רכז נגישות" misstates a legal role).
- Accessibility contact: business contact (usually the owner) AND
  technical contact (usually Vola Web Design, volawebdesign@gmail.com)
- **Average annual turnover** (for the reg. 35 exemption regime — ask, don't
  assume):
  - Up to ~120,000 ₪ (עוסק פטור level): exempt from web-accessibility duties,
    renewable every 3 years. Still publish the statement — set
    `flags.isTurnoverExempt: true` so it discloses the exemption and the
    accessible contact channels (a condition of the exemption itself).
  - 120,000–1,000,000 ₪: exemption exists ONLY for sites launched before
    26.10.2017. Any newer site (everything this kit is used for) must be
    fully accessible — leave `isTurnoverExempt: false`.
  - Over 1,000,000 ₪: no automatic exemption.
- **Audit facts for the statement**: month+year of the audit you are about to
  run (`AUDIT_MONTH_YEAR`), browsers you actually test in
  (`BROWSERS_TESTED`), assistive tech you actually test with
  (`ASSISTIVE_TECH_TESTED` — at minimum keyboard-only; run NVDA/VoiceOver if
  you claim it), and any known limitations (`KNOWN_LIMITATIONS`) — never
  claim tests that didn't happen.
- **Physical accessibility facts** (required in the statement for businesses
  with premises, reg. 34(א)(4)): disabled parking, step-free entrance,
  accessible restroom, aisle width — ask the owner, list what's actually
  true INCLUDING what's absent (with an alternative service channel), never
  invent
- Response-time commitment for accessibility inquiries (default: 7 business days)
- Analytics/trackers actually installed (GA id? pixel? none?) →
  `flags.hasAnalytics`
- Any forms that collect personal data (name/phone/email)? → set
  `flags.hasContactForms: true`; the privacy template then emits the
  Amendment-13 section-11 notice block (voluntariness, purpose, recipients,
  consequence of refusal, retention) and requires `FORM_DATA_RETENTION`
  (e.g. "למשך שנתיים ממועד הפנייה"). Lawyer review is MANDATORY in that
  case. Also ask whether the business will send marketing email/SMS — if
  yes, it needs prior express opt-in per the spam law (s.30A חוק התקשורת)
  with an unsubscribe in every message, and forms need a separate,
  unchecked marketing-consent checkbox plus a privacy-policy link next to
  the submit button.
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
2. Run the fill script — it substitutes every token, resolves the
   `{{#flag}}…{{/flag}}` conditional blocks from `flags`, writes the five
   files into the project, and FAILS if any token is missing/unused or a
   block is unbalanced:

   ```
   node <kit>/scripts/fill-templates.mjs <kit>/templates
   ```

   (Defaults: routes → `src/routes`, components → `src/components`;
   override with `--routes-dir` / `--components-dir`. Adjust the route
   files afterwards if the project doesn't use TanStack file-routes.)
3. `LegalPageLayout` uses only generic shadcn tokens
   (primary/background/border) — restyle to the site's brand.
4. Mount `AnalyticsNotice` in the root layout **only if the site runs
   analytics** (`flags.hasAnalytics: true`); delete it otherwise. The
   analytics wording in the privacy page follows the flag automatically —
   never publish a policy describing measurement tools that don't exist.
5. The generated `/terms` page is a generic small-business terms-of-use
   (IP, disclaimers, Israeli jurisdiction). Read it against the actual
   business (e.g. delete the services/prices sentence for a site that
   sells nothing) and flag it for the lawyer-review pass.
6. Footer of the SITE (not just the legal pages): add links to all three
   pages — the audit fails any page that doesn't link to
   `/accessibility` and `/privacy` (reg. 35(ה) prominence). Sitemap: add
   all three URLs.
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

Then three MANDATORY manual passes the script cannot do:

- **Keyboard walk-through**: Tab through the whole page (menu, dialogs,
  gallery, embeds) — everything reachable, nothing traps focus, Escape
  closes overlays. The statement's keyboard claim rests on this, not just
  on the automated skip-link check.
- **Alt-text read**: the audit checks alt *presence*, not adequacy — read
  every alt and fix meaningless ones.
- **Assistive-tech spot check**: the statement now names the assistive
  technologies tested (`ASSISTIVE_TECH_TESTED`). Verify the claim: at
  minimum a full keyboard-only session; run the named screen reader
  (NVDA is free; VoiceOver ships with macOS) through the home page and
  one legal page — or remove it from the config.

Conformance-sentence rule: the generated accessibility page declares the
site "הונגש בהתאם לת"י 5568 ברמה AA (מבוסס WCAG 2.1)" alongside an
ongoing-improvement paragraph — deliberately NOT an absolute
full-compliance claim, which Israeli case law treats as a litigation
trigger when any gap exists. That sentence may go live ONLY after the
audit reports 0 errors AND the manual passes are done. During
remediation, switch to the fallback wording in the template comment
("נבנה בשאיפה לעמוד"). The audit also fails if the statement page later
loses its required elements (standard, browsers, contact channel,
נציבות escalation).

## Step 4 — CI

Copy `.github/workflows/a11y-audit.yml`, adjust the build/serve commands to
the project, commit. The audit must gate every PR.

## Step 5 — Handoff checklist (tell the user)

- [ ] Coordinator/contact-person name confirmed real and reachable, and the
      title matches the law (רכז נגישות only for 25+ employees)
- [ ] CONTACT_EMAIL inbox confirmed monitored by the business
- [ ] Manually click-test the gov.il links in a browser (gov.il blocks
      bots, so automated link checks false-negative)
- [ ] Lawyer review recommended (statement + policy + terms); MANDATORY if
      the site collects personal data via forms
- [ ] Production domain set in canonical/sitemap URLs
- [ ] If a new tracker/widget is ever added: update privacy policy + config
- [ ] If any accessibility feature breaks for more than 7 days: publish a
      notice on the statement page (the statement promises this, reg. 35ה)
- [ ] Calendar reminder: re-run the audit and review all pages at least
      once a year (and after significant site changes); refresh both the
      "עודכן לאחרונה" date and AUDIT_MONTH_YEAR each time — a stale
      statement is itself pleaded in accessibility suits

## Hard rules

- Never publish a compliance claim the audit can't verify. If the site fails
  contrast, fix the site — do not soften the statement.
- Never claim absolute/full compliance and never list a browser, assistive
  technology or adjustment that wasn't actually tested — false statements
  are worse than missing ones and are pleaded in suits.
- Never guess business facts (turnover, employees, physical arrangements).
  Ask.
- Every page the site serves must be in the audit's page list.
