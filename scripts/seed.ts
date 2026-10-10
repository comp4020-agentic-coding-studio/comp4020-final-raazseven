#!/usr/bin/env node
// Populates a database with a handful of groups, members, intra-group
// results, and group-vs-group matches, so every feature in this app has
// something to click through by hand without having to type it all in
// first. Run with `pnpm seed` (DB_PATH defaults to ./data/dev.db --- see
// package.json --- so a stray run never touches the production volume
// unless DB_PATH is explicitly pointed at it).
//
// Uses the real functions from src/db.ts rather than raw SQL, so seeding
// exercises exactly the same code paths the app itself uses (group codes,
// password hashing, member-id-linked results, and so on).
import {
  addGroupMatch,
  addResult,
  createGroup,
  db,
  groupMatchesForGroup,
  membersForGroup,
  registerMember,
  type Group,
  type Member,
} from "../src/db.ts";

interface SeedGroup {
  name: string;
  members: Array<{ name: string; password: string }>;
  results: Array<{ game: string; winner: string; loser: string }>;
}

const SEED_GROUPS: SeedGroup[] = [
  {
    name: "The Office FIFA League",
    members: [
      { name: "Priya", password: "password123" },
      { name: "Marcus", password: "password123" },
      { name: "Tala", password: "password123" },
      { name: "Winston", password: "password123" },
    ],
    results: [
      { game: "FIFA", winner: "Priya", loser: "Marcus" },
      { game: "FIFA", winner: "Marcus", loser: "Tala" },
      { game: "NBA 2K", winner: "Tala", loser: "Winston" },
      { game: "FIFA", winner: "Priya", loser: "Winston" },
    ],
  },
  {
    name: "Uni Housemates",
    members: [
      { name: "Jules", password: "password123" },
      { name: "Noa", password: "password123" },
      { name: "Birdie", password: "password123" },
    ],
    results: [
      { game: "Mario Kart", winner: "Noa", loser: "Jules" },
      { game: "Chess", winner: "Birdie", loser: "Noa" },
      { game: "Mario Kart", winner: "Jules", loser: "Birdie" },
    ],
  },
  {
    name: "Soccer Saturdays",
    members: [
      { name: "Dante", password: "password123" },
      { name: "Esi", password: "password123" },
      { name: "Falk", password: "password123" },
    ],
    results: [{ game: "1v1 soccer", winner: "Esi", loser: "Dante" }],
  },
];

interface SeedGroupMatch {
  groupA: string;
  groupB: string;
  loggedByMember: string; // a member of groupA
  game: string;
  scoreA: number;
  scoreB: number;
}

const SEED_GROUP_MATCHES: SeedGroupMatch[] = [
  {
    groupA: "The Office FIFA League",
    groupB: "Soccer Saturdays",
    loggedByMember: "Priya",
    game: "Soccer",
    scoreA: 3,
    scoreB: 2,
  },
  {
    groupA: "Uni Housemates",
    groupB: "The Office FIFA League",
    loggedByMember: "Jules",
    game: "Trivia night",
    scoreA: 40,
    scoreB: 52,
  },
];

// There's no getGroupByName export --- every other lookup in the app goes by
// code --- so this is the one raw query in the file, used only to make a
// second run skip groups it already created instead of duplicating them.
function findGroupByName(name: string): Group | undefined {
  return db.prepare("SELECT * FROM groups WHERE name = ?").get(name) as Group | undefined;
}

function findMember(members: Member[], name: string): Member {
  const member = members.find((m) => m.name === name);
  if (!member) throw new Error(`seed data error: no member named "${name}"`);
  return member;
}

const createdGroups = new Map<string, Group>();

for (const spec of SEED_GROUPS) {
  const existing = findGroupByName(spec.name);
  if (existing) {
    console.log(`= "${spec.name}" already exists (${existing.code}) --- skipping`);
    createdGroups.set(spec.name, existing);
    continue;
  }

  const group = createGroup(spec.name);
  createdGroups.set(spec.name, group);
  console.log(`+ "${spec.name}" --- code ${group.code}`);

  for (const m of spec.members) {
    registerMember(group.id, m.name, m.password);
    console.log(`  - ${m.name} / ${m.password}`);
  }

  const members = membersForGroup(group.id);
  for (const r of spec.results) {
    const winner = findMember(members, r.winner);
    const loser = findMember(members, r.loser);
    addResult(group.id, r.game, winner.id, loser.id);
  }
  console.log(`  logged ${spec.results.length} result(s)`);
}

for (const m of SEED_GROUP_MATCHES) {
  const groupA = createdGroups.get(m.groupA);
  const groupB = createdGroups.get(m.groupB);
  if (!groupA || !groupB) {
    console.log(`! skipping group match ${m.groupA} vs ${m.groupB} --- a group is missing`);
    continue;
  }

  const alreadyLogged = groupMatchesForGroup(groupA.id).some(
    (existing) =>
      existing.group_b_id === groupB.id &&
      existing.game === m.game &&
      existing.score_a === m.scoreA &&
      existing.score_b === m.scoreB,
  );
  if (alreadyLogged) {
    console.log(`= group match ${m.groupA} vs ${m.groupB} (${m.game}) already logged --- skipping`);
    continue;
  }

  const loggedBy = findMember(membersForGroup(groupA.id), m.loggedByMember);
  addGroupMatch(groupA.id, groupB.id, m.game, m.scoreA, m.scoreB, loggedBy.id);
  console.log(`+ group match: ${m.groupA} ${m.scoreA}–${m.scoreB} ${m.groupB} (${m.game})`);
}

console.log("\nSeeded groups:");
for (const group of createdGroups.values()) {
  console.log(`  ${group.name}: code ${group.code}`);
}
