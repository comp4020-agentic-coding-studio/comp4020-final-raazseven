# 0005: Witness confirmation for logged results

## Status

Accepted (built in session).

## Context

README.md flagged this as deliberately deferred: "Right now any result can be
logged on trust. Confirmation by a third friend is next week's build, once
logging itself is solid." Every result — a manual `POST /g/:code/results`, a
group-vs-group match, and (since `decisions/0004-mini-game-challenges.md`) a
mini-game's auto-logged outcome — is written immediately and irreversibly on
the word of whoever submits it. The person asked for a way to name a third
group member as a witness when logging a result, who can then confirm or deny
what was logged.

## Decision

**Witness is optional, on manually-logged results only.** The "log a result"
form (`logResultCard` in `src/pages.ts`) gets one more field: an optional
witness `<select>` of the group's other members. Not naming one keeps logging
exactly as trust-based as it always was — `results.witness_status` defaults
to `'none'`, and nothing about that path changed. Mini-game auto-logged
results and group-vs-group matches are untouched; naming a witness for those
is out of scope here, same as the invite/accept step 0004 rejected for the
same reason (keeping the change small and additive).

**Additive schema only** (`src/db.ts`), per `CLAUDE.md`'s migration rules —
`results` gains two nullable/defaulted columns, no table rebuild needed since
neither is `NOT NULL` without a default:

- `witness_user_id INTEGER REFERENCES users(id)` — who was named, or `NULL`.
- `witness_status TEXT NOT NULL DEFAULT 'none'` — `'none' | 'pending' |
  'confirmed' | 'disputed'`. A result logged before this feature shipped, or
  with no witness named, lands on `'none'` and renders no badge at all.

**The witness is just another group member**, not a new kind of account —
`memberships` already models "who's in this group"; the witness picker is the
same `memberOptionsFragment`-style list the winner/loser selects use, filtered
to exclude whoever's already a winner or loser on that result (vouching for
your own result defeats the point — enforced server-side in `POST
/g/:code/results`, not just left to the dropdown).

**A new route, `POST /g/:code/results/:id/witness`**, takes `decision` =
`"confirm"` or `"deny"`. Only the user named in `witness_user_id` can call it,
and only while `witness_status` is still `'pending'` — both checked
server-side (`src/db.ts`'s `setWitnessStatus`, which re-checks both
conditions itself, not just the route, so it's safe to call on its own).
Denying never deletes the result (`CLAUDE.md`: never drop data to work around
a disagreement) — it flips to `'disputed'` and stays fully visible, same row,
same place in the list.

**Reuses the group's existing broadcast, no new `LiveEvent` type.** A
confirm/deny re-broadcasts `{ type: "result", html: resultsListFragment(...) }`
on the group's own SSE channel — the exact event `spec/live-updates.test.ts`
already asserts on for a fresh result, so a witness's decision updates
everyone's open group page live the same way logging the result did in the
first place. `resultsListFragment` takes an optional `viewerId` now, so the
confirm/deny buttons render only for the one viewer who's actually allowed to
use them; everyone else (including the winner and loser) sees a plain status
pill (`witness-pill`/`witness-pending`/`witness-confirmed`/`witness-disputed`
in `src/styles.ts`).

## Options considered

1. **A separate `pending_results` table, promoted to `results` on
   confirmation (rejected).** Would have meant the two existing call sites
   that write to `results` (`POST /g/:code/results`,
   `POST /g/:code/games/:id/move`'s auto-log) write somewhere else entirely
   when a witness is involved, and every reader of `results` would need to
   know to also check the pending table. Two columns on the existing table is
   smaller and keeps `results` as the one place a result ever lives, logged or
   not yet confirmed — consistent with "never drop a column or table" cutting
   the other way too: don't fork the table either.
2. **Require a witness on every result (rejected).** Breaks the existing
   trust-based flow outright and every spec file that logs a result without
   naming one (`scorekeeping.test.ts`, `minigames.test.ts`,
   `live-updates.test.ts`). Optional-by-default is the smaller, backwards
   compatible change.
3. **Remove a denied result from the results list (rejected).** Same
   objection as 0004's own cost section about not inventing new ways to lose
   data — a dispute is itself information worth keeping, not a reason to make
   the result disappear.
4. **Extend witness confirmation to mini-game auto-logged results and
   group-vs-group matches too (deferred, not rejected).** Both call `addResult`
   / write their own table the same trust-based way; adding a witness picker
   to the mini-game challenge form or the group-match form is a natural
   follow-up, kept out of this first pass to match the brief's "manually
   logged results only" scope and keep this change reviewable on its own.

## Cost

A pending result still shows up in the results feed immediately (not hidden
until confirmed) — if that's wrong for a group that wants bragging rights to
wait on confirmation, this cost would need revisiting, but immediate
visibility matches how every other result already works here and was the
smaller change. A witness who never answers leaves a result `'pending'`
forever — there's no reminder, timeout, or escalation; the record simply
carries a visible "awaiting X's word" pill until someone acts (or doesn't).
Only the manual-logging path got a witness field — a mini-game win or a
group-vs-group match still logs on trust alone, which is an intentional scope
cut (see options above), not an oversight.
