# 0002: One account per person, not one per group

## Status

Accepted (crit 9, superseding the per-group account design `README.md`
originally described as deliberate).

## Context

The app's accounts were scoped per group: "Sam in The Office FIFA League" and
"Sam in Soccer Saturdays" were two unrelated database rows with two separate
passwords, and the session cookie was literally scoped to that group's URL
path (`/g/:code`) so it was invisible anywhere else on the site. `README.md`
called this out as a choice, not a gap — a "home-cooked app" reasoning: small,
trust-based, nothing to maintain.

Used for real, walking through it from each user's perspective, it doesn't
hold up:

- Logging in asked for a group code before the site would even say who you
  were — there was no way to just sign in.
- Someone in more than one friend group needed a separate login, and a
  separate password to remember, per group.
- Nothing on any page showed you were signed in unless you were looking
  straight at one specific group's card.
- There was no profile: an identity existed only as a row inside one group's
  member table, not as a person with a name, a photo, and a list of the
  groups they're actually in.
- "Anyone signed into this group can do anything in it" meant a group's
  creator had no more standing than someone who joined five minutes ago —
  there was no role to even hang permissions off.

## Decision

Accounts are global now. `users` (name UNIQUE, globally — not just within a
group) replaces per-group identity; `memberships` (user_id, group_id, role)
is the join table recording who's in which group and as what. A `role` of
`'owner'` (the group's creator) or `'member'` gates two actions: editing the
group's profile (bio/tags/photo) and removing a member. Everything else a
member could already do (log a result, log a group match) stays open to any
member, same as before — the new gate is additive, not a general lockdown.

Login is one global `session` cookie (`path: "/"`), not one path-scoped
cookie per group. `/signup` and `/login` work with no group code. `/me` is a
dashboard: your profile, every group you're in, your role in each, and
create/join actions. The shared header (`siteHeader`, `src/styles.ts`) shows
who's signed in — or that nobody is — on every single page, not just inside
one group's card, which is what actually answers "it doesn't show I'm logged
in."

Creating or joining a group now requires being signed in first (redirecting
to `/signup?next=...` or `/login?next=...` otherwise) — the account step
happens once, up front, not folded into each group's own form.

## Options considered

1. **Keep per-group accounts, just show a nicer "logged in" indicator per
   page.** Rejected: it patches the symptom (no visible login state) without
   touching the actual complaint — a real person still has no single
   identity, still can't be in two groups under one login, still has no
   profile, and there's still no meaningful concept of a role.
2. **Link per-group accounts together by email, keeping separate
   passwords/avatars per group.** Rejected: this is extra machinery (a
   linking table, a "which of these groups is this?" lookup) in service of
   something a single global account already gives for free, and it still
   leaves someone remembering a different password per group.
3. **Global accounts with a `memberships` join table (chosen).** One
   password, one profile, one photo, membership (and role) per group just a
   row in a join table — the simplest shape that actually matches "one
   person, several groups."

## Migration

The old `members` table is kept as-is (never dropped — same "don't destroy
data" rule this app has followed all along) and used as the one-time
migration source. On startup, every not-yet-migrated `members` row becomes
its own new `users` row (same password hash, so existing passwords keep
working) plus a `memberships` row; the member with the lowest `id` in each
group becomes that group's owner, everyone else a plain member.

Each old membership becomes its **own** new account — deliberately, not
merged by name. Two different groups could each have had their own unrelated
"Sam," and silently merging those into one account on name alone would be a
real account-takeover bug (whoever happens to migrate second inherits the
first Sam's identity), not a convenience. Because `users.name` is unique
globally now where member names only had to be unique within one group, a
name collision across groups during migration gets a numeric suffix
(`Sam-2`) instead.

## Cost

A name now has to be unique across the whole app, not just within one group
— the thing that makes "Sam-2" possible above. That's a real, visible cost
to someone who picks a common name and finds it's taken by a stranger in an
unrelated group; it's accepted because the alternative (two different real
people sharing one login) is worse. The migration's name-collision suffixing
is a known rough edge, left as-is rather than solved further, since nobody's
continuity depends on it yet (this is still a pre-launch app being built for
crit 9, not one with real users mid-migration).
