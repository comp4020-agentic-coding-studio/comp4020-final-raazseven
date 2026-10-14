# 0003: Team results, and whose membership gates a profile's history

## Status

Accepted (crit 10).

## Context

Results were strictly 1v1: `results.winner`/`loser` (and
`winner_user_id`/`loser_user_id`) held exactly one person per side. That
doesn't cover a 2v1, or a team game played N-a-side, which is a real shape
of result a group plays and wants recorded as one result, not several
separate 1v1 entries that misrepresent who was actually on the court.

Separately, crit 10 requires the app to be multi-user with what each person
may see and change "checked on the server, and that decision written down in
the repo with why" (the brief's own words). Adding per-user profile pages
(so a result's names link somewhere, and a friend's head-to-head record is
visible) makes that decision concrete: a profile page shows history between
the viewer and its owner, but that history is private between people who
play together, not public to anyone who knows a user id. Something has to
decide which shared history a given viewer is allowed to see, and that
something has to run on the server, not just be a link nobody who isn't
supposed to see it happens to be given.

## Decision

**Team results.** A new table, `result_participants (result_id, user_id,
side)`, holds one row per person per side --- any number of winners, any
number of losers. `results.winner`/`loser` (text) and
`winner_user_id`/`loser_user_id` keep storing only the first name/id per
side, unchanged, so every existing render path, test, and the live-update
fragment keeps working for a plain 1v1 without modification;
`result_participants` is the full roster once a side has more than one
person. The log-a-result form's winner/loser pickers become
`<select multiple>` instead of two single selects --- a 1v1 is just the
one-selection-per-side case of the same form, not a special path.

**Profile visibility.** `GET /u/:id` shows a user's profile to anyone, but
head-to-head and teamed-up history with the viewer is computed and shown
only when **the viewer currently belongs to a group the profile's owner is
also (or was) a member of** --- checked server-side in
`headToHeadResults`/`teamedUpResults` (`src/db.ts`), which both filter to
`membershipsForUser(viewerId)` before ever reading a result row. The
boundary is the *viewer's* membership, not the target's: once you've shared
a group with someone, every result inside that group (not just the ones
between the two of you) stays visible to you through that membership,
because the result itself was never private to the group's own page in the
first place. What the boundary actually gates is *whose groups you can see
through at all* --- a person you've never shared a group with has no path to
your results, even knowing your user id.

## Options considered

1. **A fixed `winner_member_id`/`loser_member_id` pair, just widened to
   arrays in the same columns.** Rejected: SQLite has no array column type
   worth using here, and encoding a list into a text column would mean
   parsing it back out everywhere a single id is read today --- every
   existing query, test, and render path would need to change at once,
   exactly the kind of "redo it twice" this ADR's own context describes
   wanting to avoid.
2. **Profile visibility gated by the target's membership, not the
   viewer's.** Considered because it reads naturally as "can this person
   see *my* data" --- but it means someone who leaves a group (or who the
   group removes) keeps every other member's history visible forever,
   since the check never re-runs against what the *owner* currently
   belongs to. That's backwards from what crit 9's and 10's gating already
   does elsewhere (a result can't be logged against a non-member; a
   removed member's dropdown entry disappears live) --- those checks are
   about who the *actor* currently is, not a fact frozen at the time the
   data was created.
3. **Viewer's current membership gates visibility (chosen).** Matches the
   access pattern already used for logging a result (`memberInGroup`
   checked against the acting user, not the target). It's also the only
   option where visibility can be revoked: if a group removes someone,
   every *other* member's ability to see that removed person's shared
   history through that group goes with the removal, the next time anyone
   queries it, with no separate "revoke access" step to remember.

## Cost

Someone who leaves (or is removed from) every group they ever shared with a
particular friend loses their own view of that friend's head-to-head record,
even for matches that already happened and that they were genuinely part of
--- there's no separate "you were there, so you always get to see it"
grandfather clause. The alternative (visibility sticks forever once
established) was rejected because it leaks data to someone a group has since
decided shouldn't have it; this cost is the one taken on instead, and it's a
visibility loss (the data isn't deleted, `audit_log` and the result rows
themselves are untouched), not a data loss.
