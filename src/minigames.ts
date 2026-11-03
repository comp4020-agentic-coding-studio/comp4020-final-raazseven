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
  // "pending" until the challenged opponent accepts (decisions/0007) --- no
  // move is legal yet, and the board doesn't even exist meaningfully until
  // accept() builds it. "declined" is terminal, like "finished": nothing
  // further happens to the session, and (per decisions/0007) nothing gets
  // logged, the same as a draw never does. "forfeited" (decisions/0010) is
  // also terminal, but UNLIKE "declined" it logs a result through the same
  // addResult() path a win does --- winnerId is who's left when the other
  // player quits or disconnects, not null the way a draw leaves it.
  status: "pending" | "active" | "finished" | "declined" | "forfeited";
  winnerId: number | null; // null for a draw or while active
  isDraw: boolean;
  createdAt: number;
  // Who has already been shown the "your challenge was accepted" / "your
  // opponent left, you won" popup for THIS session (decisions/0010) --- a
  // player is added the moment the popup includes them once, so leaving and
  // coming back to the group page doesn't keep re-surfacing a notice they've
  // already seen. Separate from witnessing the live "board" update itself
  // (that's unaffected either way); this only gates the site-wide popup.
  acknowledgedBy: Set<number>;
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
    status: "pending",
    winnerId: null,
    isDraw: false,
    createdAt: Date.now(),
    acknowledgedBy: new Set(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): MinigameSession | undefined {
  return sessions.get(id);
}

/** Every pending challenge in a group where `userId` is the challenged
 * opponent --- the "challenges waiting on you" card on the group page
 * (decisions/0007). Not indexed by group since the number of concurrently
 * pending challenges in one group is always small; a linear scan over the
 * in-memory session map is the same cost tradeoff sweepStaleSessions()
 * already accepts. */
export function pendingChallengesFor(groupId: number, userId: number): MinigameSession[] {
  return [...sessions.values()].filter(
    (s) => s.groupId === groupId && s.status === "pending" && s.playerIds[1] === userId,
  );
}

/** Every pending challenge where `userId` is the challenged opponent, across
 * EVERY group they're in --- not just the one group page they happen to be
 * looking at. This is what the site-wide popup (decisions/0008) checks on
 * every page load, and what `channelFor(userId)`'s live push tells the
 * client to re-check. */
export function allPendingChallengesFor(userId: number): MinigameSession[] {
  return [...sessions.values()].filter((s) => s.status === "pending" && s.playerIds[1] === userId);
}

export type MinigameNoticeKind = "challenged" | "accepted" | "forfeited-win";

export interface MinigameNotice {
  kind: MinigameNoticeKind;
  session: MinigameSession;
}

/** Every site-wide notice `userId` still needs to see, across every group
 * they're in (decisions/0010 extends decisions/0008's popup beyond just
 * "you've been challenged"):
 *
 * - "challenged": a pending challenge where they're the one being asked ---
 *   same as allPendingChallengesFor(), unchanged.
 * - "accepted": a challenge THEY sent that just became active, which they
 *   haven't acknowledged yet --- the actual gap this ADR closes: before
 *   this, only the challenged opponent was ever told anything happened.
 * - "forfeited-win": a game they won because their opponent forfeited or
 *   disconnected, which they haven't acknowledged yet --- the same kind of
 *   "something happened to a game you're in, and you weren't there to see
 *   it live" gap as "accepted".
 *
 * "accepted" and "forfeited-win" both clear once `acknowledgeGame()` is
 * called for that user --- a challenge is never "pending" and "accepted" at
 * the same time, so there's no overlap between the three kinds. */
export function allNoticesFor(userId: number): MinigameNotice[] {
  const notices: MinigameNotice[] = [];
  for (const session of sessions.values()) {
    if (session.status === "pending" && session.playerIds[1] === userId) {
      notices.push({ kind: "challenged", session });
    } else if (
      session.status === "active" &&
      session.playerIds[0] === userId &&
      !session.acknowledgedBy.has(userId)
    ) {
      notices.push({ kind: "accepted", session });
    } else if (
      session.status === "forfeited" &&
      session.winnerId === userId &&
      !session.acknowledgedBy.has(userId)
    ) {
      notices.push({ kind: "forfeited-win", session });
    }
  }
  return notices;
}

/** Marks a session's "accepted" / "forfeited-win" notice as seen by
 * `userId`, so it doesn't keep reappearing every time they load a page ---
 * called once the popup has actually shown it to them. A no-op for a
 * session that doesn't exist (already swept, say); nothing to acknowledge
 * then either way. */
export function acknowledgeGame(gameId: string, userId: number): void {
  sessions.get(gameId)?.acknowledgedBy.add(userId);
}

/** The per-user notification channel key (decisions/0008) --- parallel to
 * `channelFor(gameId)` below, but keyed by the challenged person rather than
 * the game, since a challenge notification has to reach that person no
 * matter which page (or which group) they're currently on, not just the
 * one group the challenge happened in. */
export function userChannelFor(userId: number): string {
  return `user:${userId}`;
}

