# CLAUDE.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `geemeows/clearday`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, using their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Frontend

All frontend work (components, styles, layout, copy) must follow the design system in `DESIGN.md` at the repo root. Use its color, typography, spacing, radius, and component tokens rather than ad-hoc values. The tokens are wired into `src/styles.css` as Tailwind v4 theme variables and the shadcn CSS-variable contract — prefer Tailwind utilities (`bg-primary`, `text-foreground`, `rounded-md`) and shadcn primitives over hand-rolled hex / px values.
