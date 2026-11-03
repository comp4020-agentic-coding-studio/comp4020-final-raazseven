# Process overview

## The app and the brief

[`comp4020-final-raazseven`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven)
is a scorekeeper for friend groups: create a group, get a code, log who beat
who at whatever you play. Each crit added one literal requirement — crit 8
was proof of life (a stranger's trace survives, as them), crit 9 was proof of
life *together* (real-time, with a concurrency decision), crit 10 was proof
the app tells people apart, checked server-side and logged durably. All three
are done; this is the final-project snapshot, written after crit 10's cutoff
and the agentic-development work that continued past it. The question that
recurred every week, crit or not, stayed the same: what does a line actually
require once taken literally, not approximately?

## Stack: Node + TypeScript direct, Fastify, node:sqlite

The Dockerfile and `fly.toml` record the decision as built. The course's Fly
setup gives the app one 256MB machine and one volume; the bar is "deployed
and alive," not "scales." Node runs TypeScript directly, Fastify is a few
dependencies, `node:sqlite` is built in — no native module, no separate
database service. The choice has held since: crit 9 added one dependency
(`@fastify/multipart`, for avatar uploads) and one new file (`src/live.ts`,
an in-memory SSE pub-sub); crit 10 and everything below added schema and
routes but no new infrastructure at all.

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

Ten rounds of work landed after crit 10's cutoff, continuing the same app
toward the final submission rather than starting a new feature set. Each has
its own ADR (`decisions/0004`–`0011`); summarized briefly here, not restated:

a "liquid glass" visual pass and a fluid page width
([`2a7a16b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/2a7a16b));
**live mini-game challenges**, Tic-Tac-Toe and Rock-Paper-Scissors logging
through the existing `addResult()`
([`decisions/0004`](decisions/0004-mini-game-challenges.md)); **witness
confirmation**, an optional third member who confirms or denies a manually-
logged result
([`decisions/0005`](decisions/0005-witness-confirmation.md)); **named-party
disputes and logger attribution**, letting the actual winner/loser (not just
a witness) raise a permanent dispute, after an audit found they'd had no say
at all
([`decisions/0006`](decisions/0006-named-party-disputes-and-logger-attribution.md));
**challenge accept/decline** plus **a friend stats dashboard**
([`decisions/0007`](decisions/0007-minigame-challenge-accept.md)); **a
site-wide notification popup** reaching any page, not just the one group's
([`decisions/0008`](decisions/0008-site-wide-challenge-notification.md)).

**A real race condition, found by reproducing it, not guessing**
([`decisions/0009`](decisions/0009-challenge-ping-no-longer-reloads-the-page.md)):
accepting a challenge sometimes left the acceptor on the group page instead
of the game — the accept route's own broadcast raced the acceptor's own
navigation. Reproduced with two real browser contexts, fixed with a
fetch-and-swap instead of `location.reload()`, re-verified 5/5 clean.

**A phone-width layout bug**
([`838b66a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/838b66a)),
found testing real phone viewports: two player names in an unguarded flex
row overflowed a 390px viewport by 150px, fixed with `flex-wrap` and
`min-width: 0`. Added as a new `CLAUDE.md` rule.

**Forfeiting, and telling the challenger what happened to their own game**
([`decisions/0010`](decisions/0010-forfeit-and-challenger-notification.md)):
reported that the challenger never found out their challenge was accepted
unless they stayed on the exact game page — reproduced with two browsers,
confirmed the per-user notification only ever told the *opponent*, never the
challenger. Fixed by notifying both, and added the other half of "a
mini-game is a real result": an explicit Forfeit button, plus an automatic
forfeit after a 30-second grace period on a dropped connection (long enough
to survive a refresh, short enough to resolve a real departure) — both log
through the same `addResult()` a normal win uses. A follow-up caught the
popup's "View game" button never calling the route that marks its notice
seen — fixed by routing it through the same acknowledge call as "Dismiss,"
which also surfaced a real crash (`req.body` is `undefined`, not `{}`, for
a request with no body at all).

**A mini-game result can't be disputed; a manual result can record a draw**
([`decisions/0011`](decisions/0011-minigame-results-never-disputable-draws-logged.md)):
`decisions/0006`'s dispute mechanism fit a possibly-false human claim, not a
mini-game's server-computed result, so that one's dispute button never
renders and the route rejects it server-side regardless, checked ahead of
any eligibility rule so it's uncontestable by construction. Separately,
`results` gained a real draw, closing the gap `decisions/0004` had
explicitly left open. Checked with the person first that neither change
would touch `research-note.md`'s argument before building either.

## Process discipline: corrections became rules, not one-off fixes

`CLAUDE.md`'s rules each trace to a real incident, not a guess at what might
go wrong. The session-token rotation rule under Auth is crit 8's logout bug,
where clearing the cookie client-side left a copied token still valid. The
migration rules (never drop a column, rebuild instead of relaxing
`NOT NULL`, idempotent markers) are the global-accounts migration
(`decisions/0002`) and the `group_matches` rebuild it required. The
formbody-vs-multipart rule exists because signup, login, and the
group-profile route were each built with manual multipart parsing once, for
no file field any of them had. The real-time rule — check
`spec/live-updates.test.ts`'s existing broadcast before changing how a
result is created — exists because splitting global signup from group-join
once silently dropped the `member` SSE event the old combined route sent.
The `uniqueName()` test rule and `vitest.config.ts`'s `fileParallelism:
false` both came from one incident: globally-unique names broke a dozen
tests at once, all reporting as timeouts, which looked like a server
regression until isolating one file separated the real bug (two spec files
reusing the literal name "Priya") from parallelism noise.

## Verification discipline

`pnpm check` is 117/117 clean as of
[`8bbee24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/8bbee24).
Every session has re-verified past what the test suite alone can show:
SSH'ing into the live machine to confirm a migration landed on
`/data/app.db`, re-opening the live SSE stream after a deploy that "wasn't
about real-time," race conditions reproduced with two real browser contexts
rather than assumed from reading the code (an accept-redirect race, an
automatic-forfeit timer against a genuine 30-second wait), and a full pass
on real phone emulation rather than a resized desktop window.
`research-log/index0.md` is the running account of what each session
actually tried, including the mistakes — this file is the current snapshot;
that one is the history.
