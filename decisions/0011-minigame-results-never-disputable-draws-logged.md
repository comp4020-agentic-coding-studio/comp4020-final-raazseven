# 0011: A mini-game's auto-logged result can't be disputed; manual results can log a draw

## Status

Accepted.

## Context

Two separate asks:

1. **A mini-game's result shouldn't be disputable.** `decisions/0006` gave
   any named winner or loser the right to dispute a result, on the grounds
   that the person who logged it might be wrong or lying — the actual
   problem it was solving was that a result could be fabricated by whoever
   typed it into the manual-logging form. A mini-game's result isn't typed
   in by anyone: it's the server's own observation of real moves both
   players made on the board, computed the same way for every game, with no
   human claim in between to be wrong about. Letting it be "disputed" the
   same way a manually-typed claim can treats a server-computed outcome as
   if it carried the same risk of fabrication a free-text claim does, which
   it doesn't.
2. **A manually-logged result should be able to record a draw.** `results`
   has never had a draw concept — `decisions/0004` explicitly chose not to
   log a mini-game's draw for this reason ("`results` has no draw concept,
   and extending it was out of scope"). That gap is now closed on the
   *manual* side: a group can genuinely tie at something (a drawn chess
   game, a tied group match), and until now the only way to record that
   honestly was either not logging it at all or picking an arbitrary
   winner — both worse than just letting a draw be a real, loggable outcome.

## Decision

**`results` gains a `source` column** (`'manual' | 'minigame'`, defaulting
to `'manual'` for every pre-existing row and every row from the manual
logging route). All three call sites that log a mini-game's outcome
(a normal win, an explicit forfeit, an automatic disconnect-forfeit) now
pass `source: 'minigame'`. `POST /g/:code/results/:id/dispute` rejects a
`'minigame'`-sourced result outright, with its own error message distinct
from the existing "you logged it yourself" and "you're not a named
participant" rejections; the dispute button itself is never rendered for a
`'minigame'` result, the same client-renders-the-affordance,
server-re-checks-the-rule pattern every other gated action in this app
already uses. Witness confirmation is untouched either way — a mini-game
result was never witnessable in the first place (`decisions/0005` scoped
witnessing to manual logging only), so this only closes the dispute half of
the gap.

**`results` gains an `is_draw` column** (boolean, default `false`), settable
only from the manual-logging form — a new third radio alongside the
existing winner/loser selects, "This was a draw." When checked, the form
accepts one set of participants (no winner/loser split) and
`result_participants` records every one of them with `side = 'draw'`,
widening the existing `CHECK (side IN ('winner', 'loser'))` constraint the
same way every other constraint change in this project has: rebuild the
table (SQLite can't widen a `CHECK` in place), copy existing rows across
unchanged. `resultsListFragment` renders a draw as "X & Y drew" rather than
"X beat Y." `headToHeadTally`'s existing win/loss query
(`viewer_side.side != other_side.side`) already excludes a draw for free —
both participants share `side = 'draw'`, so the inequality never matches —
no code change was needed there; the stats dashboard has no separate
"games played" figure to add a draw to, since it never tracked one for any
result. A draw is never witnessable or disputable in a way that differs
from a normal result — the witness/dispute mechanisms both already operate
per-result, not per-outcome-shape, so nothing new was needed there.

## Options considered

1. **Let a mini-game result be disputed, same as any other (status quo,
   rejected).** Conflates "a human might be lying" with "the server computed
   this from real moves" — the two have different failure modes, and
   treating them identically doesn't protect against the one risk a
   server-computed result actually has (a genuine software bug), which a
   social dispute mechanism can't catch or fix anyway.
2. **Add a `'minigame'` source value only to results created after this
   change, leave existing mini-game results disputable (rejected).** Would
   mean the dispute button's visibility depends on *when* a result was
   logged, not *what kind* of result it is — a confusing, undocumented
   distinction a group would have no way to explain. The migration instead
   backfills every existing mini-game-sourced result (identified by game
   name matching `GAME_NAMES`' values, the only reliable existing signal)
   to `'minigame'` before the dispute gate goes live.
3. **A separate `draws` table instead of widening `result_participants`'s
   `side` constraint (rejected).** `result_participants` already models
   "which side was each person on" for a result with any number of
   participants per side — a draw is just the case where there's one side,
   not two. A separate table would duplicate the same participant-roster
   logic (team membership queries, stats aggregation) for no structural
   difference, where widening an existing `CHECK` constraint (the same
   `group_matches`-style rebuild this project has done before) covers it
   with the table that already exists.
4. **Let the stats dashboard count a draw as half a win (rejected).** No
   group asked for that, and it quietly changes what every existing W-L
   number has always meant. Leaving a draw out of the tally entirely keeps
   those numbers' meaning intact.

## Cost

A mini-game result is now the one kind of result in this app nobody can
formally object to — if the server genuinely computed a wrong outcome (a
real bug in `src/minigames.ts`'s win-detection), there is no in-app
mechanism to flag it, only reporting the bug itself. Accepted because that's
a different, rarer failure mode (a software defect, fixable and
version-controlled) than the one disputing exists for (an unverifiable human
claim), and conflating the two would have reintroduced the problem this ADR
set out to fix. A draw's exclusion from the win/loss tally means a
draw-heavy pair's stats page understates how often they've actually played
each other relative to how competitive those games were — a known,
accepted simplification, not solved further here.
