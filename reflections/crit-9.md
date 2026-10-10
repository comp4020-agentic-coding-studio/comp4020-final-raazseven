# Crit 9 — All at once

## What was the breakthrough that moved the work forward?

I went into this week with four things on the list: membership-gated
results, avatars, group-vs-group matches, and crit 9's real-time requirement
— planned as four separate items. The breakthrough was noticing, while
writing the plan out with the agent rather than approving each feature as it
came up, that the first three weren't separate from the fourth. Once logging
a result requires picking a real member instead of typing any name, a person
who's just joined is invisible in everyone else's already-open form until
they reload — exactly the problem real-time is supposed to solve, just
relocated one step earlier in the flow. That's what turned "push only new
results live" (the literal minimum crit 9 asks for) into "push results,
group matches, and new members" — the decision recorded in
[`decisions/0001-live-update-scope.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/blob/main/decisions/0001-live-update-scope.md).
Nobody asked for that explicitly; it fell out of taking both halves of the
week seriously at once instead of building them in sequence.

## What did this work change about who I want to be as a software developer?

Crit 8 taught me to read a spec line literally before calling something
done. This week taught me the companion habit: when I have several things I
want to build in the same stretch, plan them together before writing code,
specifically to ask whether they interact. Built as two unrelated tickets —
membership-gating first, real-time second — I'd have shipped a live feed
that was technically compliant and practically useless the moment a group
got a new member mid-session: green tests, wrong app. Writing the plan down
first, and treating "does this feature change what the other one means" as
its own question, is what caught that before it shipped. I want that to be
the default for any week with more than one thing on the list, not just the
weeks where the interaction happens to be obvious.
