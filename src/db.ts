import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const dbPath = process.env.DB_PATH ?? "/data/app.db";
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    game TEXT NOT NULL,
    winner TEXT NOT NULL,
    loser TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Superseded by users/memberships below (a "member" used to be an account
  -- scoped to one group). Kept as the migration source, not dropped --- see
  -- the migration further down.
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, name COLLATE NOCASE)
  );

  -- One final score per match between two whole groups (e.g. "group A beat
  -- group B 3-2 at soccer"), separate from the player-level results above.
  -- Shows up on both groups' pages via group_a_id/group_b_id.
  CREATE TABLE IF NOT EXISTS group_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_a_id INTEGER NOT NULL REFERENCES groups(id),
    group_b_id INTEGER NOT NULL REFERENCES groups(id),
    game TEXT NOT NULL,
    score_a INTEGER NOT NULL,
    score_b INTEGER NOT NULL,
    logged_by_member_id INTEGER NOT NULL REFERENCES members(id),
    created_at TEXT NOT NULL
  );

  -- A real, shared vocabulary of tags --- "category" is one of video-game /
  -- sport / board-game (the curated picker, seeded below) or custom (typed
  -- by a group, reused by name if another group types the same one). Many
  -- groups can share one tag and one group can have many, hence the join
  -- table rather than a column on groups.
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_tags (
    group_id INTEGER NOT NULL REFERENCES groups(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (group_id, tag_id)
  );

  -- A person, once, globally --- not once per group. "members" (above) was
  -- the opposite of this; see decisions/0002-global-accounts.md for why that
  -- changed. name is globally unique (COLLATE NOCASE), where it only had to
  -- be unique within a group before.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    avatar_blob BLOB,
    avatar_mime TEXT,
    avatar_updated_at TEXT,
    created_at TEXT NOT NULL
  );

  -- A user's role in one group. A user's groups and a group's members are
  -- both just queries over this table --- the many-to-many that "members"
  -- (one row per group, no shared identity) couldn't express.
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_id INTEGER NOT NULL REFERENCES groups(id),
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, group_id)
  );

  -- One row per person per side of a result --- lets a result have any
  -- number of winners and losers (a 2v1, a 3v3), not just exactly one of
  -- each. results.winner/loser (text) and winner_user_id/loser_user_id stay
  -- as the first name/id per side, for every render path and test that
  -- predates team results; this table is the full roster.
  CREATE TABLE IF NOT EXISTS result_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL REFERENCES results(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    side TEXT NOT NULL CHECK (side IN ('winner', 'loser'))
  );

  -- One row per named participant who disputes a result
  -- (decisions/0006-named-party-disputes-and-logger-attribution.md) ---
  -- append-only, same "never delete, never silently resolve" posture as a
  -- witness's denial, extended to every winner/loser named in the result,
  -- not just an optional witness. UNIQUE so the same person disputing twice
  -- is a no-op, not a second row inflating the count.
  CREATE TABLE IF NOT EXISTS result_disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL REFERENCES results(id),
    disputed_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE(result_id, disputed_by_user_id)
  );

  -- Who did what, server-side, kept forever (crit 10: "the logging outlives
  -- the crit") --- a durable companion to the request logger (src/server.ts's
  -- Fastify logger), which flyctl logs can tail live but doesn't retain past
  -- the machine's own log buffer.
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    group_id INTEGER REFERENCES groups(id),
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Migration: earlier deploys created `members` without a password (names
// only). Add the column if it's missing, rather than wiping the table.
const memberColumns = db.prepare("PRAGMA table_info(members)").all() as Array<{ name: string }>;
if (!memberColumns.some((c) => c.name === "password_hash")) {
  db.exec("ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

// Migration: avatars are optional on members, groups, and (now) users ---
// NULL means "use the generated one" (src/avatars.ts). Added in place so a
// stranger's data from before this feature survives the deploy that
// introduces it.
function addAvatarColumnsIfMissing(table: "members" | "groups" | "users"): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("avatar_blob")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_blob BLOB`);
  if (!names.has("avatar_mime")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_mime TEXT`);
  if (!names.has("avatar_updated_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_updated_at TEXT`);
}
addAvatarColumnsIfMissing("members");
addAvatarColumnsIfMissing("groups");
addAvatarColumnsIfMissing("users"); // users is created with these columns already; a no-op in practice, kept for symmetry

// Migration: a group's profile --- bio is mandatory for a group created from
// here on (src/server.ts enforces that), but nullable here so a group
// created before this feature shipped still loads instead of 500ing. `tags`
// was briefly a comma-separated column on groups itself; superseded below by
// the real tags/group_tags tables, but the column stays (unused from here
// on) rather than risking a DROP COLUMN on somebody's live data.
const groupColumns = db.prepare("PRAGMA table_info(groups)").all() as Array<{ name: string }>;
if (!groupColumns.some((c) => c.name === "bio")) {
  db.exec("ALTER TABLE groups ADD COLUMN bio TEXT");
}
if (!groupColumns.some((c) => c.name === "tags")) {
  db.exec("ALTER TABLE groups ADD COLUMN tags TEXT");
}

// Seed the curated tag picker. INSERT OR IGNORE: safe to run on every start,
// and a group that already picked one of these keeps pointing at the same
// row either way.
const CURATED_TAGS: Record<string, string[]> = {
  "video-game": [
    "FIFA",
    "NBA 2K",
    "Call of Duty",
    "Fortnite",
    "Minecraft",
    "League of Legends",
    "Valorant",
    "Among Us",
    "Mario Kart",
    "Super Smash Bros",
    "Overwatch",
    "Rocket League",
    "Apex Legends",
    "Counter-Strike",
    "Animal Crossing",
  ],
  sport: [
    "Soccer",
    "Basketball",
    "Tennis",
    "Table Tennis",
    "Badminton",
    "Volleyball",
    "Pool",
    "Darts",
    "Bowling",
    "Golf",
    "Ultimate Frisbee",
    "Running",
  ],
  "board-game": [
    "Chess",
    "Monopoly",
    "Catan",
    "Trivia",
    "Poker",
    "Uno",
    "Scrabble",
    "Risk",
    "Codenames",
    "Jenga",
    "Dungeons & Dragons",
    "Magic: The Gathering",
  ],
};
const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)");
for (const [category, names] of Object.entries(CURATED_TAGS)) {
  for (const name of names) insertTag.run(name, category);
}

// Migration: move any pre-tags-table `groups.tags` CSV value into the real
// tables, for a group created in the brief window where tags lived there.
function legacyParseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
const groupsWithLegacyTags = db
  .prepare("SELECT id, tags FROM groups WHERE tags IS NOT NULL AND tags != ''")
  .all() as Array<{ id: number; tags: string }>;
for (const g of groupsWithLegacyTags) {
  if (db.prepare("SELECT 1 FROM group_tags WHERE group_id = ?").get(g.id)) continue; // already migrated
  for (const name of legacyParseTags(g.tags)) {
    const tag = findOrCreateTag(name, "custom");
    db.prepare("INSERT OR IGNORE INTO group_tags (group_id, tag_id) VALUES (?, ?)").run(g.id, tag.id);
  }
}

// Migration: results predate member accounts entirely --- winner/loser were
// (and still are, for display) free text. winner_member_id/loser_member_id
// let a result from that era point at the real member it was logged
// against; winner_user_id/loser_user_id (added alongside, not replacing
// them) do the same for the global-accounts era below. A result logged
// before either existed, or before this migration ran, simply has both
// pairs NULL and displays with no avatar --- the same graceful fallback
// avatars already had before they existed at all.
const resultColumns = db.prepare("PRAGMA table_info(results)").all() as Array<{ name: string }>;
if (!resultColumns.some((c) => c.name === "winner_member_id")) {
  db.exec("ALTER TABLE results ADD COLUMN winner_member_id INTEGER REFERENCES members(id)");
}
if (!resultColumns.some((c) => c.name === "loser_member_id")) {
  db.exec("ALTER TABLE results ADD COLUMN loser_member_id INTEGER REFERENCES members(id)");
}
if (!resultColumns.some((c) => c.name === "winner_user_id")) {
  db.exec("ALTER TABLE results ADD COLUMN winner_user_id INTEGER REFERENCES users(id)");
}
if (!resultColumns.some((c) => c.name === "loser_user_id")) {
  db.exec("ALTER TABLE results ADD COLUMN loser_user_id INTEGER REFERENCES users(id)");
}

// Migration: witness confirmation (decisions/0005-witness-confirmation.md).
// `witness_user_id` is optional --- a result logged with no witness keeps
// working exactly as before, with status 'none'. A result logged before this
// feature shipped also lands on 'none' (DEFAULT), the same "no witness, same
// as every result before this existed" fallback the winner/loser-id columns
// above already use.
if (!resultColumns.some((c) => c.name === "witness_user_id")) {
  db.exec("ALTER TABLE results ADD COLUMN witness_user_id INTEGER REFERENCES users(id)");
}
if (!resultColumns.some((c) => c.name === "witness_status")) {
  db.exec("ALTER TABLE results ADD COLUMN witness_status TEXT NOT NULL DEFAULT 'none'");
}

// Migration: logger attribution
// (decisions/0006-named-party-disputes-and-logger-attribution.md) --- nullable
// so a result logged before this column existed (or by code that predates
// this change) simply shows no logger, same fallback every earlier nullable
// column on this table already uses.
if (!resultColumns.some((c) => c.name === "logged_by_user_id")) {
  db.exec("ALTER TABLE results ADD COLUMN logged_by_user_id INTEGER REFERENCES users(id)");
}

// Migration: group_matches.logged_by_member_id was declared NOT NULL back
// when a member was the only kind of account --- SQLite can't relax a NOT
// NULL constraint with a plain ALTER TABLE, so this rebuilds the table the
// standard safe way (rename, recreate, copy, drop) the one time it's
// needed, guarded so it only ever runs once.
const groupMatchColumns = db.prepare("PRAGMA table_info(group_matches)").all() as Array<{ name: string }>;
if (!groupMatchColumns.some((c) => c.name === "logged_by_user_id")) {
  db.exec(`
    ALTER TABLE group_matches RENAME TO group_matches_pre_accounts;

    CREATE TABLE group_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_a_id INTEGER NOT NULL REFERENCES groups(id),
      group_b_id INTEGER NOT NULL REFERENCES groups(id),
      game TEXT NOT NULL,
      score_a INTEGER NOT NULL,
      score_b INTEGER NOT NULL,
      logged_by_member_id INTEGER REFERENCES members(id),
      logged_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    INSERT INTO group_matches
      (id, group_a_id, group_b_id, game, score_a, score_b, logged_by_member_id, created_at)
      SELECT id, group_a_id, group_b_id, game, score_a, score_b, logged_by_member_id, created_at
      FROM group_matches_pre_accounts;

    DROP TABLE group_matches_pre_accounts;
  `);
}

// Migration: every "member" (an account scoped to one group) becomes its
// OWN new "user" (a global account) plus a membership recording its role in
// that one group --- never merged by name across groups, since two
// different real people coincidentally sharing a name is a security bug to
// avoid, not a convenience to assume. Tracked via members.migrated_user_id
// so this only ever processes a given old row once. Because a user's name
// is now globally unique where a member's name only had to be unique within
// its group, two members who happened to share a name across different
// groups get a numeric suffix on the second one (`Sam-2`) --- a known rough
// edge, not solved further, since nothing in this app depends on that
// continuity yet.
const membersTableColumns = db.prepare("PRAGMA table_info(members)").all() as Array<{ name: string }>;
if (!membersTableColumns.some((c) => c.name === "migrated_user_id")) {
  db.exec("ALTER TABLE members ADD COLUMN migrated_user_id INTEGER REFERENCES users(id)");
}

function uniqueUserName(desired: string): string {
  let candidate = desired;
  for (let suffix = 2; db.prepare("SELECT 1 FROM users WHERE name = ? COLLATE NOCASE").get(candidate); suffix++) {
    candidate = `${desired}-${suffix}`;
  }
  return candidate;
}

interface LegacyMemberRow {
  id: number;
  group_id: number;
  name: string;
  password_hash: string;
  avatar_blob: Buffer | null;
  avatar_mime: string | null;
  avatar_updated_at: string | null;
  created_at: string;
}

const unmigratedMembers = db
  .prepare("SELECT * FROM members WHERE migrated_user_id IS NULL")
  .all() as unknown as LegacyMemberRow[];

if (unmigratedMembers.length > 0) {
  const earliestMemberIdByGroup = new Map<number, number>();
  for (const row of db.prepare("SELECT group_id, MIN(id) AS min_id FROM members GROUP BY group_id").all() as Array<{
    group_id: number;
    min_id: number;
  }>) {
    earliestMemberIdByGroup.set(row.group_id, row.min_id);
  }

  for (const m of unmigratedMembers) {
    const name = uniqueUserName(m.name);
    if (name !== m.name) {
      console.log(
        `migration: "${m.name}" (group ${m.group_id}) already taken globally --- creating this account as "${name}" instead`,
      );
    }
    const token = randomBytes(24).toString("base64url");
    const info = db
      .prepare(
        "INSERT INTO users (name, password_hash, token, avatar_blob, avatar_mime, avatar_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(name, m.password_hash, token, m.avatar_blob, m.avatar_mime, m.avatar_updated_at, m.created_at);
    const userId = info.lastInsertRowid as number;
    const role: Role = earliestMemberIdByGroup.get(m.group_id) === m.id ? "owner" : "member";
    db.prepare("INSERT OR IGNORE INTO memberships (user_id, group_id, role, created_at) VALUES (?, ?, ?, ?)").run(
      userId,
      m.group_id,
      role,
      m.created_at,
    );
    db.prepare("UPDATE members SET migrated_user_id = ? WHERE id = ?").run(userId, m.id);
  }
}

// Migration: result_participants didn't exist before team results ---
// backfill one row per side for every result logged before this feature
// shipped, from its existing winner_user_id/loser_user_id, so old 1v1
// results show up in head-to-head/teamed-up history the same as new ones.
// Guarded by "already has participant rows" so this only ever runs once per
// result, same idempotency style as the column-presence checks above.
const resultsNeedingBackfill = db
  .prepare(
    `SELECT id, winner_user_id, loser_user_id FROM results
     WHERE id NOT IN (SELECT DISTINCT result_id FROM result_participants)
       AND winner_user_id IS NOT NULL AND loser_user_id IS NOT NULL`,
  )
  .all() as Array<{ id: number; winner_user_id: number; loser_user_id: number }>;
const insertParticipant = db.prepare(
  "INSERT INTO result_participants (result_id, user_id, side) VALUES (?, ?, ?)",
);
for (const r of resultsNeedingBackfill) {
  insertParticipant.run(r.id, r.winner_user_id, "winner");
  insertParticipant.run(r.id, r.loser_user_id, "loser");
}

export interface Avatar {
  avatar_blob: Buffer | null;
  avatar_mime: string | null;
  avatar_updated_at: string | null;
}

export interface Group extends Avatar {
  id: number;
  code: string;
  name: string;
  bio: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  category: string;
}

/** Every curated tag, grouped by category, in the fixed display order the
 * picker uses --- "custom" tags (typed by a group, not from the curated
 * list) are deliberately left out: they're one-off by nature, and showing
 * every custom tag anyone's ever typed would make the picker grow without
 * bound. Re-typing an existing custom tag's name still reuses its row
 * (findOrCreateTag), it just isn't offered as a checkbox.
 */
export function curatedTagsByCategory(): Record<string, Tag[]> {
  const rows = db
    .prepare("SELECT * FROM tags WHERE category != 'custom' ORDER BY name")
    .all() as unknown as Tag[];
  const byCategory: Record<string, Tag[]> = { "video-game": [], sport: [], "board-game": [] };
  for (const row of rows) (byCategory[row.category] ??= []).push(row);
  return byCategory;
}

export function tagById(id: number): Tag | undefined {
  return db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as Tag | undefined;
}

/** Looks up a tag by name (case-insensitive) or creates it --- this is how a
 * group's custom tag text becomes a real row instead of a second, parallel
 * storage mechanism, and how the legacy-CSV migration above reuses a
 * curated tag's row instead of creating "FIFA" and "fifa" as two rows. */
function findOrCreateTag(name: string, category: string): Tag {
  const existing = db.prepare("SELECT * FROM tags WHERE name = ? COLLATE NOCASE").get(name) as Tag | undefined;
  if (existing) return existing;
  const info = db.prepare("INSERT INTO tags (name, category) VALUES (?, ?)").run(name, category);
  return tagById(info.lastInsertRowid as number)!;
}

/** Sets a group's tags to exactly `tagIds` plus one real tag per name in
 * `customNames` (created if they don't already exist). Replaces whatever
 * the group had before, same as a fresh POST /groups --- there's no partial
 * "add one tag" operation yet, since the only caller is group creation. */
export function setGroupTags(groupId: number, tagIds: number[], customNames: string[]): void {
  const resolvedIds = [...tagIds];
  for (const raw of customNames) {
    const name = raw.trim();
    if (!name) continue;
    resolvedIds.push(findOrCreateTag(name, "custom").id);
  }
  db.prepare("DELETE FROM group_tags WHERE group_id = ?").run(groupId);
  const insert = db.prepare("INSERT OR IGNORE INTO group_tags (group_id, tag_id) VALUES (?, ?)");
  for (const tagId of new Set(resolvedIds)) insert.run(groupId, tagId);
}

export function tagsForGroup(groupId: number): Tag[] {
  return db
    .prepare(
      `SELECT tags.* FROM tags
       JOIN group_tags ON group_tags.tag_id = tags.id
       WHERE group_tags.group_id = ?
       ORDER BY tags.category, tags.name`,
    )
    .all(groupId) as unknown as Tag[];
}

export type WitnessStatus = "none" | "pending" | "confirmed" | "disputed";

export interface Result {
  id: number;
  group_id: number;
  game: string;
  winner: string;
  loser: string;
  winner_member_id: number | null; // legacy (pre-global-accounts)
  loser_member_id: number | null; // legacy (pre-global-accounts)
  winner_user_id: number | null;
  loser_user_id: number | null;
  witness_user_id: number | null;
  witness_status: WitnessStatus;
  logged_by_user_id: number | null;
  created_at: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * `bio` is required by the HTTP layer (src/server.ts), not here --- this
 * function just stores whatever it's given, the same way addResult() trusts
 * its caller to have already checked membership. Tags are set separately
 * via setGroupTags(), and the avatar via setGroupAvatar(), both once the row
 * (and its id) exists.
 */
export function createGroup(name: string, bio: string): Group {
  let code = randomCode();
  while (getGroupByCode(code)) code = randomCode();
  db.prepare("INSERT INTO groups (code, name, bio, created_at) VALUES (?, ?, ?, ?)").run(
    code,
    name,
    bio,
    new Date().toISOString(),
  );
  return getGroupByCode(code)!;
}

export function getGroupByCode(code: string): Group | undefined {
  return db.prepare("SELECT * FROM groups WHERE code = ?").get(code) as Group | undefined;
}

export function getGroupById(id: number): Group | undefined {
  return db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as Group | undefined;
}

export function setGroupAvatar(groupId: number, blob: Buffer, mime: string): void {
  db.prepare("UPDATE groups SET avatar_blob = ?, avatar_mime = ?, avatar_updated_at = ? WHERE id = ?").run(
    blob,
    mime,
    new Date().toISOString(),
    groupId,
  );
}

export function updateGroupProfile(groupId: number, bio: string, tagIds: number[], customNames: string[]): void {
  db.prepare("UPDATE groups SET bio = ? WHERE id = ?").run(bio, groupId);
  setGroupTags(groupId, tagIds, customNames);
}

/**
 * Logs a result between two sides, each one or more people --- a plain 1v1
 * is just the one-id-per-side case. `winnerIds`/`loserIds` are user ids and
 * must already be members of `groupId`, and the two sides must be disjoint
 * --- the caller (src/server.ts) is responsible for checking both, since
 * this is where the names get denormalised for display.
 *
 * `winner`/`loser` (text) and `winner_user_id`/`loser_user_id` keep storing
 * only the first id/name per side --- every render path and test that
 * predates team results reads those columns, so they stay populated and
 * accurate for a 1v1; `result_participants` is the full roster for a side
 * with more than one person.
 */
export function addResult(
  groupId: number,
  game: string,
  winnerIds: number[],
  loserIds: number[],
  witnessId?: number,
  loggedByUserId?: number,
): Result {
  const winners = winnerIds.map((id) => getUserById(id)!);
  const losers = loserIds.map((id) => getUserById(id)!);
  const winnerText = winners.map((u) => u.name).join(" & ");
  const loserText = losers.map((u) => u.name).join(" & ");
  const witnessStatus: WitnessStatus = witnessId !== undefined ? "pending" : "none";
  const info = db
    .prepare(
      `INSERT INTO results
        (group_id, game, winner, loser, winner_user_id, loser_user_id, witness_user_id, witness_status, logged_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      groupId,
      game,
      winnerText,
      loserText,
      winnerIds[0],
      loserIds[0],
      witnessId ?? null,
      witnessStatus,
      loggedByUserId ?? null,
      new Date().toISOString(),
    );
  const resultId = info.lastInsertRowid as number;
  const insertParticipant = db.prepare(
    "INSERT INTO result_participants (result_id, user_id, side) VALUES (?, ?, ?)",
  );
  for (const id of winnerIds) insertParticipant.run(resultId, id, "winner");
  for (const id of loserIds) insertParticipant.run(resultId, id, "loser");
  return db.prepare("SELECT * FROM results WHERE id = ?").get(resultId) as unknown as Result;
}

export function resultsForGroup(groupId: number): Result[] {
  return db
    .prepare("SELECT * FROM results WHERE group_id = ? ORDER BY created_at DESC, id DESC")
    .all(groupId) as unknown as Result[];
}

export function getResultById(resultId: number): Result | undefined {
  return db.prepare("SELECT * FROM results WHERE id = ?").get(resultId) as Result | undefined;
}

/** The named witness confirms or denies a result they were asked to vouch
 * for --- a no-op if the result has no pending witness, or if `actingUserId`
 * isn't the one actually named (the caller checks this too, but the guard
 * lives here as well so this function is safe to call on its own). Denying
 * doesn't delete anything (CLAUDE.md: never drop data to resolve a dispute);
 * it just flips the status so the group can see the result is contested. */
export function setWitnessStatus(
  resultId: number,
  actingUserId: number,
  status: "confirmed" | "disputed",
): Result | undefined {
  const result = getResultById(resultId);
  if (!result || result.witness_status !== "pending" || result.witness_user_id !== actingUserId) return undefined;
  db.prepare("UPDATE results SET witness_status = ? WHERE id = ?").run(status, resultId);
  return getResultById(resultId);
}

/** Every user id actually named on either side of a result --- the pool
 * eligible to dispute it (decisions/0006), independent of whether a witness
 * was ever named at all. */
function participantUserIds(resultId: number): Set<number> {
  const rows = db
    .prepare("SELECT user_id FROM result_participants WHERE result_id = ?")
    .all(resultId) as Array<{ user_id: number }>;
  return new Set(rows.map((r) => r.user_id));
}

/** Records `userId` disputing a result they were named a winner or loser
 * in --- append-only (decisions/0006), same "never delete, never silently
 * resolve" posture as a witness's denial, just not limited to one witness or
 * one decision. `UNIQUE(result_id, disputed_by_user_id)` makes a repeat
 * dispute from the same person a no-op rather than a second row. Returns
 * `false` without writing anything if `userId` wasn't actually named on
 * either side, or logged the result themselves --- both checked here, not
 * just by the caller, so this is safe to call on its own. */
export function addResultDispute(resultId: number, userId: number): boolean {
  const result = getResultById(resultId);
  if (!result) return false;
  if (result.logged_by_user_id === userId) return false;
  if (!participantUserIds(resultId).has(userId)) return false;
  db.prepare(
    "INSERT OR IGNORE INTO result_disputes (result_id, disputed_by_user_id, created_at) VALUES (?, ?, ?)",
  ).run(resultId, userId, new Date().toISOString());
  return true;
}

export interface ResultDispute {
  disputed_by_user_id: number;
  name: string;
}

/** Everyone who's disputed a result, oldest first --- what the results list
 * renders as "disputed by N of M named participants." */
export function disputesForResult(resultId: number): ResultDispute[] {
  return db
    .prepare(
      `SELECT result_disputes.disputed_by_user_id, users.name FROM result_disputes
       JOIN users ON users.id = result_disputes.disputed_by_user_id
       WHERE result_disputes.result_id = ?
       ORDER BY result_disputes.id ASC`,
    )
    .all(resultId) as unknown as ResultDispute[];
}

export interface ResultParticipant {
  id: number;
  name: string;
}

/** Every person on one side of a result, in the order they were logged ---
 * the full roster for a team result, where winner/loser (text) only ever
 * holds the first name. */
export function participantsForResult(resultId: number, side: "winner" | "loser"): ResultParticipant[] {
  return db
    .prepare(
      `SELECT users.id, users.name FROM result_participants
       JOIN users ON users.id = result_participants.user_id
       WHERE result_participants.result_id = ? AND result_participants.side = ?
       ORDER BY result_participants.id ASC`,
    )
    .all(resultId, side) as unknown as ResultParticipant[];
}

/** Results where `viewerId` and `otherId` were on opposite sides, in any
 * group `viewerId` currently belongs to --- "currently" because group
 * membership is the visibility boundary (decisions/0003), not whether
 * `otherId` is still around to consent each time. */
export function headToHeadResults(viewerId: number, otherId: number): Result[] {
  const viewerGroupIds = membershipsForUser(viewerId).map((m) => m.group.id);
  if (viewerGroupIds.length === 0) return [];
  const placeholders = viewerGroupIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT DISTINCT results.* FROM results
       JOIN result_participants AS viewer_side ON viewer_side.result_id = results.id AND viewer_side.user_id = ?
       JOIN result_participants AS other_side ON other_side.result_id = results.id AND other_side.user_id = ?
       WHERE viewer_side.side != other_side.side AND results.group_id IN (${placeholders})
       ORDER BY results.created_at DESC, results.id DESC`,
    )
    .all(viewerId, otherId, ...viewerGroupIds) as unknown as Result[];
}

/** Results where `viewerId` and `otherId` were on the same side, in any
 * group `viewerId` currently belongs to --- see headToHeadResults() for why
 * the viewer's own membership is the boundary. */
export function teamedUpResults(viewerId: number, otherId: number): Result[] {
  const viewerGroupIds = membershipsForUser(viewerId).map((m) => m.group.id);
  if (viewerGroupIds.length === 0) return [];
  const placeholders = viewerGroupIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT DISTINCT results.* FROM results
       JOIN result_participants AS viewer_side ON viewer_side.result_id = results.id AND viewer_side.user_id = ?
       JOIN result_participants AS other_side ON other_side.result_id = results.id AND other_side.user_id = ?
       WHERE viewer_side.side = other_side.side AND results.group_id IN (${placeholders})
       ORDER BY results.created_at DESC, results.id DESC`,
    )
    .all(viewerId, otherId, ...viewerGroupIds) as unknown as Result[];
}

/** Records one durable, server-side "who did what" row (crit 10: the
 * logging has to outlive the crit itself, not just live in flyctl's log
 * buffer). `actorUserId` is null for an action with no signed-in actor (a
 * failed login attempt, say); `groupId` is null for an account-level action
 * with no group context (signup, login, logout). */
export function logAction(actorUserId: number | null, action: string, groupId: number | null, detail: string): void {
  db.prepare(
    "INSERT INTO audit_log (actor_user_id, action, group_id, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(actorUserId, action, groupId, detail, new Date().toISOString());
}

export interface GroupMatch {
  id: number;
  group_a_id: number;
  group_b_id: number;
  game: string;
  score_a: number;
  score_b: number;
  logged_by_member_id: number | null; // legacy (pre-global-accounts)
  logged_by_user_id: number | null;
  created_at: string;
}

export function addGroupMatch(
  groupAId: number,
  groupBId: number,
  game: string,
  scoreA: number,
  scoreB: number,
  loggedByUserId: number,
): GroupMatch {
  const info = db
    .prepare(
      "INSERT INTO group_matches (group_a_id, group_b_id, game, score_a, score_b, logged_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(groupAId, groupBId, game, scoreA, scoreB, loggedByUserId, new Date().toISOString());
  return db.prepare("SELECT * FROM group_matches WHERE id = ?").get(info.lastInsertRowid) as unknown as GroupMatch;
}

/** Matches this group has played, on either side, newest first. */
export function groupMatchesForGroup(groupId: number): GroupMatch[] {
  return db
    .prepare(
      "SELECT * FROM group_matches WHERE group_a_id = ? OR group_b_id = ? ORDER BY created_at DESC, id DESC",
    )
    .all(groupId, groupId) as unknown as GroupMatch[];
}

export type Role = "owner" | "member";

export interface User extends Avatar {
  id: number;
  name: string;
  password_hash: string;
  token: string;
  created_at: string;
}

export interface MemberWithRole extends User {
  role: Role;
}

export class NameTakenError extends Error {}
export class InvalidCredentialsError extends Error {}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false; // migrated pre-password rows never match
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(password, salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function freshUserRow(name: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE").get(name) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function setUserAvatar(userId: number, blob: Buffer, mime: string): void {
  db.prepare("UPDATE users SET avatar_blob = ?, avatar_mime = ?, avatar_updated_at = ? WHERE id = ?").run(
    blob,
    mime,
    new Date().toISOString(),
    userId,
  );
}

/** Creates the account and logs it in (assigns a session token). Global now
 * --- `name` has to be unique across every user, not just within one group. */
export function registerUser(name: string, password: string): User {
  if (freshUserRow(name)) {
    throw new NameTakenError(`"${name}" is already taken`);
  }
  const token = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO users (name, password_hash, token, created_at) VALUES (?, ?, ?, ?)").run(
    name,
    hashPassword(password),
    token,
    new Date().toISOString(),
  );
  return freshUserRow(name)!;
}

/** Verifies the password and issues a new session token (old sessions stop working). */
export function loginUser(name: string, password: string): User {
  const existing = freshUserRow(name);
  if (!existing || !passwordMatches(password, existing.password_hash)) {
    throw new InvalidCredentialsError("name or password is incorrect");
  }
  const token = randomBytes(24).toString("base64url");
  db.prepare("UPDATE users SET token = ? WHERE id = ?").run(token, existing.id);
  return { ...existing, token };
}

/** Ends the session: any cookie carrying the old token stops working. */
export function logoutUser(userId: number): void {
  db.prepare("UPDATE users SET token = ? WHERE id = ?").run(randomBytes(24).toString("base64url"), userId);
}

export function userByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  return db.prepare("SELECT * FROM users WHERE token = ?").get(token) as User | undefined;
}

export interface Membership {
  id: number;
  user_id: number;
  group_id: number;
  role: Role;
  created_at: string;
}

export function membershipFor(userId: number, groupId: number): Membership | undefined {
  return db.prepare("SELECT * FROM memberships WHERE user_id = ? AND group_id = ?").get(userId, groupId) as
    | Membership
    | undefined;
}

/** Adds a user to a group with the given role --- idempotent: already being
 * a member is a no-op, not an error, since re-joining a group you're
 * already in isn't a mistake worth surfacing to anyone. */
export function joinGroup(userId: number, groupId: number, role: Role = "member"): void {
  if (membershipFor(userId, groupId)) return;
  db.prepare("INSERT INTO memberships (user_id, group_id, role, created_at) VALUES (?, ?, ?, ?)").run(
    userId,
    groupId,
    role,
    new Date().toISOString(),
  );
}

export function removeMembership(userId: number, groupId: number): void {
  db.prepare("DELETE FROM memberships WHERE user_id = ? AND group_id = ?").run(userId, groupId);
}

export interface MembershipWithGroup {
  group: Group;
  role: Role;
}

/** Every group a user belongs to, with their role in each --- the
 * dashboard's data (src/pages.ts: mePage). */
export function membershipsForUser(userId: number): MembershipWithGroup[] {
  const rows = db
    .prepare(
      `SELECT groups.*, memberships.role AS membership_role FROM memberships
       JOIN groups ON groups.id = memberships.group_id
       WHERE memberships.user_id = ?
       ORDER BY memberships.created_at ASC`,
    )
    .all(userId) as unknown as Array<Group & { membership_role: Role }>;
  return rows.map(({ membership_role, ...group }) => ({ group: group as Group, role: membership_role }));
}

/** Every member of a group (as their user row) plus their role, oldest
 * membership first --- the pool results can be logged against, and what the
 * group page's member list renders. */
export function membersForGroup(groupId: number): MemberWithRole[] {
  return db
    .prepare(
      `SELECT users.*, memberships.role AS role FROM memberships
       JOIN users ON users.id = memberships.user_id
       WHERE memberships.group_id = ?
       ORDER BY memberships.created_at ASC`,
    )
    .all(groupId) as unknown as MemberWithRole[];
}

export function memberInGroup(groupId: number, userId: number): MemberWithRole | undefined {
  return db
    .prepare(
      `SELECT users.*, memberships.role AS role FROM memberships
       JOIN users ON users.id = memberships.user_id
       WHERE memberships.group_id = ? AND users.id = ?`,
    )
    .get(groupId, userId) as MemberWithRole | undefined;
}
