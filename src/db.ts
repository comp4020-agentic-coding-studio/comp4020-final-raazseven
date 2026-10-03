import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
`);

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