export type ChallengeAnswer = { ok: true; session: MinigameSession } | { ok: false; error: string };

/** Only the challenged opponent (playerIds[1]) can accept or decline --- the
 * challenger has no "cancel" button here, same as this app has no edit path
 * for anything else once submitted. */
function requirePendingOpponent(id: string, actingUserId: number): ChallengeAnswer | MinigameSession {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: "that challenge no longer exists" };
  if (session.status !== "pending") return { ok: false, error: "this challenge has already been answered" };
  if (session.playerIds[1] !== actingUserId) {
    return { ok: false, error: "only the challenged player can accept or decline" };
  }
  return session;
}

export function acceptChallenge(id: string, actingUserId: number): ChallengeAnswer {
  const result = requirePendingOpponent(id, actingUserId);
  if ("ok" in result) return result;
  result.status = "active";
  return { ok: true, session: result };
}

export function declineChallenge(id: string, actingUserId: number): ChallengeAnswer {
  const result = requirePendingOpponent(id, actingUserId);
  if ("ok" in result) return result;
  result.status = "declined";
  return { ok: true, session: result };
}

export type ForfeitAnswer = { ok: true; session: MinigameSession; winnerId: number } | { ok: false; error: string };

/** Either player forfeits an active game --- the other player wins, logged
 * through the same addResult() path as a normal win (decisions/0010).
 * Used both by the explicit "Forfeit" button and by the disconnect-timeout
 * path below; both go through this one function so a forfeit is always
 * validated and resolved the same way regardless of how it was triggered. */
export function forfeitGame(id: string, actingUserId: number): ForfeitAnswer {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: "that game no longer exists" };
  if (session.status !== "active") return { ok: false, error: "this game isn't active" };
  if (!session.playerIds.includes(actingUserId)) {
    return { ok: false, error: "you're not a player in this game" };
  }
  const winnerId = session.playerIds.find((p) => p !== actingUserId)!;
  session.status = "forfeited";
  session.winnerId = winnerId;
  return { ok: true, session, winnerId };
}

export function channelFor(id: string): string {
  return `game:${id}`;
}

// --- Disconnect tracking for automatic forfeiting (decisions/0010) ---
//
// Every open per-game SSE connection registers which player (if either) it
// belongs to. When a player's LAST connection to a given game closes, a
// 30-second grace timer starts; reconnecting before it fires cancels the
// timer with no effect, so a page refresh or a brief tab-switch --- which
// also close the connection --- never cost anyone a game. Only firing after
// the full window with no reconnection counts as a real departure.
const GRACE_PERIOD_MS = 30_000;
// gameId -> playerId -> number of currently-open connections for that player.
const openConnections = new Map<string, Map<number, number>>();
// gameId -> playerId -> pending grace-period timer.
const graceTimers = new Map<string, Map<number, NodeJS.Timeout>>();

/** Call when a player's per-game SSE connection opens --- cancels any
 * pending grace-period timer for them (they've reconnected) and marks them
 * as connected. `playerId` is undefined for a spectator's connection, which
 * this never needs to track: only a player going quiet starts the clock. */
export function registerGameConnection(gameId: string, playerId: number | undefined): void {
  if (playerId === undefined) return;
  const counts = openConnections.get(gameId) ?? new Map<number, number>();
  counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  openConnections.set(gameId, counts);

  const timers = graceTimers.get(gameId);
  const pending = timers?.get(playerId);
  if (pending) {
    clearTimeout(pending);
    timers!.delete(playerId);
  }
}

/** Call when that same connection closes. If this was the player's LAST open
 * connection to this game, starts the grace-period timer; `onForfeit` is
 * called (with the departing player's id) only if the window elapses with
 * no reconnection in between. */
export function unregisterGameConnection(
  gameId: string,
  playerId: number | undefined,
  onForfeit: (gameId: string, playerId: number) => void,
): void {
  if (playerId === undefined) return;
  const counts = openConnections.get(gameId);
  if (!counts) return;
  const remaining = (counts.get(playerId) ?? 1) - 1;
  if (remaining > 0) {
    counts.set(playerId, remaining);
    return;
  }
  counts.delete(playerId);
  if (counts.size === 0) openConnections.delete(gameId);

  // Only a still-active game is worth starting a timer for --- a finished,
  // declined, or already-forfeited session has nothing left to forfeit.
  const session = sessions.get(gameId);
  if (!session || session.status !== "active") return;

  const timer = setTimeout(() => {
    graceTimers.get(gameId)?.delete(playerId);
    const stillOpen = (openConnections.get(gameId)?.get(playerId) ?? 0) > 0;
    const current = sessions.get(gameId);
    if (stillOpen || !current || current.status !== "active") return;
    onForfeit(gameId, playerId);
  }, GRACE_PERIOD_MS);

  const timers = graceTimers.get(gameId) ?? new Map<number, NodeJS.Timeout>();
  timers.set(playerId, timer);
  graceTimers.set(gameId, timers);
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
  if (session.status === "pending") {
    return { ok: false, error: "this challenge hasn't been accepted yet" };
  }
  if (session.status === "declined") return { ok: false, error: "this challenge was declined" };
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
