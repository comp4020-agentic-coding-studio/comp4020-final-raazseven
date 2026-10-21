// Live mini-game challenges between two members of a group (decisions/0004).
// In-memory only, like src/live.ts's channel registry --- a finished game's
// *outcome* is durable (logged through the existing addResult(), same as any
// other result), but the board itself doesn't need to survive a restart any
// more than an open SSE connection does.

import { randomBytes } from "node:crypto";

export type GameKind = "tic-tac-toe" | "rock-paper-scissors";

export const GAME_NAMES: Record<GameKind, string> = {
  "tic-tac-toe": "Tic-Tac-Toe",
  "rock-paper-scissors": "Rock-Paper-Scissors",
};

export type Mark = "X" | "O";
export type Cell = Mark | null;

export interface TicTacToeState {
  board: Cell[]; // length 9, row-major
  turn: Mark; // whose mark moves next
}

export type RpsChoice = "rock" | "paper" | "scissors";

export interface RockPaperScissorsState {
  // keyed by user id; a player present in this map has locked in a choice
  // not yet revealed to their opponent until both have one (see applyMove).
  choices: Partial<Record<number, RpsChoice>>;
}

export interface MinigameSession {
  id: string;
  groupId: number;
  game: GameKind;
  playerIds: [number, number]; // [challenger, opponent]
  state: TicTacToeState | RockPaperScissorsState;
  status: "active" | "finished";
  winnerId: number | null; // null for a draw or while active
  isDraw: boolean;
  createdAt: number;
}

const sessions = new Map<string, MinigameSession>();

// Sessions are small and short-lived by nature (a game finishes in a few
// moves, within minutes) --- this is just an unbounded-growth guard against
// someone starting a challenge and never finishing it, not a real expiry
// feature. No background timer: the sweep runs inline, piggybacking on the
// next challenge creation, the same "no extra moving parts" spirit as
// src/live.ts's own cleanup-on-unsubscribe.
const MAX_SESSION_AGE_MS = 60 * 60 * 1000;
function sweepStaleSessions(): void {
  const cutoff = Date.now() - MAX_SESSION_AGE_MS;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}

function freshTicTacToeState(): TicTacToeState {
  return { board: new Array(9).fill(null), turn: "X" };
}

function freshRockPaperScissorsState(): RockPaperScissorsState {
  return { choices: {} };
}

export function createChallenge(
  groupId: number,
  game: GameKind,
  challengerId: number,
  opponentId: number,
): MinigameSession {
  sweepStaleSessions();
  const session: MinigameSession = {
    id: randomBytes(9).toString("base64url"),
    groupId,
    game,
    playerIds: [challengerId, opponentId],
    state: game === "tic-tac-toe" ? freshTicTacToeState() : freshRockPaperScissorsState(),
    status: "active",
    winnerId: null,
    isDraw: false,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): MinigameSession | undefined {
  return sessions.get(id);
}

export function channelFor(id: string): string {
  return `game:${id}`;
}

export type MoveResult =
  | { ok: true; session: MinigameSession; justFinished: boolean }
  | { ok: false; error: string };

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function ticTacToeWinner(board: Cell[]): Mark | null {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

const RPS_BEATS: Record<RpsChoice, RpsChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

/**
 * Applies one player's move to a session, validating that it's legal before
 * mutating anything --- an illegal move (wrong turn, filled cell, already
 * chosen this round, acting as someone who isn't one of the two players)
 * leaves the session untouched and returns an error, the same
 * validate-then-mutate shape addResult()'s caller (src/server.ts) already
 * uses for a result submission.
 */
export function applyMove(
  id: string,
  actingUserId: number,
  move: { cell: number } | { choice: RpsChoice },
): MoveResult {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: "that game no longer exists" };
  if (session.status !== "active") return { ok: false, error: "this game has already finished" };
  if (!session.playerIds.includes(actingUserId)) {
    return { ok: false, error: "you're not a player in this game" };
  }

  if (session.game === "tic-tac-toe") {
    if (!("cell" in move)) return { ok: false, error: "a cell is required" };
    const state = session.state as TicTacToeState;
    const mark: Mark = session.playerIds[0] === actingUserId ? "X" : "O";
    if (mark !== state.turn) return { ok: false, error: "it's not your turn" };
    if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell > 8) {
      return { ok: false, error: "that's not a valid cell" };
    }
    if (state.board[move.cell] !== null) return { ok: false, error: "that cell is already taken" };

    state.board[move.cell] = mark;
    const winnerMark = ticTacToeWinner(state.board);
    if (winnerMark) {
      session.status = "finished";
      session.winnerId = mark === winnerMark ? actingUserId : session.playerIds.find((p) => p !== actingUserId)!;
      return { ok: true, session, justFinished: true };
    }
    if (state.board.every((c) => c !== null)) {
      session.status = "finished";
      session.isDraw = true;
      return { ok: true, session, justFinished: true };
    }
    state.turn = state.turn === "X" ? "O" : "X";
    return { ok: true, session, justFinished: false };
  }

  // rock-paper-scissors
  if (!("choice" in move)) return { ok: false, error: "a choice is required" };
  const state = session.state as RockPaperScissorsState;
  if (!(move.choice === "rock" || move.choice === "paper" || move.choice === "scissors")) {
    return { ok: false, error: "choose rock, paper, or scissors" };
  }
  if (state.choices[actingUserId] !== undefined) {
    return { ok: false, error: "you've already chosen this round" };
  }
  state.choices[actingUserId] = move.choice;

  const [a, b] = session.playerIds;
  const choiceA = state.choices[a];
  const choiceB = state.choices[b];
  if (choiceA === undefined || choiceB === undefined) {
    // Only one player has chosen so far --- the round isn't resolved, and
    // (crucially) the caller must NOT broadcast this: the opponent's choice
    // has to stay secret until both are in, or the second player could just
    // wait for a live update revealing the first player's pick before
    // choosing themselves.
    return { ok: true, session, justFinished: false };
  }

  session.status = "finished";
  if (choiceA === choiceB) {
    session.isDraw = true;
  } else {
    session.winnerId = RPS_BEATS[choiceA] === choiceB ? a : b;
  }
  return { ok: true, session, justFinished: true };
}
