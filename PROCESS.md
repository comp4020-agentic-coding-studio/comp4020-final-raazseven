# Process overview

## The app and the brief

[`comp4020-final-raazseven`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven)
is a scorekeeper for friend groups: create a group, get a code, log who beat
who at whatever you play. Each crit added one literal requirement — crit 8
was proof of life (a stranger's trace survives, as them), crit 9 was proof of
life *together* (real-time, with a concurrency decision), crit 10 was proof
the app tells people apart, checked server-side and logged durably. All three
crits are now done; this is the final-project snapshot, written after the
cutoff for crit 10 and the agentic-development work that continued past it.
The question that recurred every week, crit or not, stayed the same: what
does a line actually require once taken literally, not approximately?

## Stack: Node + TypeScript direct, Fastify, node:sqlite

The Dockerfile and `fly.toml` record the decision as built. The course's Fly
setup gives the app one 256MB machine and one volume; the bar is "deployed
and alive," not "scales." Node runs TypeScript directly, Fastify is a few
dependencies, `node:sqlite` is built in — no native module to compile, no
separate database service. The choice has held across every session since:
crit 9 added one dependency (`@fastify/multipart`, for avatar uploads) and
one new file (`src/live.ts`, an in-memory SSE pub-sub); crit 10, the UI
passes, the mini-games, and the witness-confirmation work below each added
schema and routes but no new infrastructure at all.

## Crits 8–10

Crit 8
([`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a))
added real accounts after noticing "find their trace... as them" meant
anyone could log a result as anyone else on the honour-system first pass.
Crit 9
([`b90154f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b90154f),
[`decisions/0001`](decisions/0001-live-update-scope.md),
[`decisions/0002`](decisions/0002-global-accounts.md)) added
membership-gated results, avatars, group matches, and real-time SSE as one
plan, then reversed per-group accounts for global ones mid-crit once that
model stopped surviving contact with how people actually use the app. Crit
10
([`121ed6c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/121ed6c),
[`decisions/0003`](decisions/0003-team-results-and-profile-visibility.md))
added team results and per-person profiles, gated by the *viewer's* current
membership rather than the target's — the server-checked permission
decision the crit asked for — plus durable `audit_log` rows alongside the
live request log. Each crit's own reflection
(`reflections/crit-8.md`–`crit-10.md`) has the breakthrough and the mistake
that shaped it; not restated here.

## Since crit 10: finishing the final project

Five rounds of work landed after crit 10's cutoff, continuing the same app
toward the final submission rather than starting a new feature set:

**A visual pass**
([`2a7a16b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/2a7a16b),
[`a841a4e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/a841a4e)):
a "liquid glass" CSS treatment and a fluid `--page-width`
(`clamp(40rem, 90vw, 100rem)`) replacing three fixed breakpoints that left a
static gutter on anything wider than 1024px.

**Live mini-game challenges**
([`48afeca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/48afeca),
[`decisions/0004`](decisions/0004-mini-game-challenges.md)): Tic-Tac-Toe and
Rock-Paper-Scissors, written from scratch (license reasons). A finished game
logs through the *existing* `addResult()`, no schema change. Rock-Paper-
Scissors needed one real design decision: a choice can't broadcast until
*both* players have chosen, since this app's SSE fragments are
viewer-agnostic by construction.

**Witness confirmation**
([`4ec0c83`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/4ec0c83),
[`decisions/0005`](decisions/0005-witness-confirmation.md)): `README.md` had
named this as deliberately deferred since crit 8. A manually-logged result
can optionally name a third group member as a witness, who confirms or
denies it; denial marks the result disputed, not removed.

**Named-party disputes and logger attribution**
([`b56fd33`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b56fd33),
[`decisions/0006`](decisions/0006-named-party-disputes-and-logger-attribution.md)):
asked directly whether an optional witness was enough, a fuller audit found
the actual winner/loser named in a result had no say over it at all, and
`results` had no `logged_by_user_id` — unlike `group_matches`, which already
tracked who logged a match. Closed additively: every result now shows who
logged it, and any named winner or loser (not just a witness) can raise a
permanent, visible dispute, independent of whether a witness exists. The
logger can't dispute their own submission. Group-vs-group matches remain
unprotected — named in the ADR as the largest gap still open.

**Challenge accept/decline, and a friend stats dashboard**
([`b122c66`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b122c66),
[`decisions/0007`](decisions/0007-minigame-challenge-accept.md)): a mini-game
challenge used to start active immediately, dropping the opponent into a
live match with no warning. It now starts `pending`; the opponent gets a
live "Challenges waiting on you" card and Accept/Decline, reversing part of
`decisions/0004`'s original reasoning once it was clear *trust-based
logging* (a past claim) and *consent to a live match happening now* are
different questions. The pending card's visibility is viewer-specific, which
this app's broadcast mechanism can't target directly (the same limit
Rock-Paper-Scissors hit) — solved with a signal-only event and a client
reload rather than new per-viewer broadcast plumbing. Separately,
`GET /me/stats` aggregates overall and per-game win/loss against every
current friend into one dashboard, instead of checking one profile at a
time; it counts every result regardless of witness/dispute status, same as
the results list always has.

## Process discipline: corrections became rules, not one-off fixes

`CLAUDE.md`'s rules each trace to a real incident, not a guess at what might
go wrong. The session-token rotation rule under Auth is crit 8's logout bug,
where clearing the cookie client-side left a copied token still valid. The
migration rules under Migrations (never drop a column, rebuild instead of
relaxing `NOT NULL`, idempotent markers) are the global-accounts migration
(`decisions/0002`) and the `group_matches` rebuild it required. The
formbody-vs-multipart rule exists because signup, login, and the
group-profile route were each built with manual multipart parsing once, for
no file field any of them had. The real-time rule — check
`spec/live-updates.test.ts`'s existing broadcast before changing how a
result is created — is there because splitting global signup from
group-join once silently dropped the `member` SSE event the old combined
route used to send. The `uniqueName()` test rule and `vitest.config.ts`'s
`fileParallelism: false` both came from one incident: making account names
globally unique broke a dozen tests at once, all reporting as timeouts,
which looked like a server regression until isolating one file separated
the real bug (two spec files reusing the literal name "Priya") from
parallelism noise.

## Verification discipline

`pnpm check` is 85/85 clean as of
[`b122c66`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b122c66).
Every session this project has run has re-verified past what the test suite
alone can show: SSH'ing into the live machine to confirm a migration
actually landed on `/data/app.db`, re-opening the live SSE stream after a
deploy that "wasn't about real-time" to watch a result still arrive on a
second connection, and manual end-to-end `curl` walkthroughs of a new
route (a pending challenge's accept/decline, the stats dashboard's actual
numbers) rather than trusting the render functions in isolation once the
spec suite passed. `research-log/index0.md` is the running account of what
each session actually tried, including the mistakes — this file is the
current snapshot; that one is the history.
