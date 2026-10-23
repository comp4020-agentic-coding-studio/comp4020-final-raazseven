import { expect, it } from "vitest";
import { baseUrl, createGroup, currentUserId, memberId, register } from "./support.ts";

// decisions/0006-named-party-disputes-and-logger-attribution.md: a witness is
// still optional (spec/witness-confirmation.test.ts covers that path
// unchanged), but now the actual winner/loser named in a result --- not just
// an optional third-party witness --- can dispute it themselves, and every
// result shows who logged it.
//
// Most of these tests have a third account log the result on behalf of two
// others, so "winner," "loser," and "logger" are three distinct people ---
// the cleanest way to exercise each eligibility rule (named participant,
// not the logger, not a bystander) independently rather than them
// overlapping by accident.

async function logResult(
  groupPath: string,
  cookie: string,
  game: string,
  winnerId: string,
  loserId: string,
): Promise<Response> {
  return fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game, winner: winnerId, loser: loserId }),
    redirect: "manual",
  });
}

async function disputeFormResultId(groupPath: string, viewerCookie: string): Promise<string> {
  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: viewerCookie } })).text();
  const match = html.match(/\/results\/(\d+)\/dispute/);
  expect(match, "expected a dispute form to render for this viewer").toBeTruthy();
  return match![1]!;
}

it("a result shows who logged it", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-logger`);
  const loggerCookie = await register(groupPath, "Umpire", "a-real-password");
  await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, loggerCookie, "Priya");
  const loserId = await memberId(groupPath, loggerCookie, "Marcus");
  const loggerId = await currentUserId(loggerCookie);

  const logRes = await logResult(groupPath, loggerCookie, "FIFA", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("logged-by");
  expect(html).toContain(`/u/${loggerId}`);
});

it("a result logged with no witness and never disputed still works exactly as before", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-unaffected`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await logResult(groupPath, cookie, "FIFA", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("FIFA");
  expect(html).not.toContain("disputed by");
});

it("the loser named in a result can dispute it", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-loser-disputes`);
  const loggerCookie = await register(groupPath, "Umpire", "a-real-password");
  await register(groupPath, "Priya", "a-real-password");
  const loserCookie = await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, loggerCookie, "Priya");
  const loserId = await memberId(groupPath, loggerCookie, "Marcus");

  const logRes = await logResult(groupPath, loggerCookie, "FIFA", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const resultId = await disputeFormResultId(groupPath, loserCookie);
  const disputeRes = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie: loserCookie },
    redirect: "manual",
  });
  expect(disputeRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("disputed by 1 of 2 named");
  // Still visible --- never dropped, just flagged (CLAUDE.md: never drop data).
  expect(after).toContain("FIFA");
});

it("the winner named in a result can dispute it too, not just the loser", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-winner-disputes`);
  const loggerCookie = await register(groupPath, "Umpire", "a-real-password");
  const winnerCookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, loggerCookie, "Priya");
  const loserId = await memberId(groupPath, loggerCookie, "Marcus");

  const logRes = await logResult(groupPath, loggerCookie, "Chess", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const resultId = await disputeFormResultId(groupPath, winnerCookie);
  const disputeRes = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie: winnerCookie },
    redirect: "manual",
  });
  expect(disputeRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("disputed by 1 of 2 named");
});

it("a bystander who isn't named in the result can't dispute it", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-bystander`);
  const loggerCookie = await register(groupPath, "Umpire", "a-real-password");
  const winnerCookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const bystanderCookie = await register(groupPath, "Noor", "a-real-password");
  const winnerId = await memberId(groupPath, loggerCookie, "Priya");
  const loserId = await memberId(groupPath, loggerCookie, "Marcus");

  const logRes = await logResult(groupPath, loggerCookie, "Chess", winnerId, loserId);
  expect(logRes.status).toBe(303);

  // Only used to read the result id off a view where the dispute form
  // actually renders --- the bystander never sees that form themselves.
  const resultId = await disputeFormResultId(groupPath, winnerCookie);

  const disputeRes = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie: bystanderCookie },
    redirect: "manual",
  });
  expect(disputeRes.status).toBe(200); // re-rendered with an error, not redirected
  expect(await disputeRes.text()).toContain("only a winner or loser named in this result can dispute it");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("disputed by");
});

it("the person who logged a result can't dispute their own submission, even naming themselves a winner", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-self-log`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const loserCookie = await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  // Priya logs a result naming herself the winner --- she's both the logger
  // and a named participant, so the self-dispute rule has to win even though
  // she'd otherwise be eligible as the winner.
  const logRes = await logResult(groupPath, cookie, "Chess", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie } })).text();
  expect(html, "the logger shouldn't see a dispute button on their own submission").not.toContain("/dispute");

  // Result ids are global, not per-group, so "the only result in a fresh
  // group" can't be assumed to be id 1 --- read the real id off a view
  // where the dispute form *does* render (the loser's) purely to resolve
  // which result this is, then attempt the dispute as the logger against
  // that same id.
  const resultId = await disputeFormResultId(groupPath, loserCookie);
  const directAttempt = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(directAttempt.status).toBe(200); // never a redirect --- never recorded
  expect(await directAttempt.text()).toContain("you can't dispute a result you logged yourself");
});

it("disputing twice is a no-op, not a second dispute", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-repeat`);
  const loggerCookie = await register(groupPath, "Umpire", "a-real-password");
  await register(groupPath, "Priya", "a-real-password");
  const loserCookie = await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, loggerCookie, "Priya");
  const loserId = await memberId(groupPath, loggerCookie, "Marcus");

  const logRes = await logResult(groupPath, loggerCookie, "Chess", winnerId, loserId);
  expect(logRes.status).toBe(303);

  const resultId = await disputeFormResultId(groupPath, loserCookie);

  for (let i = 0; i < 2; i++) {
    const res = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
      method: "POST",
      headers: { cookie: loserCookie },
      redirect: "manual",
    });
    expect(res.status).toBe(303);
  }

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("disputed by 1 of 2 named");
  expect(after).not.toContain("disputed by 2 of 2 named");
});

it("a mini-game's auto-logged result also shows a logger and accepts a dispute from the loser", async () => {
  const groupPath = await createGroup(`spec-dispute-group-${Date.now()}-minigame`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const challengeRes = await fetch(new URL(`${groupPath}/games`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: challengerCookie },
    body: new URLSearchParams({ opponentId, game: "tic-tac-toe" }),
    redirect: "manual",
  });
  expect(challengeRes.status).toBe(303);
  const gamePath = challengeRes.headers.get("location")!;

  // Challenger (X) wins the top row: cells 0, 1, 2. Opponent (O) plays
  // elsewhere, losing before blocking the third X.
  const xMoves = [0, 1, 2];
  const oMoves = [3, 4];
  for (let i = 0; i < xMoves.length; i++) {
    await fetch(new URL(`${gamePath}/move`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: challengerCookie },
      body: new URLSearchParams({ cell: String(xMoves[i]) }),
      redirect: "manual",
    });
    if (i < oMoves.length) {
      await fetch(new URL(`${gamePath}/move`, baseUrl), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: opponentCookie },
        body: new URLSearchParams({ cell: String(oMoves[i]) }),
        redirect: "manual",
      });
    }
  }

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(html).toContain("logged-by");

  const resultId = await disputeFormResultId(groupPath, opponentCookie);
  const disputeRes = await fetch(new URL(`${groupPath}/results/${resultId}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie: opponentCookie },
    redirect: "manual",
  });
  expect(disputeRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("disputed by 1 of 2 named");
});
