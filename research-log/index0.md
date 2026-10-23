# Session research log

Append-only, one dated entry per session, newest at the bottom. Logs what got
researched or learned while working with the agent --- new techniques tried,
gotchas hit, patterns discovered --- not project status (`PROCESS.md`) and not
personal reflection (`reflections/crit-N.md`).

The agent adds an entry here as its own commit before the first push of each
session; it does not edit `PROCESS.md` or `reflections/` on push --- it flags
gaps in those in chat instead, for the person to fold in themselves.

## 2026-10-14

Set up the session research log itself (`CLAUDE.md`'s new "Session research
log" section, this file) at the start of the session --- no existing course
or repo convention named "index0" or a research log; confirmed against the
live final-project brief and the repo's existing docs before inventing the
convention from scratch, and confirmed with the person that `PROCESS.md` and
`reflections/crit-N.md` stay person-authored, agent-flagged-only, not
agent-written.

Pulled crit 10 ("Fly by instruments", cutoff Mon 19 Oct) via the course API
(`/api/crits/10-fly-by-instruments.json`) --- runs in the existing
`comp4020-final-raazseven` repo (shared `repoPrefix` with the final project),
so no new clone or stack choice, just a spec pulled into the repo already in
progress.

Implemented team results (any number of winners/losers per side, not just
1v1) and per-user profile pages (`GET /u/:id`) with head-to-head/teamed-up
history, landing together because crit 10's two checkable spec lines ---
a server-checked permission decision, and durable server-side logging that
outlives the crit --- are naturally satisfied by the same schema change:
`result_participants` (one row per person per side) is what both the
profile history queries and a precise audit-log detail string need.

Technique: durable audit logging as two layers, not one --- a `record()`
helper in `src/server.ts` writes a structured Fastify request-log line (what
`flyctl logs -a <app>` tails live, for crit narration) and an `audit_log`
SQLite row (what survives past the log buffer) from the same call site, so
the two can never drift out of sync with each other.

Gotcha hit: changed two existing error-message strings
("winner and loser can't be the same player" /
"winner and loser must both be members of this group") while generalizing
single-id validation to set validation, without first checking
`spec/scorekeeping.test.ts` asserted the original wording verbatim --- broke
two previously-passing tests. Caught by running the full suite before
calling the work done, not by reading the existing route carefully enough
up front; reverted to the original wording. Direct instance of this repo's
own standing rule (`CLAUDE.md`'s real-time/testing sections) about checking
an existing test's expectations against a new code path before assuming a
generalization is safe.

Gotcha hit (smaller): a sign-in-prompt string I wrote for the profile page
("Head-to-head and teamed-up results only show...") collided with the
page's own "Head-to-head" section heading, so a test asserting the prompt
appeared also had to assert that heading *didn't* --- and failed, since the
prompt text contained it. Reworded the prompt to avoid the literal phrase.

Verified end-to-end on a throwaway `DB_PATH`: typecheck clean, 48/48 spec
tests green (39 pre-existing + 9 new), and `audit_log` rows actually land
and are queryable via a direct `node:sqlite` read against the dev database
file, not just asserted through the HTTP layer.

## 2026-10-20

Asked for a "liquid glass" UI, right after installing a course-external
Claude plugin (`liquid-glass@liquid-glass-skills`) by name. Loading its
skill showed it's Apple's SwiftUI design language for iOS/macOS 26
(`.glassEffect()`, `GlassEffectContainer`, `buttonStyle(.glass)`) --- this
app is server-rendered HTML/CSS from a Fastify app with no SwiftUI anywhere,
so the plugin's actual APIs didn't transfer. Confirmed scope with the person
(hand-built CSS glass look vs. header-only vs. everywhere) before touching
`src/styles.ts`, rather than assuming "everywhere" from the one-line ask.

Implemented the look entirely in CSS custom properties (`--glass-bg`,
`--glass-border`, `--glass-highlight`, `--glass-blur`) layered onto the
existing light/dark `:root` blocks, so every surface (header, `.card`,
buttons, inputs, chips) reads off the same few tokens instead of each
getting its own one-off `backdrop-filter` rule. Added a
`prefers-reduced-transparency: reduce` block that collapses the tokens back
to the plain opaque `--surface` colour --- glass is decorative, and a user
or engine that can't render blur still gets a readable page, not an
invisible one.

Technique: `backdrop-filter` needs genuine visual variation *behind* the
blurred element to read as glass at all --- a flat `--bg` colour blurs into
itself and looks identical to a plain translucent box. Added fixed
(non-scrolling) radial-gradient colour blobs on `body` using the existing
accent/teal/pink tokens so the header and cards have something to actually
refract as you scroll past them.

Gotcha hit: no browser available for visual verification out of the box.
`npx playwright install` failed (no passwordless sudo to install system
deps), and the locally cached Chromium build was missing `libnspr4`,
`libnss3`, `libsmime3`, `libnssutil3`, `libasound.so.2`. Fixed without root
by `apt-get download`-ing the four `.deb`s (download doesn't require root,
only `apt-get install` does) and extracting them with `dpkg-deb -x` into a
scratch dir, then launching Chromium with `LD_LIBRARY_PATH` pointed at the
extracted `.so` files --- avoided installing anything system-wide. One of
the downloaded `.deb`s landed in the repo root by accident (ran `apt-get
download` from the project directory) and had to be caught in `git status`
and deleted before committing.

Verified visually with real Playwright screenshots (home page light mode,
dark mode, login form, post-signup dashboard) rather than just reading the
CSS --- confirmed the blur, the specular highlight line, and the sticky
glass header all actually render, not just typecheck. Also re-ran
`pnpm test` against the app on port 8080 (the suite's expected port per
`spec/global-setup.ts`, not the `dev` script's 3000) --- 48/48 still green,
confirming the CSS-only change didn't touch anything the spec checks.

Separately this session: `--page-width` had plateaued at a fixed `72rem`
from 1024px up, so any screen wider than that (1440px, 1920px) left a large,
fixed empty gutter on both sides that never grew with the window --- replaced
the three stepped breakpoints with `clamp(40rem, 90vw, 100rem)`, one fluid
value instead. First pass (`min(100rem, 90vw)`, no floor) actually made
phones *narrower* than before --- `90vw` alone reads as less than the full
viewport there, stacking an unwanted second gutter on top of main's own
padding. Caught by screenshotting phone width specifically, not just desktop,
since the original bug report was about wide screens and it would have been
easy to only check that end of the range; `clamp`'s floor fixed it without
losing the wide-screen gain. Verified across phone/tablet/laptop/desktop
widths with Playwright before and after, plus `pnpm typecheck` and the full
`pnpm test` suite green throughout.

## 2026-10-21

Built live mini-game challenges (Tic-Tac-Toe and Rock-Paper-Scissors,
`decisions/0004-mini-game-challenges.md`) after discussing the idea
yesterday as a low-priority "if possible" addition. Deliberately reused
existing infrastructure rather than adding new machinery: a finished game's
outcome logs through the existing `addResult()` (`src/db.ts`) exactly like
any manually-logged result, no schema change at all; a per-game live board
channel is just another key in `src/live.ts`'s existing `subscribe`/
`broadcast` `Map`, widened by one additive `LiveEvent` type (`"board"`).

Design decision worth remembering: Rock-Paper-Scissors needs a player's
choice to stay hidden from their opponent until both have chosen, or the
second player could simply wait for a live update revealing the first
player's pick before choosing themselves. Because this app's broadcast
mechanism has no concept of a per-recipient payload (every existing
broadcast fragment is viewer-agnostic by construction), the fix wasn't to
add per-viewer broadcast plumbing --- it was to defer broadcasting on the
per-game channel entirely until *both* choices are in, with each player's
own page load privately rendering only their own pending choice in the
meantime. Tic-Tac-Toe has no hidden information, so it broadcasts after
every move instead, same as `resultsListFragment` always has.

Direct application of this repo's own real-time standing rule
(`CLAUDE.md`): a mini-game win also broadcasts on the *group's* existing
results channel (`{ type: "result", ... }`), the same broadcast
`POST /g/:code/results` already sends, specifically so a result logged
through a new code path doesn't silently skip the crit-9 broadcast a
manually-logged result gets. Wrote a dedicated test
(`spec/minigames.test.ts`) opening the group's own `/events` stream before
playing a winning move, asserting `event: result` arrives there --- not just
that the page re-render looks right afterward.

Gotcha hit, in the test suite itself, not the app: an SSE-reading test
helper (`readUntil`) that races a bare `reader.read()` against a timeout
silently abandons that read() when the timeout wins --- if real data then
arrives *after* the timeout but *before* a second call starts its own
`read()`, the still-pending abandoned call consumes it first, and the
assertion that should have seen it finds nothing. Looked like the app wasn't
broadcasting at all; manually replaying the exact same request sequence by
hand with raw `fetch()` against the dev server showed the server-sent event
arriving fine, which placed the bug in the test's own stream-reading logic,
not the route. Fixed by pumping one stream continuously into a single shared
buffer from the moment it opens (`pumpStream()`), with `readUntil()` only
ever polling that already-filled buffer rather than racing `read()` calls
against each other --- there is then always at most one `read()` in flight,
never one left abandoned mid-call. Lesson, same shape as last session's
test-suite gotcha: a failing assertion against a live, concurrent system is
not automatically a server bug just because the server is the more complex
of the two things being tested.

Verified with real two-browser-context Playwright sessions (not just the
spec suite): two signed-in users playing a full Tic-Tac-Toe game to a win
with each tab's board updating live without a reload, a third, separate
browser context watching the group page see the win land in the live
results feed without a reload, and a Rock-Paper-Scissors round confirming
visually that neither player's pending choice is ever shown to the other
before both have chosen. `pnpm typecheck` and the full `pnpm test` suite
(58/58, 48 pre-existing + 10 new) green throughout.

## 2026-10-22

Built witness confirmation for manually-logged results
(`decisions/0005-witness-confirmation.md`), the feature `README.md` had
named since crit 8 as deliberately deferred ("Confirmation by a third
friend is next week's build"). Asked for: a third group member named as a
mediator/witness on a result, who can then confirm or deny it.

Research before writing any code: two parallel `Explore` subagents mapped
(1) the existing mini-game auto-logging path and confirmed there was no
witness/confirm/dispute concept anywhere in the codebase (`grep` across
`src/`, `spec/`, `decisions/` came up empty except the README's own
deferral note), and (2) the exact rendering/live-update/test plumbing
(`resultsListFragment`, `liveScript`, `spec/live-updates.test.ts`'s
`event: result` assertions) a new feature would have to slot into without
breaking. Doing the research as two forked lookups first, before deciding
the schema shape, avoided designing a parallel "pending results" table when
two additive columns on the existing `results` table (`witness_user_id`,
`witness_status`) did the job with less surface area — the ADR's "options
considered" section records why the separate-table alternative was
rejected.

Design decision made with the person up front, by asking rather than
guessing: witness is optional (not required on every result), scoped to
manually-logged results only (not mini-game auto-logs or group-vs-group
matches, which still log on trust, unchanged), and a denied result stays
fully visible marked "disputed," never removed — consistent with
`CLAUDE.md`'s "never drop a column or table" migration rule extended to
mean never drop a *row* either, just because of a disagreement about it.

Reused the existing group SSE channel rather than inventing a new
`LiveEvent` type: a witness's confirm/deny re-broadcasts the exact same
`{ type: "result", html: resultsListFragment(...) }` event a fresh result
already sends, so `spec/live-updates.test.ts`'s existing assertions needed
no changes at all — direct application of `CLAUDE.md`'s real-time standing
rule to check an existing test's broadcast expectations before changing how
a result's lifecycle works, this time by *not* having to touch that path.

Gotcha hit, in a new test I wrote, not the app: asserted
`expect(html).not.toContain("witness-pill")` to prove no witness badge
renders when none was named, and it failed — because `"witness-pill"` is
always present as a literal string in every page's `<style>` block (the CSS
class definition itself), regardless of whether anything on the page
actually uses that class. Fixed by asserting on the opening tag
(`class="witness-pill`) instead of the bare class name. Same shape of
mistake as last session's "two strings happened to collide" gotcha:
checking that a substring appears is weaker than checking *where* it
appears.

Verified: `pnpm typecheck` clean, and the full `pnpm test` suite (64/64, 58
pre-existing + 6 new in `spec/witness-confirmation.test.ts`) green against a
single real server instance on port 8080 — confirmed only one server
process was running DB_PATH-pointed at the same file before trusting a
`readonly database` error as a real finding, since a stray second process
holding the same SQLite file open was the actual cause the first time the
suite failed, not a bug in the new code.
