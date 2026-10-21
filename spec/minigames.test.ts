import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// decisions/0004-mini-game-challenges.md: one member can challenge another
// member of the same group to a live mini-game, and a finished game's
// outcome is logged through the existing addResult() exactly like a
// manually-logged result. These check the HTTP-level contract: challenge
// creation, move validation, the group-membership gate, that a draw doesn't
// get logged as a result, and (CLAUDE.md's real-time rule) that a finished
// mini-game's result actually reaches the group's EXISTING live channel the
// same way any other logged result does --- not just that the page re-render
// looks right afterward.

/**
 * A background "pump" on one SSE stream, appending every chunk to a single
 * shared buffer as it arrives --- this is what lets a test poll the *same*
 * stream more than once (once to assert nothing has arrived yet, then again
 * after a second move) without the race live-updates.test.ts's simpler,
 * single-use version of this helper doesn't have to worry about: racing a
 * bare `reader.read()` against a timeout (as a naive per-call version would)
 * abandons that read() in the background when the timeout wins, so if real
 * data arrives *after* the timeout but *before* the next call starts its own
 * read(), the abandoned read() silently consumes it and the next call never
 * sees it. Reading continuously into one buffer from the moment the stream
 * opens avoids that gap entirely --- there's always at most one `read()` in
 * flight, owned by the pump, never abandoned mid-call.
 */
function pumpStream(body: ReadableStream<Uint8Array>): { text(): string; stop(): Promise<void> } {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const loop = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    } catch {
      // the stream was cancelled out from under the pump --- expected on stop()
    }
  })();
  return {
    text: () => buffer,
    stop: async () => {
      await reader.cancel().catch(() => {});
      await loop;
    },
  };
}

/** Waits until `predicate(pump.text())` is true, or `timeoutMs` passes,
 * polling the pump's already-buffered text rather than reading the stream
 * directly (see pumpStream() above for why). */
async function readUntil(
  pump: ReturnType<typeof pumpStream>,
  predicate: (text: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !predicate(pump.text())) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return pump.text();
}

/** Starts a challenge between two already-registered members and returns the
 * new game's path (e.g. "/g/ABC123/games/xYz..."), read off the redirect
 * Location header the same way createGroupAs() reads a new group's path. */
async function challenge(
  groupPath: string,
  challengerCookie: string,
  opponentId: string,
  game: "tic-tac-toe" | "rock-paper-scissors",
): Promise<string> {
  const res = await fetch(new URL(`${groupPath}/games`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: challengerCookie },
    body: new URLSearchParams({ opponentId, game }),
    redirect: "manual",
  });
  expect(res.status, "starting a challenge should redirect to the new game's page").toBe(303);
  const gamePath = res.headers.get("location");
  expect(gamePath, "starting a challenge should redirect to the new game's page").toBeTruthy();
  return gamePath!;
}

async function move(
  gamePath: string,
  cookie: string,
  body: Record<string, string>,
): Promise<Response> {
  return fetch(new URL(`${gamePath}/move`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(body),
    redirect: "manual",
  });
}

it("two members play Tic-Tac-Toe to a forced win, and the win is logged as a result", async () => {
  const groupPath = await createGroup(`spec-minigame-ttt-win-${Date.now()}`);
  const xCookie = await register(groupPath, "Xavi", "a-real-password");
  const oCookie = await register(groupPath, "Ozzy", "a-real-password");
  const xId = await memberId(groupPath, xCookie, "Xavi");
  const oId = await memberId(groupPath, xCookie, "Ozzy");

  const gamePath = await challenge(groupPath, xCookie, oId, "tic-tac-toe");

  // X takes the top row (0, 1, 2); O plays elsewhere, never blocking.
  expect((await move(gamePath, xCookie, { cell: "0" })).status).toBe(303);
  expect((await move(gamePath, oCookie, { cell: "3" })).status).toBe(303);
  expect((await move(gamePath, xCookie, { cell: "1" })).status).toBe(303);
  expect((await move(gamePath, oCookie, { cell: "4" })).status).toBe(303);
  const winningMove = await move(gamePath, xCookie, { cell: "2" });
  expect(winningMove.status).toBe(303);

  const gameHtml = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(gameHtml).toContain("Xavi");
  expect(gameHtml).toMatch(/wins!/);

  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml, "a mini-game win should be logged through the group's normal results feed").toContain(
    "Tic-Tac-Toe",
  );
  expect(groupHtml).toContain("Xavi");
  expect(groupHtml).toContain("Ozzy");
});

