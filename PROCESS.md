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
