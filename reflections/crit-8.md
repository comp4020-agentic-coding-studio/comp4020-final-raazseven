# Crit 8 — It's alive!

## What was the breakthrough that moved the work forward?

The first version ([`c3514c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/c3514c8))
satisfied the spec's letter — a stranger could create a group, log a result,
and find it persisted — but not its substance: anyone holding the group's
code could log a result as anyone else, so there was no "them" to have a
trace at all. The breakthrough was re-reading the spec line itself ("find
their trace still there when they come back") slowly enough to notice *as
them* was doing real work in that sentence, rather than treating "data
persists" as the whole bar. That reframing is what turned into accounts,
password hashes, and session cookies scoped per group
([`1c9b90a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-raazseven/commit/1c9b90a))
instead of just shipping the honour-system version.

## What did this work change about who I want to be as a software developer?

Before this week, "done" meant the spec's words were technically true — the
first version really did let a stranger log a result and see it persist, and
it would have been easy to call that finished. Going back and finding the gap
between "data persists" and "their trace, as them" is what changed how I read
a spec line now: I treat the exact wording as the actual bar, not a rough
description of a feature to approximate, and I ask what it would take for the
sentence to be false before I call something done.

The other shift was about trusting a first pass at anything security-shaped.
The first cut of logout only cleared the cookie on the client, which looks
correct in a quick manual check — the browser stops sending it — but doesn't
stop a copied token from still authenticating against the server. Catching
that meant writing the test for the failure mode first, not just the happy
path, and I want that to be the default now rather than something I remember
to do only for code that's obviously about auth: any state that can be copied
or replayed needs a test that tries to replay it, agent-written or not.
