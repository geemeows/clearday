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

### Component primitives

**All coss primitives live in `src/components/ui/`.** Import as `#/components/ui/<name>`. New primitives are installed via the coss CLI per `components.json` (`"ui": "#/components/ui"`). The legacy `src/components/coss/` folder no longer exists — anything that previously imported from `#/components/coss/*` should now import from `#/components/ui/*`.

`src/components/ui/` is **primitives only** — lowercase filenames (`button.tsx`, `dialog.tsx`). Project-specific composed components (PascalCase: `ErrorAlert`, `LoadingPlaceholder`, `SettingsPanel`, `StatusBadge`, `UserAvatar`) live one level up at `src/components/<Name>.tsx` and are imported as `#/components/<Name>`. Feature-owned composed components live under `src/features/<feature>/components/`.

There is **no** coss `dropdown-menu` primitive. For overflow menus, user menus, and action lists, compose `Popover` + a list of `Button`s (or check the `/coss-particles` skill for a ready-made menu particle).
