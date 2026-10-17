# Crit 10 — Fly by instruments

## What was the breakthrough that moved the work forward?

I went in with two separate asks: let a result have more than one winner or
loser (a 2v1, a team game), and give each person a profile page showing their
history with a friend. The breakthrough was noticing these aren't two
features — crit 10's own spec line asks for a server-checked decision about
what each person may see, and a profile's shared history *is* that decision,
made concrete. Building the team-result schema first and the profile second
would have meant redoing the schema once I hit the visibility question
anyway, since "who was on which side" is exactly what a head-to-head query
needs. Planning them as one change in
[`decisions/0003-team-results-and-profile-visibility.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0003-team-results-and-profile-visibility.md)
is what let one new table, `result_participants`, serve both.

The harder decision inside that ADR was *whose* membership gates a profile's
visibility — mine, as the viewer, or the other person's. I'd assumed the
natural framing was "can they let me see their data," which gates by the
*target's* membership. Working through it against how the rest of the app
already behaves (a result can't be logged against someone who's left the
group; a removed member disappears from the dropdown live) showed that's
backwards — every other permission check in this app is about who the
*acting* person currently is, not a fact frozen when the data was created.
Gating by the viewer's own current membership is the only version where
leaving a group actually revokes something, which is what crit 10 means by
"checked on the server," not just checked once.

## What did this work change about who I want to be as a software developer?

The real lesson this week was about trusting my own first pass on an edit
inside code I already understood well. I generalized a single-id membership
check to a set check and changed the wording of both error messages along
the way, without first checking whether `spec/scorekeeping.test.ts` asserted
that exact wording — it did, and two previously-green tests broke. The code
was still correct; the tests weren't wrong to care about the words, because
those strings are part of the contract the spec locks down. Running the full
suite before calling the work done, not just the typecheck, is what caught
it, and reverting to the original wording fixed it in a minute. That's a
smaller version of the same discipline crit 9 taught me about checking an
existing test's expectations against a new code path — except this time it
wasn't a new feature touching old code, it was old code I was confident I
understood well enough to not need to check.

The other thing that stuck was re-verifying the deploy the way crit 9 ended:
after pushing, I didn't assume a schema migration against production data
"just worked" because CI's `deploy` job was green. I SSH'd into the live
machine to confirm `result_participants` and `audit_log` actually exist on
`/data/app.db`, and re-opened the live SSE stream to watch a result logged
from one request arrive on a second, independent connection — the same
check, run again, because a migration is exactly the kind of change that can
pass every test locally and still behave differently against real data.