it("a move out of turn is rejected and does not change the board", async () => {
  const groupPath = await createGroup(`spec-minigame-ttt-turn-${Date.now()}`);
  const xCookie = await register(groupPath, "Toni", "a-real-password");
  const oCookie = await register(groupPath, "Omar", "a-real-password");
  const oId = await memberId(groupPath, xCookie, "Omar");

  const gamePath = await challenge(groupPath, xCookie, oId, "tic-tac-toe");

  // X goes first --- O trying to move immediately is out of turn.
  const res = await move(gamePath, oCookie, { cell: "0" });
  expect(res.status).toBe(200); // re-rendered with an error, not redirected
  expect(await res.text()).toContain("not your turn");

  // Not a bare substring check for "ttt-cell-filled": that class name also
  // appears in the page's own embedded <style> block (the CSS rule that
  // styles a filled cell), which would match regardless of board state. The
  // actual filled-cell markup is `class="ttt-cell ttt-cell-filled"` --- only
  // present once a cell has really been played.
  const after = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(after).not.toContain('class="ttt-cell ttt-cell-filled"');
});

it("a move onto an already-filled cell is rejected", async () => {
  const groupPath = await createGroup(`spec-minigame-ttt-filled-${Date.now()}`);
  const xCookie = await register(groupPath, "Finn", "a-real-password");
  const oCookie = await register(groupPath, "Omar", "a-real-password");
  const oId = await memberId(groupPath, xCookie, "Omar");

  const gamePath = await challenge(groupPath, xCookie, oId, "tic-tac-toe");
  expect((await move(gamePath, xCookie, { cell: "0" })).status).toBe(303);

  const res = await move(gamePath, oCookie, { cell: "0" });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("already taken");
});

it("a forced Tic-Tac-Toe draw finishes the game without logging a result", async () => {
  const groupPath = await createGroup(`spec-minigame-ttt-draw-${Date.now()}`);
  const xCookie = await register(groupPath, "Drew", "a-real-password");
  const oCookie = await register(groupPath, "Dana", "a-real-password");
  const oId = await memberId(groupPath, xCookie, "Dana");

  const gamePath = await challenge(groupPath, xCookie, oId, "tic-tac-toe");

  // A classic draw board:
  //   X O X
  //   X O O
  //   O X X
  // Move order (alternating X, O): X:0 O:1 X:2 O:4 X:3 O:5 X:7 O:6 X:8
  const sequence: Array<["x" | "o", number]> = [
    ["x", 0],
    ["o", 1],
    ["x", 2],
    ["o", 4],
    ["x", 3],
    ["o", 5],
    ["x", 7],
    ["o", 6],
    ["x", 8],
  ];
  let lastRes: Response | undefined;
  for (const [side, cell] of sequence) {
    lastRes = await move(gamePath, side === "x" ? xCookie : oCookie, { cell: String(cell) });
    expect(lastRes.status).toBe(303);
  }

  const gameHtml = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(gameHtml).toContain("draw");

  // Not a bare `.not.toContain("Tic-Tac-Toe")`: the group page's own
  // challenge-a-mini-game form always lists "Tic-Tac-Toe" as a choice in its
  // <select>, regardless of whether any game has ever been played --- the
  // actual claim this test makes is that the *results feed* stayed empty,
  // so it checks that specifically.
  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml, "a drawn mini-game should not appear in the group's results feed").toContain(
    "No results yet. Be the first to log one.",
  );
});

it("challenging someone who isn't a member of the group is rejected", async () => {
  const groupPath = await createGroup(`spec-minigame-outsider-${Date.now()}`);
  const cookie = await register(groupPath, "Casey", "a-real-password");

  const res = await fetch(new URL(`${groupPath}/games`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    // id 999999 belongs to no one in this (or any) group
    body: new URLSearchParams({ opponentId: "999999", game: "tic-tac-toe" }),
    redirect: "manual",
  });
  expect(res.status).toBe(200); // re-rendered with an error, not redirected
  expect(await res.text()).toContain("member of this group");
});

it("challenging yourself is rejected", async () => {
  const groupPath = await createGroup(`spec-minigame-self-${Date.now()}`);
  const cookie = await register(groupPath, "Sam", "a-real-password");
  const samId = await memberId(groupPath, cookie, "Sam");

  const res = await fetch(new URL(`${groupPath}/games`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentId: samId, game: "tic-tac-toe" }),
    redirect: "manual",
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("member of this group");
});

