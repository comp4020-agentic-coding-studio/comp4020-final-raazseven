# Crit 8 — It's alive!

**Draft — written from the repo's evidence (commits, spec, test changes), not
from memory of actually doing the work. Read this and fix anything that
doesn't match what you actually experienced before this counts as your
reflection; the two prompts below are specifically about your judgement and
growth, which isn't something visible from the outside.**

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

*(This is the part I can't write for you — it's genuinely yours. Some
honest prompts, if it helps: Did building the auth layer change how you think
about "done" vs. "technically satisfies the spec"? Did catching the
session-invalidation gap — where logging out only cleared the cookie
client-side but didn't stop a copied token from still working — change how
much you trust a first pass at security-shaped code, your own or an agent's?
Replace this paragraph with your actual answer.)*
