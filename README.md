# Score's in Check

A scorekeeper for friendly competition inside a friend group: create a group,
log who beat who at whatever you play, and keep the record straight instead of
relying on memory and exaggeration.

## Who it's for

Any friend group that already argues about who's better at something — FIFA,
1v1 basketball, a timed LeetCode race, whatever your group actually plays —
and wants the receipts instead of relying on memory and exaggeration.

## What good means here

- **Fairness of record.** The log is the argument-ender. If it isn't logged,
  it didn't happen. The app's only real job is to make logging a result
  effortless enough that people actually do it, and keep it visible to
  everyone in the group.
- **Bragging rights, not a ranking system.** The point isn't a matchmaking
  ladder or a skill rating — it's reviving the locker-room "I've beaten you
  this many times" conversation, with a record behind it.
- **Niche by group, not by platform.** This isn't a FIFA app or a basketball
  app — a group makes its own space and logs whatever it plays there.
  Competition narrows naturally to the people who already hang out and play
  together, so there's no need for matchmaking, skill brackets, or accounts
  that work across groups.

## What I chose not to build (yet)

- **Accounts.** Anyone with a group's code can log a result; the group code is
  the only boundary. That's enough for a dozen friends who already trust each
  other — honesty is the default here, not something to engineer around.
- **Witness confirmation.** Right now any result can be logged on trust.
  Confirmation by a third friend is next week's build, once logging itself is
  solid.
- **A fixed list of supported games.** Deliberately generic — a game name,
  a winner, a loser — so the app never needs updating to add a new sport.
  Richer per-game detail (scores, rounds) can come later if it earns its
  place.

## What shaped this

This app is small on purpose: one friend group, one shared record, nothing to
maintain beyond that. Two pieces of writing argue for that smallness better
than I can:

- Robin Sloan,
  ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/) —
  software made for people you know, without needing to scale, where the
  smallness is the point rather than a limitation.
- Clay Shirky,
  ["Situated Software"](http://shirky.com/essays/situated-software/) —
  on building software "form-fit" to one specific social group instead of a
  generic audience, and trusting that group's own social fabric (not the
  code) to handle what the software doesn't enforce.

This is a first draft, written before most of the app exists. It'll change as
the build does.
