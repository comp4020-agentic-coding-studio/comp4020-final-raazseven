# Process overview

## The app and the brief

[`comp4020-final-raazseven`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven)
is a scorekeeper for one friend group: create a group, get a code, log who
beat who at whatever you play. Crit 8's bar was proof of life — a stranger can
visit, do the core thing, and find their trace still there when they come
back. Crit 9's bar is proof of life *together* — a change one person makes
has to reach everyone else's open session within about a second, with no
reload, plus one decision about what happens when several people use the app
at once. Two different weeks, but the same underlying question each time:
what does the spec's wording actually require, once you take it literally?

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
use it," which is what crit 8 asked for. It's a first choice: if the app
outgrows a single SQLite file on one volume, that's a new decision record,
not a retrofit of this one.

That choice held up two weeks later without changing: crit 9's real-time
requirement needed one more small dependency (`@fastify/multipart`, for photo
uploads) and one new file (`src/live.ts`, an in-memory pub-sub), but no new
infrastructure — no message broker, no second process, no change to
`fly.toml`. A single machine with no horizontal scaling is also *why*
in-memory pub-sub is enough: there's only ever one process to broadcast from.

## Crit 8: what "their trace is still there" turned out to mean

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

`spec/scorekeeping.test.ts` carried the same commit: it checked the full loop
over HTTP — register, log a result, see it on a fresh visit with the same
cookie — plus the two failure modes that matter for "as them": logging a
result with no session doesn't record it, and a logged-out session token
stops working even though a fresh login still succeeds. (Crit 9 later
rewrote parts of this file again — see below.)

The same commit also pulled the inline `<style>` blocks out into
`src/styles.ts` and reworked the group page from one bare form into
sign-in/log-a-result cards (light/dark tokens via `prefers-color-scheme`) —
not asked for by the spec directly, but the brief's own "good" criteria
(`README.md`) are about an app a friend group would actually want to use, and
a form that silently let anyone log results as anyone wasn't that.

## Crit 9: real players, group-vs-group, real-time

Crit 9 asks for two things: the app has to be real-time, and one decision
about concurrent use, written down. I planned this week's work with the
agent before any code changed — the agreed plan is
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

### Making the group page fully responsive, then a real home page

Two more rounds after the core crit-9 work landed, both directed live:

- **Responsive.** The group page was pinned to one ~40rem column at every
  screen width — fine on a phone, a narrow stripe lost in empty margin on a
  laptop
  ([`a2a9ff8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/a2a9ff8)).
  A real two-column layout at ≥900px (actions left, the live results/matches
  feed right) fixed that. Along the way I found `.avatar-upload` rendering
  as a centred column instead of a row: it's a `<form>`, and the generic
  `form` rule sets `flex-direction: column`; `.avatar-upload` only overrode
  `display`/`align-items`/`gap`, so the column direction leaked straight
  through un-overridden.
- **A logo and an actual home page**
  ([`5f09693`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/5f09693)).
  Two bare form cards under one tagline doesn't read as a product, so I
  looked at how comparable apps (Inscore, Point Wars, Versus — all
  friend-group score trackers) and current SaaS landing pages actually
  structure themselves, then adapted that shape rather than inventing one:
  a nav with Log in/Sign up, an outcome-first hero, a 3-step "how it works,"
  a feature grid, then the real action cards. The accounts here are
  per-group, not global, so those nav links are real anchors into the two
  flows that already exist, not a fake global-login bolted on top.
- **A design pass**
  ([`0912dc3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/0912dc3)):
  a secondary icon-only color palette, a display typeface, a small
  hand-drawn icon set, motion gated behind `prefers-reduced-motion`, and a
  hero visual that's a crafted product-preview mockup (same CSS tokens as
  the real app) rather than a stock photo or a screenshot that goes stale
  the next time the UI changes. This surfaced two more real bugs, both from
  the same root cause (an `<input>`/grid-track not shrinking the way I
  assumed): `.cards-row`'s `1fr 1fr` has no 0-floor and blew out past its
  container once the sidebar column made room genuinely tight, and
  `<input>` is `inline-block` by default and was only ever full-width by
  the coincidence of being a direct flex child of `<form>`. Both fixed, not
  just one: a width-based media query wasn't the right trigger either, since
  the sidebar is narrow by *layout*, not by *screen size*.

