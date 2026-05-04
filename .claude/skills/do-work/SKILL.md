---
name: do-work
description: Execute a unit of work in this repo end-to-end — plan, implement, verify with type-check + tests, and commit. Use when the user asks to start/pick up/work on an issue, slice, ticket, or task in this repo, or says "do the work", "implement #N", or similar.
---

# Do Work

A unit of work in this repo follows four steps. Do them in order. Do not skip the verification loop.

## 1. Plan (optional)

- Identify the unit of work. If it maps to a GitHub issue, run `gh issue view <number> --comments` and read the body, acceptance criteria, and any agent brief.
- Read `CLAUDE.md`, the relevant `docs/adr/*.md`, and `CONTEXT.md` for domain language and constraints.
- List the concrete changes you intend to make (files, modules, interfaces). Surface unknowns and ask before guessing.
- Confirm scope with the user before writing code if the work is non-trivial or the issue leaves room for interpretation.

## 2. Implement

- Make the smallest set of changes that satisfies the acceptance criteria.
- Follow existing patterns in the codebase. Don't introduce new abstractions unless the work calls for them.
- No speculative features, no drive-by refactors.

## 3. Feedback loop

Run all three, fix anything red, re-run until clean:

```sh
pnpm run typecheck
pnpm run test
pnpm run check
```

`pnpm run check` runs Biome (lint + format). For autofixable issues, run `pnpm run check` and re-run `pnpm run check` to confirm clean.

If a check fails, fix the root cause — don't loosen types, skip tests, or disable Biome rules to make them pass. Re-run the full loop after each fix until all three pass.

### If the work added a Supabase migration

If you created or edited a file under `supabase/migrations/`, the change is not live until it's applied to the linked Supabase project. **Don't run `pnpm run db:push` yourself** — it touches shared infra. Instead, in the wrap-up message, tell the user to run it themselves:

```sh
pnpm run db:push    # applies pending migrations to the linked Supabase project
```

Also flag any one-time post-migration data steps the owner needs to do (e.g. `update public.app_settings set allowed_email = '...'`).

## 4. Commit

Stage the relevant files explicitly (no `git add -A`) and commit with a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) message:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- **type**: one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **scope** (optional): the affected area, e.g. `feat(inbox): ...`
- **description**: imperative, lower-case, no trailing period
- **breaking change**: append `!` after type/scope (e.g. `feat!:`) **and** add a `BREAKING CHANGE:` footer explaining the break

Rules:

- **Do NOT add a `Co-Authored-By: Claude` (or any Claude) trailer.** This repo's commits are authored by the human only.
- Do not use `--no-verify`. If a hook fails, fix the underlying issue and create a new commit.
- One logical change per commit. If the work spans multiple concerns, make multiple commits.

Example:

```
feat(inbox): add snooze action with quick-pick options

Implements snooze for "later today", "tomorrow", "next week", and a
custom datetime. Snoozed items leave the default view and reappear
when `snoozed_until <= now()`.

Closes #6
```

## 5. Unblock dependents

After an issue is closed (either by `Closes #N` in the commit landing on the default branch, or manually), find every open issue that lists `#N` under its `## Blocked by` section and edit each one to remove `#N`. If `#N` was the only entry, replace the list with `None`.

```sh
# find candidates
gh issue list --repo geemeows/clearday --state open --search "in:body \"Blocked by\" \"#N\"" --json number,title

# for each match, fetch body, edit the Blocked by line, push back
gh issue view <num> --repo geemeows/clearday --json body -q .body > /tmp/issue.md
# edit /tmp/issue.md: drop "#N" from the Blocked by list (or replace with "None")
gh issue edit <num> --repo geemeows/clearday --body-file /tmp/issue.md
```

Only touch the `## Blocked by` section. Don't reword anything else. If the closed issue isn't yet pushed/merged (so dependents are still legitimately blocked), skip this step.
