import { expect, it } from "vitest";
import { baseUrl, createGroup, register } from "./support.ts";

// Crit 9's "group A vs group B" feature: one final score per match between
// two whole groups, visible on both groups' pages.

const codeOf = (groupPath: string) => groupPath.replace("/g/", "");

it("a group-vs-group match shows on both groups' pages with the right score on each side", async () => {
  const stamp = Date.now();
  const groupAPath = await createGroup(`spec-match-group-a-${stamp}`);
  const groupBPath = await createGroup(`spec-match-group-b-${stamp}`);
  const cookie = await register(groupAPath, "Priya", "a-real-password");

  const matchRes = await fetch(new URL(`${groupAPath}/matches`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentCode: codeOf(groupBPath), game: "Soccer", scoreUs: "3", scoreThem: "2" }),
    redirect: "manual",
  });
  expect(matchRes.status).toBe(303);

  const groupAHtml = await (await fetch(new URL(groupAPath, baseUrl))).text();
  expect(groupAHtml).toContain("Soccer");
  expect(groupAHtml).toContain("3");
  expect(groupAHtml).toContain(`spec-match-group-b-${stamp}`);
  expect(groupAHtml, "the winning side's fragment should say \"beat\"").toMatch(/beat/);

  const groupBHtml = await (await fetch(new URL(groupBPath, baseUrl))).text();
  expect(groupBHtml).toContain("Soccer");
  expect(groupBHtml).toContain(`spec-match-group-a-${stamp}`);
  expect(groupBHtml, "the losing side's fragment should say \"lost to\"").toContain("lost to");
});

it("a tied group-vs-group match is worded as a draw on both sides", async () => {
  // The outcome text in groupMatchesFragment() has a third branch (score_a
  // === score_b) that the match above, at 3-2, never exercises.
  const stamp = Date.now();
  const groupAPath = await createGroup(`spec-match-draw-a-${stamp}`);
  const groupBPath = await createGroup(`spec-match-draw-b-${stamp}`);
  const cookie = await register(groupAPath, "Priya", "a-real-password");

  const matchRes = await fetch(new URL(`${groupAPath}/matches`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentCode: codeOf(groupBPath), game: "Chess", scoreUs: "1", scoreThem: "1" }),
    redirect: "manual",
  });
  expect(matchRes.status).toBe(303);

  const groupAHtml = await (await fetch(new URL(groupAPath, baseUrl))).text();
  expect(groupAHtml).toContain("drew with");
  const groupBHtml = await (await fetch(new URL(groupBPath, baseUrl))).text();
  expect(groupBHtml).toContain("drew with");
});

it("logging a match against a code that isn't a real group is rejected", async () => {
  const groupPath = await createGroup(`spec-match-group-${Date.now()}-bad-opponent`);
  const cookie = await register(groupPath, "Priya", "a-real-password");

  const res = await fetch(new URL(`${groupPath}/matches`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentCode: "ZZZZZZ", game: "Soccer", scoreUs: "1", scoreThem: "0" }),
    redirect: "manual",
  });
  expect(res.status).toBe(200); // re-rendered with an error, not redirected
  expect(await res.text()).toContain("existing group");
});

it("a group can't log a match against itself", async () => {
  const groupPath = await createGroup(`spec-match-group-${Date.now()}-self`);
  const cookie = await register(groupPath, "Priya", "a-real-password");

  const res = await fetch(new URL(`${groupPath}/matches`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentCode: codeOf(groupPath), game: "Soccer", scoreUs: "1", scoreThem: "0" }),
    redirect: "manual",
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("existing group");
});
