import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// decisions/0011-minigame-results-never-disputable-draws-logged.md: a
// manually-logged result can now record a draw --- one set of participants,
// no winner/loser split. This exercises the happy path and the two
// validations unique to the draw shape; the shared validations (membership,
// game required) are already covered by spec/scorekeeping.test.ts for the
// winner/loser path and aren't re-tested here.

async function logDraw(groupPath: string, cookie: string, game: string, participantIds: string[]): Promise<Response> {
  const body = new URLSearchParams({ game, isDraw: "1" });
  for (const id of participantIds) body.append("participants", id);
  return fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
}

it("logging a draw records it and renders it as a draw, not a win", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-happy`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId, marcusId]);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie } })).text();
  expect(html).toContain("Chess");
  expect(html).toContain("drew");
  expect(html, "a draw shouldn't render as a win/loss").not.toContain("beat");
});

it("a draw needs at least two participants", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-too-few`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId]);
  expect(logRes.status).toBe(200); // re-rendered with an error, not redirected
  expect(await logRes.text()).toContain("a draw needs at least two people");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("Chess");
});

it("everyone in a draw has to be a member of this group", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-outsider`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");

  // id 999999 belongs to no one in this (or any) group.
  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId, "999999"]);
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("everyone in a draw must be a member of this group");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("Chess");
});

it("a named participant in a draw can dispute it, with the right denominator", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-dispute`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const marcusCookie = await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId, marcusId]);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: marcusCookie } })).text();
  const match = html.match(/\/results\/(\d+)\/dispute/);
  expect(match, "expected a dispute form to render for a named draw participant").toBeTruthy();

  const disputeRes = await fetch(new URL(`${groupPath}/results/${match![1]}/dispute`, baseUrl), {
    method: "POST",
    headers: { cookie: marcusCookie },
    redirect: "manual",
  });
  expect(disputeRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("disputed by 1 of 2 named");
});
