# 0009: A "challenge" live ping stopped reloading the whole page

## Status

Accepted. Fixes a real bug in `decisions/0007`'s implementation.

## Context

Reported directly: accepting a challenge sometimes left the accepting
player back on the group page instead of the game page, even though the
server's `POST /g/:code/games/:id/accept` route correctly answered with a
`303` redirect to the game. Reproduced with two real headless-Chromium
browser contexts (not just HTTP assertions) — the redirect fires every
time, but the browser sometimes lands back on the group page anyway.

The cause: the group page's own `liveScript` (`src/pages.ts`) handled a
`"challenge"` event by calling `location.reload()` on the *whole page* —
chosen in `decisions/0007` because "this pub-sub has no per-recipient
payload, so a reload is the simplest way everyone with the page open ends up
seeing their own correct view." But `respondToChallenge` (the shared
accept/decline handler, `src/server.ts`) broadcasts that exact same
`"challenge"` event on the group's channel as part of *answering* a
challenge — so if the accepting player still has the group page open in the
same tab they clicked Accept from (the normal case: the popup/card lives
*on* the group page), that page's own SSE listener receives the ping it just
caused and reloads itself, racing the browser's own pending navigation to
the `303` redirect's target. The reload sometimes wins, landing the
acceptor back where they started instead of in the game they just accepted.

This is a self-inflicted race: the broadcast a user's own action triggers
collided with that same action's own result.

## Decision

The group page's `"challenge"` listener no longer reloads the page. It
fetches a new `GET /g/:code/challenges` fragment route (scoped to that one
group and that one viewer, mirroring `GET /me/challenges` from
`decisions/0008`) and swaps it into a stable `<div id="challenges-card">`
wrapper around the existing `pendingChallengesCard` markup — the same
fetch-and-swap pattern every other live event in this app already uses
(`result`, `group-match`, `member`), and the same pattern `decisions/0008`'s
own site-wide popup already used correctly from the start (it was only ever
a `fetch`, never a reload). `pendingChallengesCard` is now exported from
`src/pages.ts` so the new route can re-render it standalone.

A targeted fragment fetch can't race a `303` navigation the way a full
`location.reload()` can: fetching `/g/:code/challenges` doesn't touch
`window.location` at all, so there's nothing for the browser's pending
redirect to compete against.

## Options considered

1. **Leave the reload, but don't broadcast on the group channel from
   accept/decline (rejected).** Would silently reintroduce 0007's own
   original gap for everyone *else* still on the group page (a third member
   watching, or the challenger) — removing the broadcast fixes the
   acceptor's race by breaking the feature for every other viewer instead of
   fixing the actual defect (reload-vs-navigation).
2. **Delay the reload with a timeout, hoping the redirect wins the race
   first (rejected).** A race fixed by a guessed delay is still a race —
   fragile under real network/rendering variance, and doesn't remove the
   actual defect (the group page reloading itself at all when it's the page
   the user is actively navigating away from).
3. **Fetch-and-swap the group's own card, same as every other live event and
   the same as 0008's popup already did (chosen).** No new mechanism,
   removes the only reload left in this app's live-update code, and the fix
   generalizes: nothing about accepting/declining a challenge should ever
   need to reload a whole page again, for anyone.

## Cost

None identified — this removes a bug and a special case (the one
`location.reload()` in this app's live-update code) rather than trading one
cost for another. The new `GET /g/:code/challenges` route is a small,
unauthenticated-safe addition (it returns an empty string for a signed-out
viewer, same as `GET /me/challenges` does) parallel to an existing pattern,
not new design surface.
