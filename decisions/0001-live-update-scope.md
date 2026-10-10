# 0001: What reaches other people live, and what waits for a reload

## Status

Accepted (crit 9).

## Context

Crit 9 requires the app to be real-time: a change one person makes has to
reach everyone else with the group open within about a second, with no
reload. The brief leaves it open *what* counts as "a change" and asks for one
decision, with its cost, written down.

This crit's other feature (members-only results, see `PROCESS.md`) changes
the stakes of that decision. Once logging a result requires picking a real
member from a dropdown instead of typing a name, a member who just signed up
is invisible to everyone else until their page reloads — the exact thing
real-time is supposed to prevent, just moved one step earlier in the flow.

## Decision

Three kinds of change broadcast live, over one SSE connection per open group
page (`GET /g/:code/events`, `src/live.ts`):

- a new result logged in the group
- a new group-vs-group match (either group's page)
- a new member registering

Each broadcast is a freshly rendered HTML fragment (the same render functions
the full page uses — `resultsListFragment`, `groupMatchesFragment`,
`memberOptionsFragment` in `src/pages.ts`) that the client swaps straight into
the page (`innerHTML`), no client-side templating to keep in sync.

**Avatar/photo changes do not broadcast live.** A viewer keeps seeing the old
picture until their next reload (the avatar `<img>` route still answers with
the new one — a reload, or a cache revalidation, picks it up — it's just not
pushed).

## Options considered

1. **Push everything, including avatar bytes.** Rejected: photos are
   comparatively large and rare-churn (someone changes theirs maybe once),
   and this app runs on a single 256MB machine (`fly.toml`) — fanning out
   image payloads to every open connection on every photo change is a cost
   with no matching benefit. A stale avatar for a few minutes isn't the kind
   of thing anyone needs to see mid-session.
2. **Push only results (the literal minimum crit 9 asks for).** Rejected
   once member-gated logging landed: if Dana registers while Alex already has
   the log-a-result form open, and the member list doesn't update live, Dana
   is unselectable in Alex's form until Alex reloads. That directly fights
   the app's own "good means effortless logging" criterion in `README.md` —
   the membership gate would be solving one problem (results logged against
   people who don't exist) by quietly reintroducing another (people who do
   exist but can't be picked yet).
3. **Push results, group matches, and new members (chosen).** Covers the
   content that changes what someone can *do* right now (log a result, log a
   match, pick a newly-joined member), and excludes the content that's purely
   cosmetic (a picture).

## Cost

A member list that grows mid-session means every open tab now holds a live
connection and re-renders its dropdowns on someone else's registration — a
small, bounded cost (one in-memory `Set` per group code, `src/live.ts`) given
this runs as a single machine with no horizontal scaling to coordinate
across. The cost that was *not* taken on is image fan-out, which would have
scaled with photo size and upload frequency instead of staying flat.

## Reconnecting

Closing the tab and coming back (later the same session, or the next day)
is just a normal page load — SQLite already has everything current, so there
is no separate "catch up" logic to write. Reopening the tab starts a fresh
SSE connection the same way the first visit did.
