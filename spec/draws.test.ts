import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// decisions/0012-two-sided-results-replace-flat-draw.md: a draw now shares
// the same two-sided Side A/Side B shape as a scored result (`outcome:
// "draw"` instead of a flat "who drew" list) --- this exercises the happy
// path for both a 1v1 and a 2v2 draw (the actual gap that prompted the
// rewrite: a flat list couldn't say which pair tied with which), plus the
// shared validations re-using draw's outcome specifically. Membership/
// overlap/witness validations are already covered for the win/loss path by
// spec/scorekeeping.test.ts, spec/team-matches.test.ts and
// spec/witness-confirmation.test.ts and aren't re-tested here.

async function logDraw(groupPath: string, cookie: string, game: string, sideAIds: string[], sideBIds: string[]): Promise<Response> {
  const body = new URLSearchParams({ game, outcome: "draw" });
  for (const id of sideAIds) body.append("winner", id);
  for (const id of sideBIds) body.append("loser", id);
  return fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
}

it("logging a 1v1 draw records it and renders it as a draw, not a win", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-happy`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId], [marcusId]);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie } })).text();
  expect(html).toContain("Chess");
  expect(html).toContain("drew with");
  expect(html, "a draw shouldn't render as a win/loss").not.toContain(">beat<");
  expect(html).toContain("Priya");
  expect(html).toContain("Marcus");
});

it("logging a 2v2 draw keeps both sides distinct, not one flattened list", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-team`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Jordan", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  await register(groupPath, "Noor", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const jordanId = await memberId(groupPath, cookie, "Jordan");
  const marcusId = await memberId(groupPath, cookie, "Marcus");
  const noorId = await memberId(groupPath, cookie, "Noor");

  const logRes = await logDraw(groupPath, cookie, "Rocket League", [priyaId, jordanId], [marcusId, noorId]);
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie } })).text();
  expect(html).toContain("Rocket League");
  expect(html).toContain("drew with");
  expect(html).toContain("Priya");
  expect(html).toContain("Jordan");
  expect(html).toContain("Marcus");
  expect(html).toContain("Noor");
});

it("a draw still needs at least one player per side", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-too-few`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId], []);
  expect(logRes.status).toBe(200); // re-rendered with an error, not redirected
  expect(await logRes.text()).toContain("each side needs at least one player");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("Chess");
});

it("the same player can't be on both sides of a draw", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-overlap`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId], [priyaId]);
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("can't be on both sides");
});

it("everyone in a draw has to be a member of this group", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-outsider`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");

  // id 999999 belongs to no one in this (or any) group.
  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId], ["999999"]);
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("everyone named must be a member of this group");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("Chess");
});

it("a named participant in a draw can dispute it, with the right denominator", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-dispute`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const marcusCookie = await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await logDraw(groupPath, cookie, "Chess", [priyaId], [marcusId]);
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

it("a draw doesn't count as a win or a loss on the stats dashboard", async () => {
  const groupPath = await createGroup(`spec-draw-group-${Date.now()}-stats`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const marcusCookie = await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  expect((await logDraw(groupPath, cookie, "Chess", [priyaId], [marcusId])).status).toBe(303);

  const priyaStats = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie } })).text();
  expect(priyaStats, "a draw shouldn't register as a result against anyone yet").toContain("no results logged against them yet");

  const marcusStats = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie: marcusCookie } })).text();
  expect(marcusStats).toContain("no results logged against them yet");
});
