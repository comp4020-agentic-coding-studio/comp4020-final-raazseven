# 0004: Mini-game challenges, logged like any other result

## Status

Accepted (built in session, after crit 10). Low priority, not tied to a
specific crit's checkable spec line.

## Context

The person asked for a way to challenge another player to a small live game
(tic-tac-toe, rock-paper-scissors, connect-four) from inside the app, with
the outcome logged the same way a real-world result is today. The first
version of the idea was to pull an existing game's code from GitHub rather
than write one from scratch.

That first version has two problems. License-wise, anything GPL-licensed
would pull the whole app under copyleft, so only a permissively-licensed
project (MIT, BSD, Apache) would actually be usable without changing this
app's own licensing — and even then, its attribution requirement has to be
kept somewhere. Practically, for a game this small (tic-tac-toe or
rock-paper-scissors is well under 150 lines of actual logic), finding a
suitably-licensed repo, reading through its code to confirm it's safe to
run, and then reshaping it to fit this app's existing SSE/result-logging
pattern is realistically more work than writing the logic directly — and
writing it directly sidesteps the license question entirely.

## Decision

Both games (Tic-Tac-Toe and Rock-Paper-Scissors) were written from scratch
in `src/minigames.ts`, with a challenge starting immediately on creation —
no invite/accept step, matching this app's existing trust-based logging
model (any member can already log a result against any other member on
trust alone; a mini-game challenge is no different).

**No schema changes.** A finished game's outcome is logged through the
*existing* `addResult()` (`src/db.ts`), exactly like a manually-logged
result — `game` is just set to `"Tic-Tac-Toe"` or `"Rock-Paper-Scissors"`.
In-progress board state lives only in an in-memory `Map`
(`src/minigames.ts`), the same durability tradeoff `src/live.ts`'s own
listener registry already makes — it doesn't need to survive a restart, only
the final result does.

**Reuses `src/live.ts` as-is**, widened by one additive change: `LiveEvent`'s
`type` union gained `"board"`. `subscribe`/`broadcast` already keyed on an
arbitrary string, not specifically a group code, so a per-game channel
(`` `game:${sessionId}` ``, `channelFor()`) is just another key in the same
`Map` — no change to the pub-sub mechanics themselves.

**A finished mini-game result also broadcasts on the group's own existing
channel** (`{ type: "result", html: resultsListFragment(...) }`), the exact
broadcast `POST /g/:code/results` already sends — so a mini-game win updates
the group's live results feed the same way a manually-logged result does,
without a reload, satisfying CLAUDE.md's standing rule to check
`spec/live-updates.test.ts`'s existing broadcast expectations before
changing how a result gets created.

**Draws aren't logged as results.** `results` has no draw concept, and
extending it was out of scope here — a tied Rock-Paper-Scissors round or a
full Tic-Tac-Toe board end the game (shown on the game's own page) but log
nothing to the group's results feed. A known simplification, not an
oversight.

**Rock-Paper-Scissors hides each player's choice until both have chosen.**
`src/live.ts` broadcasts one HTML string to every subscriber equally — there
is no per-viewer tailoring anywhere else in this app's broadcasts either
(`resultsListFragment`, etc., are all viewer-agnostic) — so revealing a
choice the instant it's made would let the second player simply wait for the
live update before picking, trivially beating their opponent every time.
The fix: the per-game channel only broadcasts once *both* players have
chosen (`applyMove`'s `justFinished`); before that, each player's own page
load privately shows only their own choice (or none), computed server-side
from `currentUser(req)`, and the opponent's pending choice is never sent
over the wire to anyone, including a third member just watching. Tic-Tac-Toe
has no hidden information, so it broadcasts after every move, the same way
`resultsListFragment` already does.

**Moves are plain POST-redirect-GET forms**, not a JS click handler — a
filled-in `<form>` per empty cell for Tic-Tac-Toe, three submit buttons for
Rock-Paper-Scissors. Consistent with every other mutating action in this
app; the live aspect for the *non-acting* player comes entirely from the
existing SSE-swap script pattern, not from how the acting player's own
request round-trips. An off-turn or already-resolved move is rejected
server-side regardless of what the page happened to render, the same
client-renders-the-affordance / server-re-checks-the-rule pattern the
owner-only "Remove member" button already uses.

## Options considered

1. **Pull an existing open-source implementation from GitHub.** Rejected:
   license-compatible options exist (MIT/BSD/Apache), but vetting and
   re-fitting one costs more than writing the handful of game rules
   directly, for no real benefit at this size.
2. **Write the game logic from scratch, reuse existing SSE/result
   infrastructure for the challenge flow and logging (chosen).** No license
   question, and the only genuinely new code is the live
   challenge/play/reveal flow — the part that was never going to come from a
   GitHub repo anyway.
3. **An invite/accept step before a challenge starts.** Considered, more
   realistic. Rejected for this first pass: it adds a pending state and a
   second round of live updates (an invite notification, then a start
   event) for a feature that's explicitly low-priority — logging a result on
   trust, with no confirmation step, is already this app's existing model
   for every other kind of result.
4. **Broadcast a Rock-Paper-Scissors choice the moment it's made.**
   Rejected: this app's broadcast mechanism has no concept of a
   per-recipient payload, so the only way to keep a choice secret from one
   specific viewer while revealing other state to them is to not reveal it
   to anyone until it's safe for everyone — deferring the broadcast until
   both players have chosen, rather than adding per-viewer broadcast
   plumbing that nothing else in this app needs.

## Cost

A Rock-Paper-Scissors round genuinely can't show a player's own choice
live — they have to reload or wait for their own next page load to see it
echoed back, since nothing broadcasts until both choices are in (their own
`POST` response shows it immediately; a second device open to the same game
would not, until the round resolves). Draws for either game aren't visible
anywhere once the game page is closed, since they never reach `results` —
accepted as consistent with "a mini-game's outcome is a result, and a draw
isn't a result," not treated as a bug to fix here. In-memory-only game state
means an app restart mid-game loses any in-progress board (not the group's
actual results, which are already durable) — acceptable for a feature this
low-priority, the same tradeoff an open SSE connection already carries.
