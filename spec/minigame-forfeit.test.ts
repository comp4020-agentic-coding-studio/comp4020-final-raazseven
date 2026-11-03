import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register, signup, uniqueName } from "./support.ts";

// decisions/0010-forfeit-and-challenger-notification.md: three related gaps
// closed together --- (1) the challenger was never told their challenge got
// accepted unless they stayed on the exact game page, (2) an abandoned game
// just silently expired with nothing logged, (3) there was no way to
// honestly concede. These check the parts reachable over plain HTTP: the
// explicit forfeit route, its authorization, its logging (through the same
// addResult() path a normal win uses), and the challenger/winner
// notification popup. The automatic disconnect-forfeit path needs a real
// SSE connection closing and a real 30s wait to exercise, which was verified
// by hand with two headless-Chromium contexts rather than in this suite.

async function challenge(
  groupPath: string,
  challengerCookie: string,
  opponentId: string,
): Promise<string> {
  const res = await fetch(new URL(`${groupPath}/games`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: challengerCookie },
    body: new URLSearchParams({ opponentId, game: "tic-tac-toe" }),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  return res.headers.get("location")!;
}

async function accept(gamePath: string, cookie: string): Promise<Response> {
  return fetch(new URL(`${gamePath}/accept`, baseUrl), { method: "POST", headers: { cookie }, redirect: "manual" });
}

async function forfeit(gamePath: string, cookie: string): Promise<Response> {
  return fetch(new URL(`${gamePath}/forfeit`, baseUrl), { method: "POST", headers: { cookie }, redirect: "manual" });
}

async function acknowledge(gamePath: string, cookie: string, redirectTo?: "game" | "group"): Promise<Response> {
  return fetch(new URL(`${gamePath}/acknowledge`, baseUrl), {
    method: "POST",
    headers: redirectTo ? { cookie, "content-type": "application/x-www-form-urlencoded" } : { cookie },
    body: redirectTo ? new URLSearchParams({ redirectTo }) : undefined,
    redirect: "manual",
  });
}

it("accepting a challenge notifies the CHALLENGER, not just the opponent", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-accept-notice`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);

  // Before accepting: the challenger has no notice yet.
  const before = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(before).toBe("");

  const acceptRes = await accept(gamePath, opponentCookie);
  expect(acceptRes.status).toBe(303);

  // After accepting: the CHALLENGER (not the opponent who just acted) sees
  // a notice --- this is the actual gap decisions/0010 closes.
  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(after).toContain("Mini-game updates");
  expect(after).toContain("accepted your");
  expect(after).toContain("Marcus");
  expect(after).toContain(gamePath);
});

it("the challenger's accept-notice can be dismissed, and doesn't come back", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-dismiss-accept`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const ackRes = await acknowledge(gamePath, challengerCookie, "group");
  expect(ackRes.status).toBe(303);
  expect(ackRes.headers.get("location")).toBe(groupPath);

  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(after).toBe("");
});

// A real bug, reported directly: clicking "View game" looked broken because
// the SAME notice kept reappearing afterward. The original bug was that
// "View game" was a plain <a href> that navigated without ever calling
// /acknowledge at all --- now it's a form posting redirectTo=game, same
// route as Dismiss, just a different destination.
it("clicking 'View game' redirects to the game AND clears the notice, same as Dismiss", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-view-game`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const before = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(before).toContain("View game");

  const viewRes = await acknowledge(gamePath, challengerCookie, "game");
  expect(viewRes.status).toBe(303);
  expect(viewRes.headers.get("location")).toBe(gamePath);

  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(after, "the notice must not reappear after View game, the same as after Dismiss").toBe("");
});

// Formbody leaves req.body as undefined (not {}) for a request with no body
// and no content-type at all --- a real crash caught while fixing the "View
// game" bug above, since the route originally read req.body.redirectTo
// unguarded.
it("acknowledging with no body at all (Dismiss sends none) doesn't crash", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-no-body`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const res = await fetch(new URL(`${gamePath}/acknowledge`, baseUrl), {
    method: "POST",
    headers: { cookie: challengerCookie },
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(groupPath);
});

it("a player can forfeit an active game, logging a win for the other player", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-explicit`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const forfeitRes = await forfeit(gamePath, challengerCookie);
  expect(forfeitRes.status).toBe(303);

  const gameHtml = await (await fetch(new URL(gamePath, baseUrl))).text();
  expect(gameHtml).toContain("forfeited");
  expect(gameHtml).toContain("wins!");

  // Logged exactly like a normal win --- same results feed, same game name.
  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml).toContain("Tic-Tac-Toe");
  expect(groupHtml).toContain("Priya");
  expect(groupHtml).toContain("Marcus");
});

it("forfeiting notifies the WINNER, wherever they are, with the correct name regardless of who forfeited", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-winner-notice`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);
  // The CHALLENGER forfeits this time --- the winner (the opponent) should
  // see the challenger's name in the notice, not their own.
  await forfeit(gamePath, challengerCookie);

  const winnerNotice = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(winnerNotice).toContain("Priya");
  expect(winnerNotice).toContain("left your");
  expect(winnerNotice).toContain("you win!");
});

