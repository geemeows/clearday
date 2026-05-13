# ISSUES

Issues JSON is provided at start of context. Parse it to get open issues with their bodies and comments.

You've also been passed a file containing the last 10 RALPH commits (SHA, date, full message). Review these to understand what work has been done.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Tracer bullets for new features

Tracer bullets comes from the Pragmatic Programmer. When building systems, you want to write code that gets you feedback as quickly as possible. Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

TL;DR - build a tiny, end-to-end slice of the feature first, then expand it out.

**Exception — redesign work.** If the selected issue has the `redesign` label, or its title starts with `Redesign v`, tracer bullets do **not** apply. Visual ports are wholesale by nature — splitting a page into one-badge-per-commit shipments produces a polish trail, not a redesign.

Prefer one commit per redesign issue: complete the full scope in one pass and ship it as a single commit. The "one logical change per commit" rule in the COMMIT section is overridden — one commit per issue, however large the diff.

If the scope genuinely exceeds one loop, split along **structural boundaries** (e.g. shell → list → detail → builder; or per-tab for tabbed surfaces) and commit each sub-slice with a `RALPH: Slice N.M —` prefix. Pick the largest coherent sub-slice you can finish *and verify clean* (typecheck + tests + biome) this loop, commit it, then leave a progress comment listing the remaining sub-slices. **Never leave a loop with zero commits if a coherent sub-slice is shippable** — a scope-audit comment without a commit is only acceptable when no sub-slice can be landed cleanly (e.g. the shell itself is entangled with the detail pane). State that reason explicitly in the comment when it applies.

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
npx biome check --write <files-you-touched>     # scope to your files only
```

**Do not run `pnpm run check`** during a task. It's `biome check --write .` over the whole repo, which auto-rewrites unrelated legacy files in your working tree — collides with stashes, bloats your diff, and surfaces pre-existing errors that aren't yours to fix. Scope biome to the files you actually changed (paste the list from `git status -s`).

Biome will still flag pre-existing errors in any file you've touched (the pre-commit hook does the same on staged files). When that happens:

- If the fix is a trivial swap that preserves behavior (e.g. `<div role="region">` → `<section>`, dropping a non-load-bearing `role`), make it as part of your commit and note it as a drive-by in the message.
- If the fix is a real refactor (e.g. `<button role="radio">` → `<input type="radio">` would change styling/keyboard semantics), add a narrowly-scoped `// biome-ignore lint/<rule>: <reason>` directly above the offending line and explain why in the commit body.
- Never use `--no-verify` to bypass the hook. Never run `pnpm run check` to "fix it everywhere" — that's a separate cleanup task, not part of feature work.

For typecheck and tests, fix the root cause — don't loosen types, skip tests, or disable Biome rules to make them pass. Re-run the loop after each fix until all three pass.

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
4. Blockers or notes for next iteration

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