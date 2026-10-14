import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// A result's winner/loser were strictly one person per side before this
// feature --- these check that a side can now be a team (any number of
// people), that the same player can't show up on both sides, that a
// repeated id within one side is deduped rather than rejected, and that
// every named participant still has to be a real member of the group (the
// same membership gate spec/scorekeeping.test.ts already checks for a 1v1).

it("a 2v1 result records correctly and shows every name", async () => {
  const groupPath = await createGroup(`spec-team-group-${Date.now()}`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Jordan", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, cookie, "Priya");
  const jordanId = await memberId(groupPath, cookie, "Jordan");
  const marcusId = await memberId(groupPath, cookie, "Marcus");

  const body = new URLSearchParams();
  body.append("game", "2v1 FIFA");
  body.append("winner", priyaId);
  body.append("winner", jordanId);
  body.append("loser", marcusId);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("2v1 FIFA");
  expect(html).toContain("Priya");
  expect(html).toContain("Jordan");
  expect(html).toContain("Marcus");
});

it("the same player can't be on both sides of a result", async () => {
  const groupPath = await createGroup(`spec-team-group-${Date.now()}-overlap`);
  const cookie = await register(groupPath, "Alex", "a-real-password");
  await register(groupPath, "Jo", "a-real-password");
  const alexId = await memberId(groupPath, cookie, "Alex");
  const joId = await memberId(groupPath, cookie, "Jo");

  const body = new URLSearchParams();
  body.append("game", "Chess");
  body.append("winner", alexId);
  body.append("winner", joId);
  body.append("loser", joId);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
  expect(logRes.status).toBe(200); // re-rendered with an error, not redirected
  expect(await logRes.text()).toContain("can't be the same player");
});

it("a duplicate id within one side is deduped, not rejected", async () => {
  const groupPath = await createGroup(`spec-team-group-${Date.now()}-dedupe`);
  const cookie = await register(groupPath, "Dana", "a-real-password");
  await register(groupPath, "Sam", "a-real-password");
  const danaId = await memberId(groupPath, cookie, "Dana");
  const samId = await memberId(groupPath, cookie, "Sam");

  const body = new URLSearchParams();
  body.append("game", "Darts");
  body.append("winner", danaId);
  body.append("winner", danaId); // the same id twice, e.g. a double-click
  body.append("loser", samId);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("Darts");
});

it("every participant on either side has to be a member of this group", async () => {
  const groupPath = await createGroup(`spec-team-group-${Date.now()}-stranger`);
  const cookie = await register(groupPath, "Casey", "a-real-password");
  await register(groupPath, "Robin", "a-real-password");
  const caseyId = await memberId(groupPath, cookie, "Casey");
  const robinId = await memberId(groupPath, cookie, "Robin");

  const body = new URLSearchParams();
  body.append("game", "Pool");
  body.append("winner", caseyId);
  body.append("winner", "999999"); // belongs to no one in any group
  body.append("loser", robinId);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("must both be members of this group");

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).not.toContain("Pool");
});
