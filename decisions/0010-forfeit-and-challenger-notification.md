# 0010: A mini-game can be forfeited, and the challenger gets told when their game starts

## Status

Accepted.

## Context

Reported directly, three related gaps:

1. **The challenger never finds out their challenge was accepted, unless they
   never left the game page.** `decisions/0008`'s per-user notification
   channel only ever tells the *challenged opponent* "you've been
   challenged" — nothing tells the *challenger* "your challenge was
   accepted, go play." Reproduced with two real browser contexts: if the
   challenger stays on the game page, the live `"board"` broadcast updates
   it correctly the moment the opponent accepts. The instant the challenger
   navigates away while waiting (the normal thing to do — nobody stares at a
   "waiting for them to accept..." screen) there is no notification of any
   kind. They can still get into the game if they remember the URL, but
   nothing in the UI points them there.
2. **An abandoned game just silently expires.** `sweepStaleSessions()`
   deletes a session an hour after its last activity with no result
   recorded at all — not a loss, not a draw, nothing. A player who leaves
   mid-game (closes the tab, loses their connection, or just quits) costs
   their opponent a finished result with no record of what happened.
3. **No way to voluntarily concede.** There's no button for "I'm done,
   you win" — a player stuck in a game they want to leave has no honest way
   out that still produces a record.

## Decision

**`MinigameSession.status` gains `"forfeited"`.** A forfeited game logs a
result through the *existing* `addResult()` — the forfeiting player as
loser, the other player as winner — exactly like a normal win, satisfying
"everything is logged the same way as other results for that game." Reached
two ways:

**Explicit forfeit.** A new "Forfeit" button on the game page, visible to
either player while a game is `active`, posts to
`POST /g/:code/games/:id/forfeit`. Only a player in the game can forfeit it
(the same player-membership check `applyMove` already does); forfeiting
immediately ends the game, logs the result, and broadcasts it the same way
a win does.

**Automatic forfeit on disconnect, after a 30-second grace period.** Every
open per-game SSE connection (`GET /g/:code/games/:id/events`) now tracks
which *player* (if either) it belongs to, not just that a connection exists.
When a player's last connection to that game closes, a 30-second timer
starts; if they reconnect (reopen the game page) before it fires, the timer
is cancelled and nothing happens — a page refresh, a brief tab-switch, or a
flaky connection reconnecting all look identical to this and must not cost
anyone a game. If the timer fires with no reconnection, the game is
forfeited for that player, the same as the explicit button. A spectator's
connection (anyone who isn't one of the two players) is never tracked for
this — only a player going quiet starts the clock. The 30-second window was
chosen specifically to survive a refresh and a quick tab-switch while still
resolving a real departure quickly enough for the other player not to wait
indefinitely.

**The challenger is now notified the same way the opponent already is.**
Accepting a challenge broadcasts the existing per-user `"challenge"` ping to
*both* players now, not just the one who just acted — reusing
`decisions/0008`'s channel rather than inventing a second one. The
challenger's own site-wide popup check (`GET /me/challenges`) is extended to
also surface "a game you started just became active," with a direct link,
using the same `<dialog>` mechanism already wired into every page via
`layout()`. A forfeited or auto-forfeited game notifies the *other* player
the same way, since "your opponent left, you won" is exactly the same kind
of thing a challenger needs to be told about from anywhere in the app.

## Options considered

1. **Timeout-only forfeiting (no explicit button) (rejected).** Doesn't
   cover someone who wants to honestly concede rather than silently going
   quiet — forces them to just stop playing and wait out a timer for the
   same effect an explicit action would give immediately.
2. **Immediate forfeit on disconnect, no grace period (rejected).** An SSE
   connection drops on every page refresh and every brief tab-switch, not
   just a real departure — this would forfeit someone constantly for doing
   completely normal things with their own browser.
3. **A long grace period (2+ minutes) (considered, not chosen for the
   default).** More forgiving of a genuinely flaky connection, at the cost
   of the other player waiting much longer to find out the game is
   resolved. 30 seconds is long enough to survive a refresh and short enough
   that the wait is tolerable — explicitly the tradeoff chosen here.
4. **A second, separate notification channel just for "your game started”
   (rejected).** `decisions/0008`'s per-user channel already exists and
   already drives a `<dialog>` wired into every page — reusing it for one
   more kind of per-user event is strictly less new surface than building a
   second mechanism to do the same job.

## Cost

A still-open third, fourth, etc. tab for the same player keeps the game
alive even if one tab closes — the grace-period timer only starts once
*every* connection for that player is gone, which is correct (they haven't
actually left if another tab is still open) but means someone deliberately
avoiding a forfeit by never fully closing out could, in principle, stall
indefinitely by keeping one idle tab connected. Not solved here — the same
trust-based posture this app already takes everywhere else (a manually
logged result can also just be wrong, with no stronger enforcement than
social accountability). The connection-tracking map is in-memory only, the
same durability tradeoff every other piece of live mini-game state already
accepts — a server restart loses in-flight grace-period timers along with
the rest of the session, and an active game would need to be forfeited or
finished again by hand, same as the existing hour-long stale-session sweep
already implies.
