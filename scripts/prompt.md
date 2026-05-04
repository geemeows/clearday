# ISSUES

Issues JSON is provided at start of context. Parse it to get open issues with their bodies and comments.

You've also been passed a file containing the last 10 RALPH commits (SHA, date, full message). Review these to understand what work has been done.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Tracer bullets for new features

Tracer bullets comes from the Pragmatic Programmer. When building systems, you want to write code that gets you feedback as quickly as possible. Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

TL;DR - build a tiny, end-to-end slice of the feature first, then expand it out.

3. Polish and quick wins
4. Refactors

If all tasks are complete, output <promise>COMPLETE</promise>.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

# EXECUTION

Complete the task following these conventions:

- Make the smallest set of changes that satisfies the acceptance criteria.
- Follow existing patterns in the codebase. Don't introduce new abstractions unless the work calls for them.
- No speculative features, no drive-by refactors.
- Read `CLAUDE.md`, the relevant `docs/adr/*.md`, and `CONTEXT.md` for domain language and constraints before writing code.

## Feedback loop

Run all three, fix anything red, re-run until clean:

```sh
pnpm run typecheck
pnpm run test
pnpm run check
```

`pnpm run check` runs Biome (lint + format). For autofixable issues, run `pnpm run check` and re-run to confirm clean.

If a check fails, fix the root cause — don't loosen types, skip tests, or disable Biome rules to make them pass. Re-run the full loop after each fix until all three pass.

Every module (FE + BE) ships with tests; never silently drop test coverage to save time.

### If the work added a Supabase migration

If you created or edited a file under `supabase/migrations/`, **don't run `pnpm run db:push` yourself** — it touches shared infra. Instead, flag in the wrap-up that the user needs to run:

```sh
pnpm run db:push
```

Also flag any one-time post-migration data steps (e.g. `update public.app_settings set allowed_email = '...'`).

# COMMIT

Stage the relevant files explicitly (no `git add -A`). The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Rules:

- **Do NOT add a `Co-Authored-By: Claude` (or any Claude) trailer.** This repo's commits are authored by the human only.
- Do not use `--no-verify`. If a hook fails, fix the underlying issue and create a new commit.
- One logical change per commit.

Keep it concise.

# THE ISSUE

If the task is complete, close the original GitHub issue.

If the task is not complete, leave a comment on the GitHub issue with what was done.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.