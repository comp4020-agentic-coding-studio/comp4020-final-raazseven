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
