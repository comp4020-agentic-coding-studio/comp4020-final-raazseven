# Process overview

## The app and the brief

[`comp4020-final-raazseven`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven)
is a scorekeeper for one friend group: create a group, get a code, log who
beat who at whatever you play. Crit 8's bar is proof of life — a stranger can
visit, do the core thing, and find their trace still there when they come
back — so the two things this week had to answer were "what stack gets this
deployed fastest" and "what does 'their trace' actually require."

## Stack: Node + TypeScript direct, Fastify, node:sqlite

The Dockerfile and `fly.toml` record the decision as built, so I won't repeat
the mechanics here — the trade-off is what belongs in this file.

The alternative I considered was a build step (Vite/esbuild) with a framework
on top (something like Hono or Express with a templating layer). I didn't
take it, for one reason: the course's Fly setup gives the app a single
256MB machine and one volume, and the brief's bar is "deployed and alive,"
not "scales." Node 24 runs TypeScript directly (no `tsc` build, no dist
folder to keep in sync with source), Fastify is a few dependencies instead
of a framework's worth, and `node:sqlite` is built into Node itself — no
native module to compile for Alpine, no separate database service to
provision on Fly. That's the smallest path from "brief" to "a stranger can
use it," which is what this week asks for. It's a first choice: if the app
outgrows a single SQLite file on one volume, that's a new decision record,
not a retrofit of this one.

## What "their trace is still there" turned out to mean

The first working version
([`c3514c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/c3514c8))
got the core loop working — create a group, get a code, log a result, see it
persisted in SQLite on the Fly volume. That satisfies "a stranger can do the
core thing" literally, but re-reading the spec line — *find their trace
still there when they come back, as them* — exposed a gap: anyone holding the
group's code could log a result as anyone else. There was no "them" to come
back as.

[`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a)
closes that gap with real accounts scoped to a group: a name, a scrypt
password hash, and a session token in an httpOnly cookie
(`src/db.ts`, `src/server.ts`). A couple of decisions worth recording:

- **Login/logout rotate the token** rather than deleting a session row, so a
  stale cookie from before a logout stops working without needing a session
  table to garbage-collect.
- **The members table migrates in place** (`ALTER TABLE ... ADD COLUMN`)
  instead of being dropped and recreated, because the Fly volume already had
  a `members` table from the pre-password version and the brief cares about
  a stranger's data surviving across deploys, not just across requests.
- **The cookie is scoped to `/g/:code`**, not the whole site, so one group's
  session can't be replayed against another group by accident.

`spec/scorekeeping.test.ts` carries the same commit: it now checks the full
loop over HTTP — register, log a result, see it on a fresh visit with the
same cookie — plus the two failure modes that matter for "as them": logging
a result with no session doesn't record it, and a logged-out session token
stops working even though a fresh login still succeeds.

The same commit also pulled the inline `<style>` blocks out into
`src/styles.ts` and reworked the group page from one bare form into
sign-in/log-a-result cards (light/dark tokens via `prefers-color-scheme`) —
not asked for by the spec directly, but the brief's own "good" criteria
(`README.md`) are about an app a friend group would actually want to use, and
a form that silently let anyone log results as anyone wasn't that.

## Directing, grounding and correcting

I used Claude Code across two sessions this week: the first built the
initial Fastify/SQLite skeleton to get something deployable fast; the second
is the account/session work above. I grounded the second session in the
spec line itself rather than a feature wishlist — I re-read "find their trace
still there... as them" and asked what the first version was actually
missing against that sentence, which is what surfaced the no-accounts gap.
The main correction I made along the way was on the session-invalidation
behaviour: the first draft of the login/logout logic only cleared the
cookie client-side, which doesn't stop a copied token from still working
server-side — I asked for the token to rotate in the database on both login
and logout instead, and had the agent add a test (`logging back in after
logging out requires the password again`) that fails if that regresses.
`pnpm typecheck` and `pnpm test` (5/5, against the running app per
`spec/global-setup.ts`) are clean as of
[`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a).

## Crit 9: real players, group-vs-group, real-time

Crit 9 asks for two things: the app has to be real-time (a change reaches
everyone else's open session in about a second, no reload), and one
decision about concurrent use, written down. I planned this week's work with
the agent before any code changed — the agreed plan is
[`crit9pan.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/crit9pan.md)
in the repo root, alongside this file.

I'd also been sitting on three things the account system from crit 8 made
obvious once I looked at it with a stranger's eyes: you could log "1 beat 2"
in a group where no "1" or "2" existed, nobody had a profile picture, and
there was no way to record one group's result against another group's (a
real soccer match between two friend groups, say). I scoped all of that into
the same week as the crit-9 requirement rather than doing it separately,
because the two turn out to interact.

### Why the features and the real-time requirement share one plan

Once logging a result requires picking a real member instead of typing a
name
([`32d426e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/32d426e),
[`35b3602`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/35b3602)),
a member who just joined is invisible in everyone else's already-open
log-a-result form until they reload — which is exactly the gap real-time is
supposed to close, just moved one step earlier in the flow. That's the
concurrency decision this crit asks for, and it's recorded as an ADR in
[`decisions/0001-live-update-scope.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0001-live-update-scope.md):
new results, new group-vs-group matches, and new members broadcast live over
one SSE connection per open group page
([`e5c17ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/e5c17ab),
[`0ac513a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/0ac513a)); avatar
changes deliberately don't, since image bytes are comparatively rare-churn
and heavy for this app's single 256MB machine to fan out on every open tab.

### Avatars: generated by default, uploadable after

Every member and group gets a deterministic SVG avatar (colored initials
hashed from their name/code) the instant they exist — no upload step, no
extra storage
([`b217fad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b217fad)).
Anyone can replace theirs with an uploaded photo afterwards. I kept this to a
hard size cap (300KB, PNG/JPEG/WebP only) rather than adding an
image-resizing library, for the same reason crit 8's stack choice avoided
native dependencies: this still has to fit a 256MB machine with nothing to
compile for Alpine.

### Group-vs-group matches

A match between two groups (the soccer-game case from the brief) is its own
record — one final score, not a pile of per-player rows — looked up from
either group's page
([`32d426e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/32d426e)).
I asked the agent to treat a group's existing page as its "profile" (avatar +
name) rather than inventing a second page for it, since the group page
already was that.

### Directing, grounding and correcting

I answered three scoped questions before any code was written — avatars
(generated + uploadable, not one or the other), the match model (one score
per match, not per-player rows), and whether to fold crit 9's real-time
requirement into the same plan rather than treat it separately (I chose to
fold it in). Those answers are what's recorded in `crit9pan.md`. The
correction worth noting: the plan's "push only results" default for the live
feed stopped being sufficient the moment the membership gate landed, and
re-reading that interaction out loud with the agent is what turned "push
only results" into the three-event decision actually recorded in the ADR —
nobody asked for that explicitly; it fell out of making the two features
make sense together.

`pnpm check` (typecheck + all 17 spec tests, across `invariants`,
`scorekeeping`, `avatars`, `group-matches`, and `live-updates`) is clean as of
[`e035834`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/e035834).
I also ran the new routes by hand with `curl` against a running instance
before writing the matching spec tests — valid and rejected result logging,
avatar upload with the per-member authorization check, a group match
appearing correctly on both sides, and the SSE stream emitting a live
`result` event and a live `member` event — rather than trusting the tests
alone on the first pass.
