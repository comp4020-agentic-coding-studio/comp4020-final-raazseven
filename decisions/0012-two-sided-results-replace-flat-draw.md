# 0012: A manual result is always two sides plus an outcome, not a flat draw list

## Status

Accepted.

## Context

Reported directly, right after `decisions/0011` shipped: a draw renders as
one flat "Priya & Marcus drew" list with no sides, which can't say anything
once a draw is between teams rather than individuals --- "Priya & Jordan
drew with Marcus & Noor" can't come out of a single "who drew?" select, only
"these four people were all in a drawn result together," losing which pair
was against which. Two more complaints came with it: "Winner(s)" /
"Loser(s)" as labels don't fit once the same idea also has to cover a draw
(nobody "won" or "lost" one), and the player-selection boxes don't visually
line up with the rest of the form.

The misalignment traces to one missing rule: `input` has `width: 100%`
(`src/styles.ts`), `select` never did --- every multi-select in the
log-result form sized to its own intrinsic width instead of stretching to
match the `Game` field above it.

The deeper issue is the shape `decisions/0011` chose: a draw as a third,
separately-toggled field group (`#draw-fields`, one flat `participants`
select) alongside the existing two-field win/loss group
(`#winner-loser-fields`), with `result_participants` recording every
drawn participant under one `side = 'draw'` value. That shape assumed a
draw has no sides at all, true for an individual draw but false for a tied
team match --- the same gap `decisions/0004` left open for a mini-game's
draw, reproduced here in the manual path by a different route.

## Decision

**One pair of selects, one outcome choice, no third field group.** The
form's two existing selects (`id="winner-select"` name=`winner`,
`id="loser-select"` name=`loser` --- DOM ids/names unchanged, so
`liveScript`'s existing live-member-list swap needs no change) are
relabelled "Side A" / "Side B"; the checkbox and `#draw-fields` are gone,
replaced with one outcome radio group: "Side A won" / "Side B won" /
"Draw". A draw is not a separate code path any more --- `addResult()` gains
an `isDraw` flag, and `result_participants` always records the two
selected groups under `side = 'winner'`/`side = 'loser'` (meaning "Side A"/
"Side B" when `is_draw = 1`, same two columns a win/loss already uses), so
a tied team match keeps both its sides on record, not a single flattened
list. `addDrawResult()` is deleted; every result (win, loss, or draw) now
goes through the one `addResult()` path, which is what makes "both sides
survive a draw" actually true rather than true-in-the-form-but-flattened-
at-storage.

`winner`/`loser` (text) now store Side A's and Side B's names respectively
for a draw too, instead of the same joined list twice --- `"${result.winner}
drew with ${result.loser}"` reads correctly wherever the old
`"${result.winner} beat ${result.loser}"` phrase was used (the audit log,
and the witness/dispute confirmation log lines, which a draw can now reach
too, since witnessing was never specifically disallowed for one and the
unified path no longer special-cases it out).

**The server keeps the `winner`/`loser` field names on the wire**, adding
only an optional `outcome` field (`"a" | "b" | "draw"`, default `"a"` when
absent). Every validation (non-empty sides, no overlap, group membership,
witness eligibility) runs once, before the outcome is even read, then
`outcome` only decides which field's ids become `addResult`'s winnerIds vs
loserIds (`"b"` swaps them) and whether `isDraw` is set. Every existing
test that posts `{winner, loser}` with no `outcome` at all keeps working
byte-for-byte, since that's exactly the pre-existing default path --- only
the draw-specific tests, which already had to change shape, needed
rewriting.

**`headToHeadTally` excludes `is_draw = 1` rows** from its win/loss count
(`AND results.is_draw = 0`), which the old flat-`'draw'` shape got for free
(a draw's two "sides" were both literally `side = 'draw'`, so the tally's
own `side != side` comparison already excluded them) --- reusing
`'winner'`/`'loser'` for a draw's two sides removes that free exclusion, so
it has to be stated explicitly now. `headToHeadResults`/`teamedUpResults`
(profile history, not the tally) get no such filter --- a draw is real
history worth showing, just not a counted win or loss, so it now correctly
sorts into head-to-head (opposing sides) or teamed-up (same side) exactly
like a win/loss would, instead of always landing under "teamed up" the way
the old one-sided shape forced it to.

Validation copy drops "winner"/"loser" wording too, matching the form:
"each side needs at least one player", "the same player can't be on both
sides", "everyone named must be a member of this group", "the witness
can't already be named on either side" --- visible error text, so it
shouldn't say "winner" when the boxes above it say "Side A".

**`select` gains `width: 100%`** (`src/styles.ts`), matching `input`'s
existing rule, fixing the reported misalignment directly rather than
special-casing the result form's selects. The outcome radio row reuses a
renamed, now-generic `.radio-row` class (previously `.avatar-choice`,
single prior use in `newGroupPage`) instead of duplicating its five-line
flex layout a second time under a misleading name.

Explicitly out of scope, confirmed with the person first: group-vs-group
results (`decisions/0003`'s "Log a match against another group" card,
`group_matches`) are a separate feature already covering "one group win
against another" and aren't folded into this form.

## Options considered

1. **Keep the checkbox-gated third field group, just rename the labels and
   fix `select`'s width (rejected).** Fixes the CSS bug and the visible
   wording, but leaves a drawn team match unable to record its own two
   sides at all --- the actual complaint that prompted this ADR.
2. **Rename the wire fields to `sideA`/`sideB` plus `outcome` (rejected in
   favor of keeping `winner`/`loser` on the wire).** Functionally
   equivalent, but would have required updating every existing spec file
   that posts a manual result (`scorekeeping`, `witness-confirmation`,
   `team-matches`, `stats`, `profiles`, `live-updates`) for a change that
   doesn't touch their behavior at all. Keeping the wire names and
   defaulting `outcome` to `"a"` when absent means every one of those files
   needed no changes --- only the two files that actually exercise draws.
3. **Add a `'draw_a'`/`'draw_b'` pair of `side` values instead of reusing
   `'winner'`/`'loser'` (rejected).** Would need yet another
   `result_participants` CHECK-constraint rebuild and a third code path in
   every reader (`resultsListFragment`, `headToHeadTally`,
   `teamedUpResults`) to recognize it. Reusing `'winner'`/`'loser'` needs no
   schema change at all (the CHECK already allows them) and only one new
   filter (`is_draw = 0`) in the one query that would otherwise
   mis-categorize a draw as a scored result.

## Cost

A once-off: any result logged under `decisions/0011`'s short-lived flat-draw
shape (`side = 'draw'` for every participant) renders and disputes
correctly via a backward-compatible fallback (`resultsListFragment` checks
for `side = 'draw'` rows first, falling back to the new two-sided
`'winner'`/`'loser'` read only when none exist), but can never be
retroactively split into its real two sides --- that information was never
captured in the old shape, and no migration can invent it. Accepted because
`decisions/0011` shipped hours before this ADR, in the same session, with
no realistic chance of a real draw logged against it yet; the fallback is
cheap insurance, not a load-bearing migration.
