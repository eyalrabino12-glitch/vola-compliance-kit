# Vola Compliance Kit

Reusable Israeli legal-compliance kit for client websites: Hebrew accessibility
statement (הצהרת נגישות) and privacy policy (מדיניות פרטיות) templates, a
self-running audit that verifies the site actually satisfies what those pages
claim, and a CI workflow that keeps it that way.

Built from the Eli Barel Hair Design project; designed for React sites
(Lovable / TanStack Start / Vite), but the audit script works against any
running website (it just needs a filled `site-legal.config.json` in the
directory you run it from).

## Why this exists

- Israeli law (חוק שוויון זכויות לאנשים עם מוגבלות + תקנות נגישות לשירות,
  ת"י 5568 / WCAG 2.0 AA) effectively requires business sites to be accessible
  and to publish an accessibility statement. Lawsuits with statutory damages
  are common.
- The Privacy Protection Law (incl. Amendment 13) expects sites running
  analytics to disclose it.
- **A statement that claims compliance the site doesn't meet is worse than no
  statement.** That's why this kit ships an audit that checks the claims, not
  just the pages.

## Contents

| Path | What it is |
| --- | --- |
| `SKILL.md` | Step-by-step playbook for applying the kit to a new site (written for Claude Code sessions; readable by humans too) |
| `site-legal.config.example.json` | Per-site facts: business name, address, phone, coordinator, disclosed third-party hosts |
| `templates/LegalPageLayout.tsx.template` | Shared layout for both legal pages (framework-free: plain links + shadcn theme variables) |
| `templates/accessibility.tsx.template` | Accessibility statement page with `{{PLACEHOLDERS}}` |
| `templates/privacy.tsx.template` | Privacy policy page with `{{PLACEHOLDERS}}` |
| `templates/AnalyticsNotice.tsx` | Dismissible analytics/cookies notice banner (localStorage) |
| `scripts/fill-templates.mjs` | Fills every `{{TOKEN}}` from the config and writes the pages into the project; fails on missing/unused tokens |
| `scripts/audit-a11y.mjs` | The audit loop — WCAG scan + structural checks + claims-vs-reality checks; exits non-zero on failure |
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

- Fill in a real accessibility-coordinator name and reachable contact.
- The audit is evidence of diligence, not a legal opinion — have an Israeli
  lawyer review the final pages once per template revision.
- Update the disclosed-hosts list whenever a new third-party service
  (chat widget, pixel, fonts, maps) is added to a site. The audit fails
  loudly when reality and policy drift apart — that's the point.