it("Rock-Paper-Scissors keeps a choice hidden until both players have chosen, then reveals both live", async () => {
  const groupPath = await createGroup(`spec-minigame-rps-hidden-${Date.now()}`);
  const rockCookie = await register(groupPath, "Remy", "a-real-password");
  const scissorsCookie = await register(groupPath, "Skyler", "a-real-password");
  const scissorsId = await memberId(groupPath, rockCookie, "Skyler");

  const gamePath = await challenge(groupPath, rockCookie, scissorsId, "rock-paper-scissors");

  const eventsRes = await fetch(new URL(`${gamePath}/events`, baseUrl));
  expect(eventsRes.status).toBe(200);
  const pump = pumpStream(eventsRes.body!);

  expect((await move(gamePath, rockCookie, { choice: "rock" })).status).toBe(303);

  // Only one player has chosen --- nothing should broadcast yet, or the
  // second player could read the first player's choice off this very stream
  // before picking their own.
  await readUntil(pump, () => false, 800);
  expect(pump.text(), "no choice should be revealed until both players have chosen").not.toContain("event: board");

  expect((await move(gamePath, scissorsCookie, { choice: "scissors" })).status).toBe(303);

  const afterBothChosen = await readUntil(pump, (text) => text.includes("event: board"), 3000);
  expect(afterBothChosen, "the resolved round should broadcast once both players have chosen").toContain(
    "event: board",
  );
  expect(afterBothChosen).toContain("rock");
  expect(afterBothChosen).toContain("scissors");
  await pump.stop();
});

it("rock beats scissors, and the win is logged as a result", async () => {
  const groupPath = await createGroup(`spec-minigame-rps-win-${Date.now()}`);
  const rockCookie = await register(groupPath, "Romy", "a-real-password");
  const scissorsCookie = await register(groupPath, "Scout", "a-real-password");
  const scissorsId = await memberId(groupPath, rockCookie, "Scout");

  const gamePath = await challenge(groupPath, rockCookie, scissorsId, "rock-paper-scissors");
  expect((await move(gamePath, rockCookie, { choice: "rock" })).status).toBe(303);
  expect((await move(gamePath, scissorsCookie, { choice: "scissors" })).status).toBe(303);

  const gameHtml = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(gameHtml).toMatch(/Romy.*wins!/);

  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml).toContain("Rock-Paper-Scissors");
  expect(groupHtml).toContain("Romy");
  expect(groupHtml).toContain("Scout");
});

it("a tied Rock-Paper-Scissors round finishes the game without logging a result", async () => {
  const groupPath = await createGroup(`spec-minigame-rps-draw-${Date.now()}`);
  const aCookie = await register(groupPath, "Ash", "a-real-password");
  const bCookie = await register(groupPath, "Billie", "a-real-password");
  const bId = await memberId(groupPath, aCookie, "Billie");

  const gamePath = await challenge(groupPath, aCookie, bId, "rock-paper-scissors");
  expect((await move(gamePath, aCookie, { choice: "paper" })).status).toBe(303);
  expect((await move(gamePath, bCookie, { choice: "paper" })).status).toBe(303);

  const gameHtml = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(gameHtml).toContain("draw");

  // See the Tic-Tac-Toe draw test above for why this checks the results
  // feed's own empty state rather than searching the whole page for the
  // game's name (which also always appears in the challenge form's <select>).
  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml, "a drawn mini-game should not appear in the group's results feed").toContain(
    "No results yet. Be the first to log one.",
  );
});

it("a finished mini-game's result reaches the group's own existing live channel", async () => {
  // CLAUDE.md's real-time rule: check what live-updates.test.ts already
  // expects to broadcast before changing how a result gets created. This
  // proves a mini-game win isn't a second, parallel way of logging a result
  // that silently bypasses the existing crit-9 broadcast --- it opens the
  // GROUP's event stream (not the per-game one) and expects the same
  // "event: result" a manually-logged result would produce.
  const groupPath = await createGroup(`spec-minigame-live-${Date.now()}`);
  const xCookie = await register(groupPath, "Lane", "a-real-password");
  const oCookie = await register(groupPath, "Logan", "a-real-password");
  const oId = await memberId(groupPath, xCookie, "Logan");

  const gamePath = await challenge(groupPath, xCookie, oId, "tic-tac-toe");

  const eventsRes = await fetch(new URL(`${groupPath}/events`, baseUrl));
  expect(eventsRes.status).toBe(200);
  const pump = pumpStream(eventsRes.body!);

  await move(gamePath, xCookie, { cell: "0" });
  await move(gamePath, oCookie, { cell: "3" });
  await move(gamePath, xCookie, { cell: "1" });
  await move(gamePath, oCookie, { cell: "4" });
  await move(gamePath, xCookie, { cell: "2" }); // X wins the top row

  const streamed = await readUntil(
    pump,
    (text) => text.includes("event: result") && text.includes("Tic-Tac-Toe"),
    3000,
  );
  expect(streamed, "a mini-game win should reach the group's existing live results stream").toContain(
    "event: result",
  );
  expect(streamed).toContain("Tic-Tac-Toe");
  await pump.stop();
});
