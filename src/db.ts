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
`);

// Migration: earlier deploys created `members` without a password (names
// only). Add the column if it's missing, rather than wiping the table.
const memberColumns = db.prepare("PRAGMA table_info(members)").all() as Array<{ name: string }>;
if (!memberColumns.some((c) => c.name === "password_hash")) {
  db.exec("ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

export interface Group {
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

export function addResult(groupId: number, game: string, winner: string, loser: string): Result {
  const info = db
    .prepare("INSERT INTO results (group_id, game, winner, loser, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(groupId, game, winner, loser, new Date().toISOString());
  return db.prepare("SELECT * FROM results WHERE id = ?").get(info.lastInsertRowid) as unknown as Result;
}

export function resultsForGroup(groupId: number): Result[] {
  return db
    .prepare("SELECT * FROM results WHERE group_id = ? ORDER BY created_at DESC, id DESC")
    .all(groupId) as unknown as Result[];
}

export interface Member {
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