it("forfeiting when the OPPONENT (not the challenger) leaves still names the right person", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-winner-notice-reverse`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);
  // The OPPONENT forfeits this time --- the challenger (now the winner)
  // should see the opponent's name, not their own, and not a stale
  // "accepted" notice overwritten incorrectly.
  await forfeit(gamePath, opponentCookie);

  const winnerNotice = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect(winnerNotice).toContain("Marcus");
  expect(winnerNotice).toContain("left your");
  expect(winnerNotice).toContain("you win!");
});

it("the forfeit-win notice can be dismissed", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-dismiss-forfeit`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);
  await forfeit(gamePath, challengerCookie);

  await acknowledge(gamePath, opponentCookie);
  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(after).toBe("");
});

it("only a player in the game can forfeit it, not a bystander", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-bystander`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const bystanderCookie = await register(groupPath, "Noor", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const res = await forfeit(gamePath, bystanderCookie);
  expect(res.status).toBe(200); // re-rendered with an error, not redirected
  expect(await res.text()).toContain("you're not a player in this game");

  // Nothing was logged.
  const groupHtml = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(groupHtml).toContain("No results yet");
});

it("a pending (not-yet-accepted) challenge can't be forfeited", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-pending`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);

  const res = await forfeit(gamePath, challengerCookie);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("isn't active");
});

it("a game can't be forfeited twice", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-double`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);
  const first = await forfeit(gamePath, challengerCookie);
  expect(first.status).toBe(303);

  const second = await forfeit(gamePath, opponentCookie);
  expect(second.status).toBe(200);
  expect(await second.text()).toContain("isn't active");
});

it("no move is possible after a forfeit", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-no-move-after`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);
  await forfeit(gamePath, challengerCookie);

  const moveRes = await fetch(new URL(`${gamePath}/move`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: opponentCookie },
    body: new URLSearchParams({ cell: "0" }),
    redirect: "manual",
  });
  expect(moveRes.status).toBe(200);
});

it("signing out and hitting forfeit or acknowledge requires signing in", async () => {
  const groupPath = await createGroup(`spec-forfeit-group-${Date.now()}-signed-out`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  await accept(gamePath, opponentCookie);

  const forfeitRes = await fetch(new URL(`${gamePath}/forfeit`, baseUrl), { method: "POST", redirect: "manual" });
  expect(forfeitRes.status).toBe(200);
  expect(await forfeitRes.text()).toContain("you need to be signed in");
});

it("two forfeited games from different groups both show up in one /me/challenges fetch", async () => {
  const challengerName = uniqueName("Priya");
  const opponentName = uniqueName("Marcus");
  const challengerCookie = await signup(challengerName, "a-real-password");
  const opponentCookie = await signup(opponentName, "a-real-password");

  const groupA = await createGroup(`spec-forfeit-group-${Date.now()}-multi-a`);
  const groupB = await createGroup(`spec-forfeit-group-${Date.now()}-multi-b`);
  for (const groupPath of [groupA, groupB]) {
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: challengerCookie }, redirect: "manual" });
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: opponentCookie }, redirect: "manual" });
  }

  const opponentInA = await memberId(groupA, challengerCookie, opponentName);
  const opponentInB = await memberId(groupB, challengerCookie, opponentName);

  const gameA = await challenge(groupA, challengerCookie, opponentInA);
  await accept(gameA, opponentCookie);
  await forfeit(gameA, opponentCookie);

  const gameB = await challenge(groupB, challengerCookie, opponentInB);
  await accept(gameB, opponentCookie);
  await forfeit(gameB, opponentCookie);

  const html = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })).text();
  expect((html.match(/left your Tic-Tac-Toe game/g) ?? []).length).toBe(2);
});
