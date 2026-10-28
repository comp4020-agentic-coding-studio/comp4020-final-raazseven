# 0008: A pending challenge has to reach you anywhere in the app, not just that group's page

## Status

Accepted. Extends `decisions/0007-minigame-challenge-accept.md`.

## Context

`decisions/0007` fixed the worst part of the original gap — a challenge no
longer starts active with zero notice — but its fix was scoped to one
group's own page: the "Challenges waiting on you" card, and the live
`"challenge"` ping that refreshes it, both only ever reached someone who was
*already looking at that specific group's page* at the time. Asked directly
whether that's good enough, it isn't: a challenged person on their `/me`
dashboard, on a different group's page, or on another mini-game's page gets
no signal at all. They'd only ever see it by independently navigating back
to the one group where the challenge happened — which is exactly the
"nothing tells you unless you already happen to be in the right place"
problem 0007 set out to fix, just moved one page over instead of solved.

Separately, the plain card itself (sitting in the page's left-hand actions
column) is easy to miss even when it does render — nothing calls attention
to it the way an actual popup would.

## Decision

**A new per-user SSE channel**, `GET /me/events`, subscribed by the signed-in
user's own id (`channelFor` in `src/minigames.ts` is keyed by game id; this
is the same pattern, keyed by user id instead — `userChannelFor(userId)`
returns `` `user:${userId}` ``, just another string key in `src/live.ts`'s
existing `Map`, no change to the pub-sub mechanism itself). `POST
/g/:code/games` broadcasts a signal-only `"challenge"` ping on the
*challenged opponent's own* channel, in addition to the group's existing
channel from 0007 (which still drives that group's own in-page card for
anyone already looking at it — 0007's fix isn't removed, it's joined by a
second one that doesn't depend on being on the right page).

**Every page now opens this connection.** `layout()` — the one function
every page in this app is rendered through — gets a small script, active
whenever a user is signed in: it opens `/me/events` once, and on a
`"challenge"` event (or on page load, if any challenge is already pending)
shows a `<dialog>` popup: the challenger's name, the game, and Accept/Decline
buttons that post straight to the existing accept/decline routes. This
reaches the challenged person wherever they are in the app — `/me`, a
different group, mid-profile-browse — not just the one group's page.

**Accepting redirects straight into the game**, same as before — the
existing accept route's `303` to the game page is unchanged; the popup is
only about *discovering* the challenge, not a new way of answering it.

## Options considered

1. **Leave it scoped to the one group's page (status quo as of 0007,
   rejected).** This is exactly the gap raised: real notification only for
   whoever happens to already be looking at the right place.
2. **Broadcast on every group the opponent is in, and have every group page
   check every other group for pending challenges (rejected).** Would mean
   every group page's render has to query every *other* group's pending
   challenges against the current viewer, turning a one-group page into an
   implicit account-wide query — the per-user channel does the same job
   without making every group page implicitly about every group.
3. **A per-user channel, checked from every page via `layout()` (chosen).**
   Mirrors the existing per-game channel pattern (`channelFor`) exactly, just
   keyed by person instead of game — no new pub-sub mechanism, only a new
   key shape and one new subscribe point.
4. **Push notifications outside the browser tab (email, a service worker
   push) (rejected, out of scope).** This app has no notification
   infrastructure of any kind outside an open SSE connection in an open tab —
   adding a service worker or an email send is a much larger change for a
   feature whose brief was "notify them inside the app," not "notify them
   even when the app isn't open." If a challenged person's browser tab is
   closed entirely, they still only find out on their next visit (the
   on-load pending-challenge check), the same limitation 0007 already
   accepted for the in-page card.

## Cost

Every signed-in page view now opens one more SSE connection (on top of the
group-page one, when applicable, and the per-game one on a game page) —
three concurrent long-lived connections is the worst case (a signed-in user
on a group page that also happens to be a game page, though those are two
different URLs so this doesn't actually happen in practice; the real worst
case is two, group + per-user). Acceptable on the same basis every other SSE
connection in this app already is: one 256MB machine, no horizontal scaling,
in-memory `Set`s per channel key, nothing that scales with anything other
than concurrently open tabs. A challenged person whose browser is closed, or
who has no tab open at all, still only finds out the next time they load any
page in the app — there is still no notification that reaches outside an
open connection, which was never in scope here.
