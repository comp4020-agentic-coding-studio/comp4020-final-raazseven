# Process overview

## The app and the brief

[`comp4020-final-raazseven`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven)
is a scorekeeper for friend groups: create a group, get a code, log who beat
who at whatever you play. Each crit added one literal requirement: crit 8
was proof of life (a stranger's trace survives, as them), crit 9 was proof
of life *together* (real-time, with a decision about concurrent use), crit
10 is proof the app tells people apart with that decision checked on the
server and logged durably. The same question recurs each week: what does
the spec's wording actually require, once taken literally?

## Stack: Node + TypeScript direct, Fastify, node:sqlite

The Dockerfile and `fly.toml` record the decision as built. The trade-off:
the course's Fly setup gives the app one 256MB machine and one volume, and
the bar is "deployed and alive," not "scales." Node runs TypeScript
directly, Fastify is a few dependencies, `node:sqlite` is built in — no
native module to compile, no separate database service. That choice has
held for three crits without changing: crit 9 added one small dependency
(`@fastify/multipart`) and one file (`src/live.ts`, in-memory pub-sub); crit
10 added no infrastructure at all, only schema and routes.

## Crit 8 and 9, briefly

Crit 8
([`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a))
added real accounts (scrypt password hash, rotating session token) after
re-reading "find their trace still there... as them" and noticing anyone
could log a result as anyone else. Crit 9 added membership-gated results,
avatars, group-vs-group matches, and real-time SSE as one plan rather than
four tickets, because gating logging to real members made a newly-joined
member invisible in open forms until real-time fixed it too —
[`decisions/0001-live-update-scope.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0001-live-update-scope.md)
records what broadcasts and why. Mid-crit-9, per-group accounts were
reversed for global accounts, roles, and a dashboard
([`decisions/0002-global-accounts.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0002-global-accounts.md),
[`b90154f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b90154f)),
a direct reversal of a choice `README.md` had called deliberate — migrated
in place (`members` kept as the migration source, never dropped), deployed
against live data, and re-verified by hand against the production URL
afterward, not assumed from green tests alone.

## Crit 10: team results, profiles, and durable logging

Crit 10 asks for three things together: multi-user distinguishability
(already true from crit 9's global accounts), a server-checked permission
decision written down with why, and server-side logging that outlives the
crit itself.

**Team results.** A result's winner/loser side was exactly one person each.
A new `result_participants` table
([`121ed6c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/121ed6c))
holds one row per person per side, any number per side, backfilled
idempotently from existing results. The original `winner`/`loser` text
columns and `winner_user_id`/`loser_user_id` keep storing the first
name/id per side unchanged, so every pre-existing render path and test
still works for a plain 1v1 — the new table is the full roster only once a
side has more than one person. The log-result form's selects became
`<select multiple>`.

**Profiles, and the permission decision.** A new `GET /u/:id` page shows a
person's head-to-head and teamed-up history with the viewer. The decision,
recorded in
[`decisions/0003-team-results-and-profile-visibility.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0003-team-results-and-profile-visibility.md):
visibility is gated by the *viewer's own current* group membership, not the
target's, checked server-side before any result row is read. I'd first
assumed the natural framing was gating by the target's membership ("can
they let me see this"), but every other permission check in this app —
logging a result against a current member, a removed member disappearing
live — is about who the *acting* person currently is, not a frozen fact.
Gating by the target's membership would mean leaving a group never actually
revokes anything for someone still in it; gating by the viewer's own
membership means it does, the next time the query runs. The named cost: a
viewer who leaves every shared group with someone loses their own view of
real past history, not just the other person's.

**Durable logging.** Crit 10 distinguishes two needs: narration at the crit
(`flyctl logs`, live, with a finite buffer) and a record that outlives it. A
`record()` helper in `src/server.ts` writes both from one call site — a
structured Fastify log line and an `audit_log` SQLite row — at every
mutating route, so the two can't drift apart.

**A real mistake, caught by the test suite, not by care.** Generalizing the
single-id membership check to a set check, I also changed both error
messages' wording without checking `spec/scorekeeping.test.ts` asserted the
originals verbatim — it did, and two previously-green tests broke. The code
was correct; the strings are part of the spec's own contract. Caught by
running the full suite before calling the work done, reverted to the
original wording in the same pass.

**Verification, not assumption.** `pnpm check` is 48/48 clean as of
[`121ed6c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/121ed6c).
After deploy, I confirmed the migration actually ran against production by
SSH'ing into the live machine and checking `result_participants` and
`audit_log` exist on `/data/app.db`, then re-opened the live SSE stream and
watched a result logged from one request arrive on a second, independent
connection — the same real-time check run after every deploy this course,
because "this change is about results and profiles, not real-time" is
exactly the kind of reasoning that's usually right and occasionally isn't.
