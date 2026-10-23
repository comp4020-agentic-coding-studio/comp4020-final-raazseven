# 0006: Named-party disputes, and showing who logged a result

## Status

Accepted.

## Context

`decisions/0005-witness-confirmation.md` let a logger optionally name a third
group member as a witness, who can confirm or deny the result. Asked directly
"is it good that anyone can log any result," a fuller audit of
`POST /g/:code/results` (`src/server.ts`) turned up gaps 0005 didn't close:

1. **A witness is optional.** Nothing stops a result from being logged with
   no witness at all — permanent the instant it's submitted, no confirmation
   from anyone.
2. **The people actually named have no say.** The witness — an optional
   third party who may not even have been there — can confirm or deny, but
   the winner and loser *themselves*, the people the result is actually
   about, have no mechanism to object to a result naming them.
3. **Collusion defeats witnessing entirely.** Two members can log a false
   result against a third and have one of themselves (or a friend) stand as
   witness and confirm it. The person actually harmed has no recourse
   anywhere in the app.
4. **No attribution is ever shown.** `results` has no `logged_by_user_id`
   column at all — unlike `group_matches`, which already tracks
   `logged_by_user_id` (`src/db.ts`). The only record of who actually
   submitted a result is a write-only `audit_log` row, never read back to
   any user by any route. A group can't even see who's been doing the
   logging, let alone hold them to it socially.
5. **Team results widen the blast radius for free.** A 2v1 or N-a-side
   result lets one person name several others on a side at once; none of
   them confirm anything either.

Two more gaps were found and are **explicitly not fixed here** (see Cost):
group-vs-group matches (`POST /g/:code/matches`) have no witness or dispute
mechanism at all, and nothing in the app lets a logger correct an honest
mistake short of it looking identical to a malicious one.

## Decision

**`results` gains `logged_by_user_id`** (nullable, additive column, same
migration pattern as every prior addition to this table) — set on every new
result from here on, and shown in the results list next to every row ("logged
by X"). A result logged before this column existed keeps `NULL` and simply
shows no logger, the same graceful fallback every earlier nullable column on
this table already uses.

**A new table, `result_disputes` (`id`, `result_id`, `disputed_by_user_id`,
`created_at`)** — one row per person who disputes a result. Closes gaps 1–3
directly: **any winner or loser actually named in a result can dispute it**,
not just an optional witness, and not gated on a witness having been named at
all. The person who logged the result can't dispute their own submission
(closes the trivial self-serving case). Unlike witness confirmation,
disputing isn't a one-shot decision between two fixed states — it's
append-only: each named party who objects adds their own row, and the result
simply shows "disputed by N of M named participants" alongside whatever the
(optional) witness says. No resolution step, no quorum, no removal — the
same "never delete, never silently resolve away a disagreement" posture
`decisions/0005` already established for a witness's denial, extended to
every participant instead of only the witness.

This applies to **every** row in `results`, including mini-game auto-logs
(`src/server.ts`'s `POST /g/:code/games/:id/move`) — the dispute mechanism
lives on the table, not the route, so it comes for free everywhere
`addResult()` is already called, the same way witness confirmation did.

**Both changes are purely additive**: nothing about the existing
witness-confirmation flow changes, nothing about how a result is logged
changes (still one form, still frictionless, still no required
confirmation up front) — the only new thing is that a named party now has
somewhere to go *after* the fact, and a passerby can now see who logged
something.

## Options considered

1. **Make a witness mandatory on every result (rejected).** Breaks the
   explicit frictionless-logging goal `README.md` states as this app's
   central definition of "good" ("make logging a result effortless enough
   that people actually do it"), and still wouldn't close gap 2 or 3 — a
   mandatory witness can still collude, and still leaves the actual
   winner/loser with no direct say.
2. **Let only the witness dispute, same as today, and leave it there
   (rejected).** This is what 0005 already does, and it's exactly the
   design this ADR's context section shows is insufficient: the two people a
   result is actually *about* remain the only ones with no mechanism to
   object to being named in it at all.
3. **A resolution/voting step (e.g. majority of named participants must
   agree, or a dispute removes the result) (rejected).** Adds a quorum
   concept and a removal path nothing else in this app has, and conflicts
   with "never drop a row to resolve a disagreement" — the same reasoning
   0005 used to reject deleting a denied result. A dispute is information
   worth keeping, visible forever, not a vote that erases the record either
   way.
4. **Any named party can add a permanent, visible dispute; logger
   attribution shown on every row (chosen).** Closes the actual gap (the
   named parties, not just an optional bystander, have recourse) without
   adding friction to logging itself, and without inventing a resolution
   mechanism this app has no other precedent for.
5. **Extend the same dispute mechanism to group-vs-group matches
   (considered, deferred — see Cost).** `group_matches` has no witness
   precedent at all and is a structurally different table (two groups, a
   final score, not individual participants) — in scope for a *later*
   change, not bundled into this one, matching this project's own pattern of
   scoping cuts (0004, 0005) rather than fixing every gap in one pass.

## Cost

**Group-vs-group matches remain fully unprotected.** Any member of group A
can log any score against group B with zero involvement from anyone in
group B — arguably the single largest remaining gap this audit found, left
open because `group_matches` has no existing witness/participant precedent
to extend and fixing it well is a separate, larger design (whose membership
gets to dispute a match that isn't about named individuals at all, but about
two whole groups). Named here so it isn't mistaken for an oversight.

**Disputing doesn't resolve anything.** A result with three disputes against
it still displays as a normal row in the list, just with a visible dispute
count — there's no escalation, no removal, no group-level "this is now
void" state. The social fabric (as Shirky's "Situated Software," cited in
`README.md`, argues) is still what actually settles the disagreement; the
app's job is only to make the disagreement visible and permanent, not to
adjudicate it.

**A result can still be screenshotted and shared before anyone disputes
it.** Logger attribution and dispute visibility don't change the timing —
the result still displays immediately on logging, same as before. This was
true before this change and is unchanged by it; a "pending until confirmed"
display mode was considered and rejected for the same reason 0005 rejected
hiding a pending result: it would mean the group's own "see it live" feed no
longer shows the newest result as it's logged, which is the thing this app's
whole real-time requirement (crit 9) exists to guarantee.

**An honest typo looks identical to a malicious fabrication once disputed.**
There's still no edit path for a logged result — a typo in the game name or
an honestly-misremembered winner gets the same "disputed" treatment as a
deliberate lie, because the app has no way to distinguish intent. Accepted
as consistent with this app's existing no-edit, no-delete posture
(`CLAUDE.md`: never drop data) rather than solved here.
