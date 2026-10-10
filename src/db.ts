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

  -- A "member" is an account scoped to one group: a name, a password, and a
  -- session token set only after a successful login. The group code gets you
  -- to the group; an account is what lets you act as a named person in it.
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
`);

// Migration: earlier deploys created `members` without a password (names
// only). Add the column if it's missing, rather than wiping the table.
const memberColumns = db.prepare("PRAGMA table_info(members)").all() as Array<{ name: string }>;
if (!memberColumns.some((c) => c.name === "password_hash")) {
  db.exec("ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

// Migration: avatars are optional on both members and groups --- NULL means
// "use the generated one" (src/avatars.ts). Added in place so a stranger's
// data from before this feature survives the deploy that introduces it.
function addAvatarColumnsIfMissing(table: "members" | "groups"): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("avatar_blob")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_blob BLOB`);
  if (!names.has("avatar_mime")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_mime TEXT`);
  if (!names.has("avatar_updated_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN avatar_updated_at TEXT`);
}
addAvatarColumnsIfMissing("members");
addAvatarColumnsIfMissing("groups");

// Migration: results predate member accounts entirely --- winner/loser were
// (and still are, for display) free text. These columns let a *new* result
// point at the real member it was logged against, without touching old rows.
const resultColumns = db.prepare("PRAGMA table_info(results)").all() as Array<{ name: string }>;
if (!resultColumns.some((c) => c.name === "winner_member_id")) {
  db.exec("ALTER TABLE results ADD COLUMN winner_member_id INTEGER REFERENCES members(id)");
}
if (!resultColumns.some((c) => c.name === "loser_member_id")) {
  db.exec("ALTER TABLE results ADD COLUMN loser_member_id INTEGER REFERENCES members(id)");
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
  created_at: string;
}

export interface Result {
  id: number;
  group_id: number;
  game: string;
  winner: string;
  loser: string;
  winner_member_id: number | null;
  loser_member_id: number | null;
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

export function createGroup(name: string): Group {
  let code = randomCode();
  while (getGroupByCode(code)) code = randomCode();
  db.prepare("INSERT INTO groups (code, name, created_at) VALUES (?, ?, ?)").run(
    code,
    name,
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

/**
 * Logs a player-level result. `winnerId`/`loserId` must already be members of
 * `groupId` --- the caller (src/server.ts) is responsible for checking that,
 * since this is where the names get denormalised for display.
 */
export function addResult(groupId: number, game: string, winnerId: number, loserId: number): Result {
  const winner = memberById(groupId, winnerId)!;
  const loser = memberById(groupId, loserId)!;
  const info = db
    .prepare(
      "INSERT INTO results (group_id, game, winner, loser, winner_member_id, loser_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(groupId, game, winner.name, loser.name, winnerId, loserId, new Date().toISOString());
  return db.prepare("SELECT * FROM results WHERE id = ?").get(info.lastInsertRowid) as unknown as Result;
}

export function resultsForGroup(groupId: number): Result[] {
  return db
    .prepare("SELECT * FROM results WHERE group_id = ? ORDER BY created_at DESC, id DESC")
    .all(groupId) as unknown as Result[];
}

export interface GroupMatch {
  id: number;
  group_a_id: number;
  group_b_id: number;
  game: string;
  score_a: number;
  score_b: number;
  logged_by_member_id: number;
  created_at: string;
}

export function addGroupMatch(
  groupAId: number,
  groupBId: number,
  game: string,
  scoreA: number,
  scoreB: number,
  loggedByMemberId: number,
): GroupMatch {
  const info = db
    .prepare(
      "INSERT INTO group_matches (group_a_id, group_b_id, game, score_a, score_b, logged_by_member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(groupAId, groupBId, game, scoreA, scoreB, loggedByMemberId, new Date().toISOString());
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

export interface Member extends Avatar {
  id: number;
  group_id: number;
  name: string;
  password_hash: string;
  token: string;
  created_at: string;
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

function freshMemberRow(groupId: number, name: string): Member {
  return db
    .prepare("SELECT * FROM members WHERE group_id = ? AND name = ? COLLATE NOCASE")
    .get(groupId, name) as unknown as Member;
}

/** Every member of a group, oldest first --- the pool results can be logged against. */
export function membersForGroup(groupId: number): Member[] {
  return db.prepare("SELECT * FROM members WHERE group_id = ? ORDER BY created_at ASC").all(groupId) as unknown as
    Member[];
}

export function memberById(groupId: number, id: number): Member | undefined {
  return db.prepare("SELECT * FROM members WHERE group_id = ? AND id = ?").get(groupId, id) as Member | undefined;
}

export function setMemberAvatar(memberId: number, blob: Buffer, mime: string): void {
  db.prepare("UPDATE members SET avatar_blob = ?, avatar_mime = ?, avatar_updated_at = ? WHERE id = ?").run(
    blob,
    mime,
    new Date().toISOString(),
    memberId,
  );
}

/** Creates the account and logs it in (assigns a session token). */
export function registerMember(groupId: number, name: string, password: string): Member {
  if (db.prepare("SELECT 1 FROM members WHERE group_id = ? AND name = ? COLLATE NOCASE").get(groupId, name)) {
    throw new NameTakenError(`"${name}" is already registered in this group`);
  }
  const token = randomBytes(24).toString("base64url");
  db.prepare(
    "INSERT INTO members (group_id, name, password_hash, token, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(groupId, name, hashPassword(password), token, new Date().toISOString());
  return freshMemberRow(groupId, name);
}

/** Verifies the password and issues a new session token (old sessions stop working). */
export function loginMember(groupId: number, name: string, password: string): Member {
  const existing = freshMemberRow(groupId, name);
  if (!existing || !passwordMatches(password, existing.password_hash)) {
    throw new InvalidCredentialsError("name or password is incorrect");
  }
  const token = randomBytes(24).toString("base64url");
  db.prepare("UPDATE members SET token = ? WHERE id = ?").run(token, existing.id);
  return { ...existing, token };
}

/** Ends the session: any cookie carrying the old token stops working. */
export function logoutMember(memberId: number): void {
  db.prepare("UPDATE members SET token = ? WHERE id = ?").run(
    randomBytes(24).toString("base64url"),
    memberId,
  );
}

export function memberByToken(groupId: number, token: string | undefined): Member | undefined {
  if (!token) return undefined;
  return db.prepare("SELECT * FROM members WHERE group_id = ? AND token = ?").get(groupId, token) as
    | Member
    | undefined;
}
