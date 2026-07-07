# Vola Compliance Kit

Reusable Israeli legal-compliance kit for client websites: Hebrew accessibility
statement (הצהרת נגישות), privacy policy (מדיניות פרטיות) and terms-of-use
(תנאי שימוש) templates, a self-running audit that verifies the site actually
satisfies what those pages claim, and a CI workflow that keeps it that way.

Built from the Eli Barel Hair Design project; designed for React sites
(Lovable / TanStack Start / Vite), but the audit script works against any
running website (it just needs a filled `site-legal.config.json` in the
directory you run it from).

## Why this exists

- Israeli law (חוק שוויון זכויות לאנשים עם מוגבלות + תקנות נגישות לשירות,
  reg. 35) effectively requires business sites to be accessible per
  **ת"י 5568 level AA — since the September 2023 revision, aligned with
  WCAG 2.1** — and to publish an accessibility statement reachable from
  every page. Statutory damages (up to ~50,000 ₪ without proof of harm)
  keep accessibility suits common; since the 2024 Tel Aviv District Court
  rulings claimants must generally send a prior demand for
  statement-related defects, which makes a monitored contact channel in
  the statement itself a defense mechanism. Small-business turnover
  exemptions exist (see SKILL Step 0) — an exempt business should still
  publish a statement disclosing the exemption.
- The Privacy Protection Law — **Amendment 13, in force since 14.8.2025** —
  defines IP addresses and cookie IDs as personal data, requires a 6-item
  notice (section 11) wherever forms collect personal data, and gave the
  Privacy Protection Authority real fining powers. Sites running analytics
  must disclose it; Israel remains notice-based for cookies (no GDPR-style
  opt-in banner duty). Routine small-business customer databases no longer
  need registration.
- **A statement that claims compliance the site doesn't meet is worse than no
  statement.** That's why this kit ships an audit that checks the claims, not
  just the pages — and why the statement template declares "הונגש בהתאם
  לת"י 5568" with ongoing-improvement wording rather than an absolute
  full-compliance claim (a recognized litigation trigger).

## Contents

| Path | What it is |
| --- | --- |
| `SKILL.md` | Step-by-step playbook for applying the kit to a new site (written for Claude Code sessions; readable by humans too) |
| `site-legal.config.example.json` | Per-site facts: business name, address, phone, coordinator, audit facts, feature flags, disclosed third-party hosts |
| `templates/LegalPageLayout.tsx.template` | Shared layout for the legal pages (framework-free: plain links + shadcn theme variables), footer links to all three |
| `templates/accessibility.tsx.template` | Accessibility statement page with `{{PLACEHOLDERS}}` — reg. 35(ה) structure: standard + level, how/when tested, adjustments, known limitations, exemption block, physical arrangements, contact, נציבות escalation, outage commitment |
| `templates/privacy.tsx.template` | Privacy policy page with `{{PLACEHOLDERS}}` and conditional blocks (analytics, Amendment-13 section-11 form notice) |
| `templates/terms.tsx.template` | Terms-of-use page (IP, disclaimers, Israeli jurisdiction) — optional legally, standard practice |
| `templates/AnalyticsNotice.tsx` | Dismissible analytics/cookies notice banner (localStorage) |
| `scripts/fill-templates.mjs` | Fills every `{{TOKEN}}` from the config, resolves `{{#flag}}` blocks, and writes the pages into the project; fails on missing/unused tokens and unbalanced blocks |
| `scripts/audit-a11y.mjs` | The audit loop — WCAG scan + structural checks + claims-vs-reality checks + legal-prominence/statement-content checks; exits non-zero on failure |
| `.github/workflows/a11y-audit.yml` | CI workflow template that runs the audit on every PR |

## Quick start (new site)

1. Add this repo to your Claude Code session and say:
   **"Apply the compliance kit to this site."** Claude follows `SKILL.md`.
2. Or manually: copy `scripts/` into the project, fill
   `site-legal.config.json` (from the example), run
   `node scripts/fill-templates.mjs <kit>/templates` to generate the pages,
   add footer links + sitemap entries, then `node scripts/audit-a11y.mjs`
   until it reports 0 errors.

## Non-negotiable reminders

- Fill in a real accessibility contact person, reachable and monitored —
  and title them "רכז נגישות" only if the business employs 25+ people
  (statutory role); otherwise "איש/אשת קשר לפניות בנושא נגישות".
- Never claim full compliance, tests that didn't run, or physical
  arrangements that don't exist — a false statement is a stronger cause of
  action than a missing one.
- Keep the dates fresh: "עודכן לאחרונה" and the audit date must be renewed
  at least yearly and after significant changes; a stale statement is
  pleaded in suits.
- The audit is evidence of diligence, not a legal opinion — have an Israeli
  lawyer review the final pages once per template revision (mandatory when
  the site collects personal data via forms).
- Update the disclosed-hosts list whenever a new third-party service
  (chat widget, pixel, fonts, maps) is added to a site. The audit fails
  loudly when reality and policy drift apart — that's the point.
