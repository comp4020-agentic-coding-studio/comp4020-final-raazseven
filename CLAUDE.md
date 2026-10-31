# Your harness

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What follows are rules this project has actually needed more than once ---
added when something real broke, not written in advance.

## Migrations

- Never drop a column or table. Prefer `ALTER TABLE ... ADD COLUMN` for
  additive changes, over a table that already has real data in it.
- SQLite can't relax a `NOT NULL` column via `ALTER TABLE`. When that blocks
  an additive change, rebuild instead: rename the table, create the new
  shape, copy the rows across, drop the renamed original. Don't drop data to
  get around the constraint.
- Make migrations idempotent (a `migrated_*` marker column, or an equivalent
  check) so re-running startup on an already-migrated database is a no-op,
  not a re-run of the same work.

## Auth

- Login/logout rotates the session token server-side, not just the
  client-side cookie. A stale or copied cookie has to stop working the
  instant the token rotates, not just once someone's browser forgets it.

## Routes and request bodies

- Don't reach for multipart parsing on a route with no file field --- use
  the already-registered `formbody` plugin for plain forms. (Signup, login,
  and the group-profile-edit route all did this wrong once, caught on
  review before it shipped.)
- A repeated form field with one `name` (several same-named checkboxes, for
  instance) has to be read as an array. Reading it as a single value
  silently keeps only the last one submitted.

## Real-time (SSE)

- Before changing how a result, match, or member gets created, check what
  `spec/live-updates.test.ts` expects to still broadcast. Splitting one
  route into two (e.g. a combined register-and-join becoming a separate
  signup plus a join step) is exactly the shape of change that silently
  drops a broadcast call if you don't check the existing test's
  expectations against the new code path.
- After any deploy that touches schema, auth, or routing --- not just a
  feature that looks unrelated to real-time --- re-verify the real-time
  requirement specifically against the live URL: open the SSE stream, log a
  result from a second request, confirm it arrives. Don't assume a change
  "about accounts, not broadcasting" couldn't have touched it.

## Tests

- Every file in `spec/` runs against one shared dev server and one SQLite
  file for the whole suite. If a value needs to be unique for the test to
  mean anything (a name, say), generate it uniquely inside the test helper
  (see `spec/support.ts`'s `uniqueName()`) rather than hardcoding a literal
  that another spec file might also use.
- Before treating a pile of failing tests as a real regression, isolate the
  single most-likely-broken file and run it alone first. Several tests
  reporting `Error: Test timed out in 5000ms` at once, across files that
  share one server, is usually parallelism contention, not a server bug ---
  confirm with `--no-file-parallelism` before chasing a phantom timeout.
  (`vitest.config.ts` now runs spec files one at a time for exactly this
  reason, once the real bug underneath the noise was found and fixed.)

## CSS / layout

- A broad element rule (`form { flex-direction: column }`, for instance) can
  leak straight through a more specific class that only overrides some of
  its properties. When a layout looks wrong, check the actual computed
  style, not just the rule you meant to apply.
- A grid track like `1fr 1fr` has no floor --- use `minmax(0, 1fr)` so a
  column can shrink below its content's natural width instead of blowing
  out its container.
- `<input>` is `inline-block` by default. Don't rely on it happening to be a
  flex child for full width; set `width: 100%` explicitly.
- A flex row holding unconstrained text (a real account name, no length
  limit) needs both `flex-wrap: wrap` on the container and `min-width: 0` on
  the text item --- a flex item's default `min-width: auto` stops it
  shrinking below its content's natural width, so without the override a
  long name pushes the row past the viewport on a narrow phone instead of
  wrapping. Test at actual phone widths (≤390px), not just by resizing a
  desktop browser window, since the failure is specific to how little room
  there is to shrink into.

## Documentation discipline

- A decision worth writing down as an ADR (`decisions/`) gets one: context,
  options considered, the decision, its cost. `PROCESS.md` and `README.md`
  link to it rather than restate it --- ADRs don't count against
  `PROCESS.md`'s word budget, restating them would.
- `PROCESS.md` describes the project **as it stands**, rewritten at each
  crit, not appended to --- 900--1100 words for the final project. If it's
  grown past that, the fix is cutting it down to a current snapshot, not
  adding another section.
- `PROCESS.md` is drafted by the person, not generated wholesale by the
  agent. The agent's job on it is gap-checking against the brief and the
  repo's actual state (commits, test counts, deploy status) --- not
  authoring the narrative.

## Session research log

- `research-log/index0.md` is a running, append-only log of what got
  researched or learned in each session --- new techniques tried, gotchas
  hit, patterns discovered --- one dated entry per session, newest at the
  bottom. This is distinct from `PROCESS.md` (a rewritten project snapshot)
  and `reflections/crit-N.md` (the person's own two standing prompts about
  their growth as a developer) --- neither of those gets touched by this
  rule.
- Before the first `git push` of a session (i.e. when the user says to push
  the code), the agent appends a new entry to `research-log/index0.md`
  summarizing that session's work and anything learned, as its own commit
  before the push. If the file doesn't exist yet, create it.
- The agent does not auto-write `PROCESS.md` or `reflections/crit-N.md` on
  push. Instead, as part of the same pre-push pass, it checks both against
  what actually happened this session and flags --- in the chat, not by
  editing the files --- anything that looks stale or missing, for the person
  to fold in themselves.
