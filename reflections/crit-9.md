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

A second breakthrough came later in the same week, from being handed a
complaint rather than a feature request: pressing "log in" asked for a group
code before the site would say who I was, nothing showed I was signed in
anywhere outside one group's card, and there was no way to be one person in
two groups. The useful move wasn't jumping straight to "add a login page" —
it was working through each kind of user's actual path through the app first
(a returning user, someone in more than one group, a group's creator versus
someone who just joined) and noticing that the per-group account model I'd
called deliberate as recently as crit 8 was the thing actually causing all
four complaints at once, not four separate small bugs. Naming the single
cause is what turned it into one coherent architecture change — global
accounts, a membership table, a role — instead of four unrelated patches
that would have left the underlying shape the same.

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

Later the same week, being asked directly whether I'd tested every feature
was a smaller version of the same lesson. My honest answer wasn't "yes" — it
was "let me check," and checking turned up three real gaps that had been
sitting there since crit 8: a live broadcast confirmed only by its eventual
effect, never caught live; an outcome branch no test's inputs happened to
hit; two rejection paths enforced in the database layer but never asserted
anywhere. None of those were new mistakes — they were old ones I hadn't gone
looking for, and the only reason I found them was treating "did you test it"
as a question to re-derive the answer to, not a status I already knew.

The same week then gave me three smaller versions of a third pattern:
a mandatory photo, a free-text tags field, and a form crammed onto the home
page were each, in turn, exactly what I'd asked for and still wrong once I
actually looked at the running app — broke a pattern already set elsewhere,
wasn't a real tag system, didn't fit next to a one-field "log in" card. Each
got caught by using it, not by re-reading the request. And when I went back
to check the crit-9 requirements were still met, the process files recording
all of this had quietly stopped being true three commits earlier — the same
failure mode, one level up: I'd trust that a document was current because I
remembered writing it, instead of checking it against what the repo actually
said now.

Reversing the per-group account decision added one more version of that same
discipline: a decision I'd written down as deliberate (`README.md`: "that's
on purpose, not a gap") turned out not to survive contact with someone
actually using the app that way, and the honest response was to write a new
ADR saying so plainly rather than quietly editing the old claim away. The
same week also taught me not to trust a pile of failing tests at face value:
making account names globally unique broke a dozen tests at once, almost all
reporting as timeouts, which looked exactly like "the new code made the
server slow." Isolating one failing file instead of reacting to the whole
pile is what separated a real bug (a handful of tests reusing the same
literal names across files) from an artifact of running several test files
against one shared server at once — the failure count dropped from a dozen
to one the moment I stopped treating every red line as the same kind of
problem.