### A group needs a profile, not just a name

A group used to need only a name to exist. Starting one now requires a bio,
at least one game tag, and a photo too — all mandatory and server-validated,
not just HTML `required` attributes — for the same reason crit 8 required a
member account instead of a bare name: there should be something real on a
group's page before anyone's logged a single result
([`8594012`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/8594012)).
`POST /groups` moved from formbody to multipart so the photo travels with
the text fields in one request.

Every spec file had grown its own copy of `createGroup()`, and all five only
ever sent a name — insufficient the moment group creation needed a whole
profile. Rather than patch five near-identical copies, I pulled them into
one `spec/support.ts`
([`0ad6626`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/0ad6626)).

### Three corrections to the group-profile feature

All three directed live, each one catching something the previous round got
wrong rather than adding something new:

- **The photo shouldn't have been mandatory**
  ([`30d9971`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/30d9971)).
  Requiring an upload to create a group broke the pattern a member's own
  avatar already followed (generated automatically, free to replace) for no
  reason tied to the brief — fixed by making the photo a choice ("generate
  one for me" or "upload a photo"), with the file input's `hidden`/`required`
  state toggled by a small script that degrades gracefully without JS.
- **"Tags" were a free-text box, not real tags**
  ([`33aca0e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/33aca0e)).
  Replaced the comma-separated column with an actual `tags`/`group_tags`
  schema: ~39 curated entries across three categories (video games,
  real-world sports, board & card games) picked via checkbox chips, plus a
  free-text field for anything not listed that becomes a real row
  (`findOrCreateTag`), not a second storage mechanism. The one subtlety:
  multipart fields collected as single values silently keep only the last of
  several same-named parts, which is exactly what a repeated checkbox name
  sends — caught before it shipped by collecting fields as arrays instead.
- **The form had outgrown the home page**
  ([`1096d89`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1096d89)).
  A name/bio/39-tag-picker/photo form squeezed into half of a two-column row
  next to a one-field "log in" card left the two wildly mismatched in
  height — the layout problem was the symptom, the actual issue was that a
  form that size doesn't belong on a landing page. Moved to its own `/new`
  page; the home page's "Sign up" card is a sentence and a button again.

Each of the three followed the same shape: the agent built something that
was literally correct against what I'd asked for, and I only caught the
actual UX consequence once I saw it running — consistency with the avatar
pattern already in the app, what "real" tags actually means, what happens to
a card's layout as its form keeps growing. None of the three needed a new
plan, just a clearer instruction once I'd seen the problem for myself rather
than approving the literal ask on the first pass.

## Directing, grounding and correcting

### Crit 8

I used Claude Code across two sessions this week: the first built the
initial Fastify/SQLite skeleton to get something deployable fast; the second
is the account/session work above. I grounded the second session in the spec
line itself rather than a feature wishlist — I re-read "find their trace
still there... as them" and asked what the first version was actually
missing against that sentence, which is what surfaced the no-accounts gap.
The main correction I made along the way was on the session-invalidation
behaviour: the first draft of the login/logout logic only cleared the cookie
client-side, which doesn't stop a copied token from still working
server-side — I asked for the token to rotate in the database on both login
and logout instead, and had the agent add a test (`logging back in after
logging out requires the password again`) that fails if that regresses.
`pnpm typecheck` and `pnpm test` (5/5, against the running app per
`spec/global-setup.ts`) were clean as of
[`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a).

### Crit 9

I answered three scoped questions before any code was written — avatars
(generated + uploadable, not one or the other), the match model (one score
per match, not per-player rows), and whether to fold crit 9's real-time
requirement into the same plan rather than treat it separately (I chose to
fold it in). Those answers are what's recorded in `crit9pan.md`. The
correction worth noting: the plan's "push only results" default for the live
feed stopped being sufficient the moment the membership gate landed, and
re-reading that interaction out loud with the agent is what turned "push
only results" into the three-event decision actually recorded in the ADR —
nobody asked for that explicitly; it fell out of making the two features make
sense together.

`pnpm check` (typecheck + all 17 spec tests, across `invariants`,
`scorekeeping`, `avatars`, `group-matches`, and `live-updates`) is clean as of
[`e035834`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/e035834).
I also ran the new routes by hand with `curl` against a running instance
before writing the matching spec tests — valid and rejected result logging,
avatar upload with the per-member authorization check, a group match
appearing correctly on both sides, and the SSE stream emitting a live
`result` event and a live `member` event — rather than trusting the tests
alone on the first pass. The deploy itself was verified the same way: after
`flyctl deploy`, I re-ran the SSE check against the live
`comp4020-final-raazseven.fly.dev` URL (through Fly's actual proxy, not just
localhost) and watched a logged-in-elsewhere result arrive on the open
stream, since crit 9's bar is deployed real-time, not merely local real-time.

For the responsive and design rounds, "verify" meant something more literal
than reading CSS: I stood up a throwaway headless Chromium (no browser tool
in the harness, so `playwright-core` installed to a scratch `/tmp` directory,
with the missing shared libraries pulled via `apt-get download` +
`dpkg-deb -x` since there's no `sudo` here) and drove it at 320/390/768/1280px
against a seeded instance, checking for horizontal overflow and console
errors programmatically rather than trusting a glance at a screenshot. That
discipline is exactly what caught the `.avatar-upload` and `.cards-row`/
`<input>` bugs above — both were real DOM/layout bugs a visual skim could
easily have waved off as a rendering quirk, and I checked actual computed
styles and bounding rects before concluding either way.

The group-profile round started from a direct question — "did you test
every feature?" — which I answered by actually auditing coverage rather than
asserting yes. That audit is what found the three pre-existing gaps closed
in [`0ad6626`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/0ad6626)
(the group-match live event, the tied-score outcome branch, duplicate-name
and wrong-password rejection) — none of them new bugs, all of them real
holes in "tested" that had been sitting there since crit 8 and earlier in
crit 9. `pnpm check` is 30/30 as of
[`1096d89`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1096d89),
the most recent commit.

A second direct question — "check if all the crit 9 requirements are met" —
is what caught this file itself falling behind: three commits
(`30d9971`, `33aca0e`, `1096d89`, all above) had landed without a matching
update here, which is exactly the kind of gap "a process overview in
PROCESS.md" is checking for. Re-verified rather than assumed from memory at
that point: `pnpm check` 30/30 fresh, `node scripts/check-evidence.ts`
clean, and the SSE real-time check re-run against the live
`comp4020-final-raazseven.fly.dev` URL on its current deploy (not the one
from earlier in the week) — a result logged from one request arrived on a
second, independently-opened stream within about two seconds, through Fly's
actual proxy.

### Reversing the per-group account decision

The biggest direction this week came after the group-profile work above,
phrased from the outside: pressing "log in" asked for a group code before
the site would say who you were, nothing on any page showed you were signed
in, and there was no way to be one person in two groups, or for a group's
creator to be able to do anything a brand-new member couldn't. I was asked
to think about it from each user's perspective, and to add roles. That's a
direct reversal of a choice `README.md` had called deliberate as recently as
crit 8 ("no identity that follows you between groups... that's on purpose"),
so it earned a plan and an ADR rather than a quiet patch.

Before writing the plan I asked three scoped questions rather than guessing:
what an owner should be able to do that a member can't (answered: edit the
group's profile, remove a member — not a general lockdown of everything
else), what happens to an existing membership once two different groups'
"Sam" are no longer automatically the same global name (answered: each old
membership becomes its own separate new account — merging by name would be
a real account-takeover bug, not a convenience), and whether creating or
joining a group should require logging in first (answered: yes, landing on
a dashboard, rather than the account step happening mid-task). All three are
recorded, with the reasoning, in `decisions/0002-global-accounts.md`.

The build itself (`b90154f`) replaced the `members` table's role as the
source of identity with two new tables — `users` (global, unique name) and
`memberships` (user × group × role) — while keeping `members` itself
untouched as the one-time migration source, the same "never drop, migrate
in place" rule crit 8's account work already established. The one place
that rule needed more than a plain `ALTER TABLE`: `group_matches.logged_by_member_id`
was `NOT NULL`, which SQLite can't relax by adding a column, so that one
table went through a rename → recreate → copy → drop rebuild instead of an
in-place add.

Two mistakes caught and fixed before they shipped, both from re-reading what
the previous week's tests actually expected rather than assuming the new
routes behaved identically: splitting one combined "register against this
group" step into a global signup plus a separate join dropped the live
`member` SSE broadcast the old route used to fire — caught by checking
`live-updates.test.ts`'s expectations against what the new `/g/:code/join`
handler actually did, not by it failing first. And `/signup`, `/login`, and
the new `/g/:code/profile` route were built using the same manual multipart
parsing the photo-upload routes need, despite none of the three having a
file field — caught on review, switched to the plain `formbody` plugin
already registered for exactly this shape of form.

### Finding the real bug under a pile of flaky-looking failures

Making names globally unique broke a different thing than the server: most
spec files had picked the same literal names ("Priya," "Sam," "Riley")
across files, which only worked when each group was its own namespace.
Running the full suite afterward showed close to a dozen failures, nearly
all `Error: Test timed out in 5000ms` rather than a clean assertion
mismatch — the kind of output that's easy to misread as "the server is
broken under load." Instead of chasing the timeouts first, I ran the one
file most likely to show the real bug in isolation
(`spec/scorekeeping.test.ts` alone, no timeouts, two plain assertion
failures), which separated "a real naming collision" from "noise." Fixing
the collision (`spec/support.ts`'s `register()` now uniquifies the name it
signs up with internally, `memberId()` matches that name as a prefix) and
re-running the full suite with `--no-file-parallelism` dropped the failure
count to exactly one real bug: a test that re-logged-in using the literal
string `"Sam"`, which was never actually the registered name once
`register()` started uniquifying it.

That comparison is also what explains the remaining timeouts honestly,
rather than papering over them: every spec file shares one real dev server
and one SQLite file, by design (there's nothing else to point the tests at),
and vitest's default is to run test files in parallel worker processes —
fine for isolated unit tests, not for several files firing many requests at
one shared process at once. `vitest.config.ts` now runs spec files
one at a time (`fileParallelism: false`) rather than quietly loosening the
timeout to paper over contention; the real bug it had been hiding is fixed
in `spec/scorekeeping.test.ts` directly. `pnpm check` is 39/39 clean as of
[`b90154f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/b90154f)/[`6773346`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/6773346).

### Deploying the migration and re-verifying, not assuming

This round changes more than any single commit before it — a live schema
migration against real production data, not just new code — so "deploy it
and move on" wasn't good enough. Before touching the live volume, I ran the
actual migration locally first: `pnpm seed` against a throwaway database,
then a full manual walkthrough by hand with `curl` (not just the spec
suite) — direct signup with no group code, a fresh group created and owned,
logging out, a second account signing up and joining as a plain member,
confirming that member can log a result but gets a real `403` trying to
edit the group's profile, and confirming the owner succeeds at the same
request. Only once all of that matched what the plan promised did I ask
before running `flyctl deploy` against the shared production volume, since
the migration is additive but still a one-way step on live data.

The deploy itself surfaced the exact edge case `decisions/0002-global-accounts.md`
names as a known cost: the live logs
(`flyctl logs -a comp4020-final-raazseven`) show
`migration: "Raj" (group 11) already taken globally --- creating this
account as "Raj-2" instead` — two different real people named "Raj" in two
different pre-existing groups, exactly the collision the ADR predicted,
handled the way it said it would be rather than crashing or silently
merging them. I re-ran the same manual walkthrough against the live URL
afterward (not just localhost) to confirm the deployed behaviour matched,
then specifically re-checked crit 9's real-time requirement rather than
assuming a migration this large couldn't have touched it: opened the live
SSE stream for a freshly created group
(`https://comp4020-final-raazseven.fly.dev/g/PYFSZA/events`), logged a
result from a second, independent request, and watched the `result` event
arrive on the open stream within about two seconds, through Fly's actual
proxy — the same check this file has run after every deploy this crit, kept
up rather than skipped because the change looked architectural instead of
feature-sized.
