# 0007: A mini-game challenge needs accepting before it starts

## Status

Accepted. Reverses part of `decisions/0004-mini-game-challenges.md`.

## Context

`decisions/0004` deliberately skipped an invite/accept step for mini-game
challenges, reasoning that it matched "this app's existing trust-based
logging model (any member can already log a result against any other member
on trust alone; a mini-game challenge is no different)." In practice this
meant `POST /g/:code/games` created a session at `status: "active"`
immediately, with **no notification of any kind** to the opponent — not a
broadcast, not an entry anywhere on the group page, nothing. The only way the
opponent ever found out they'd been challenged was to already be sitting on
the exact game URL, which nothing ever gave them, or to be told outside the
app.

Asked directly, this is a different kind of gap than the one
`decisions/0004` was weighing. That ADR's reasoning was about *logging on
trust* — the same reasoning that lets anyone log a manual result against
anyone else, later made more accountable by
`decisions/0005-witness-confirmation.md` and
`decisions/0006-named-party-disputes-and-logger-attribution.md`. A mini-game
challenge is not a record of something that already happened; it's an
invitation to *do* something live, right now, with a second real person. The
trust-based logging model is about whether a past claim should be
believable — it was never an argument for dropping someone into an active
match with no say in the matter, which `decisions/0004`'s "no different"
framing conflated.

## Decision

`MinigameSession.status` gains a third value: `"pending"`. A challenge is
created `pending`, not `active`. While pending:

- No move is accepted — `applyMove()` rejects with "this challenge hasn't
  been accepted yet," the same validate-then-reject shape every other
  illegal move already uses.
- The game page shows **"Accept" / "Decline"** buttons to the challenged
  opponent, and **"waiting for X to accept"** to the challenger (and anyone
  else watching).
- **A new "Challenges waiting on you" card appears on the group page** for
  anyone who's been challenged and hasn't answered yet — this is the actual
  fix for "no way to discover you've been challenged." Unlike every other
  live update in this app, this one is *viewer-specific*: whether the card
  shows anything at all depends on who's looking, the same problem
  Rock-Paper-Scissors's hidden choice (`decisions/0004`) ran into, since
  `src/live.ts` broadcasts one shared HTML fragment to every subscriber on a
  channel, with no per-recipient payload concept. A signal-only `"challenge"`
  event (no HTML, just a ping) broadcasts on the group's *existing* channel
  when a challenge is created, accepted, or declined; the client reloads the
  page on receiving it. A full reload (not a targeted `innerHTML` swap) is
  the deliberate choice here, for the same reason `decisions/0004` rejected
  adding per-viewer broadcast plumbing: this app has no other mechanism for
  "send different HTML to different subscribers of the same channel," and
  inventing one for a single, low-frequency event (a challenge is created or
  answered far less often than a result is logged) isn't worth the new
  machinery. Anyone with the group page open sees the new challenge (or its
  resolution) within about a second either way, which is what crit 9's
  real-time bar actually asks for — it just costs a full reload instead of a
  surgical one.

Accepting flips `status` to `"active"` and the game starts exactly as it did
before this change — same board, same move validation, same win-logging.
Declining flips `status` to `"declined"`: the game page shows "X declined,"
the pending-challenges card drops it, and **nothing is logged** — consistent
with how a draw was already never logged (`decisions/0004`'s own "draws
aren't results" decision). Only the challenged opponent can accept or
decline; the challenger hitting either route is rejected the same way a
non-player's move already is.

## Options considered

1. **Leave it as-is, immediate start (status quo, rejected).** This is
   exactly the gap raised: a player can be dropped into an active game with
   no notice and no consent.
2. **Notify but don't gate** — broadcast a "you've been challenged" message
   but let the game start immediately regardless (rejected). Doesn't solve
   the actual complaint (being dropped into a live match without agreeing to
   it) — it only makes the drop-in slightly less silent.
3. **A full invite/accept state machine with expiry, same as the originally
   considered design `decisions/0004` rejected (chosen, narrowed).** 0004
   rejected this specifically because it "adds a pending state and a second
   round of live updates... for a feature that's explicitly low-priority."
   That reasoning doesn't hold once the actual complaint is about consent,
   not polish — accepting a bit more complexity here is the direct fix for a
   real gap, not a nice-to-have. Narrowed from 0004's original framing by
   reusing the group's *existing* SSE channel for the notification (no new
   channel, no new `LiveEvent` type) and skipping expiry (a pending
   challenge is swept by the same `sweepStaleSessions()` age-based cleanup
   every session already has, not a new mechanism).

## Cost

A pending challenge sits unseen if the opponent never opens the group page
and isn't told some other way — there's still no push notification outside
the app itself (email, etc.), only a live in-app card. Declining is final:
there's no "challenge again" shortcut, the challenger has to submit a fresh
challenge through the normal form. This mirrors every other action in this
app (no edit, no retry path) rather than inventing a new one for this
feature alone.
