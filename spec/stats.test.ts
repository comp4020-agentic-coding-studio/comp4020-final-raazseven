import { expect, it } from "vitest";
import { baseUrl, createGroup, login, memberId, register, signup, uniqueName } from "./support.ts";

// The stats dashboard (GET /me/stats) compares the viewer against everyone
// they currently share a group with, overall and per game --- the
// "friend" pool is db.ts's friendsForUser(), the same shared-group
// visibility boundary decisions/0003's profile page already uses, not a
// separate friends list.

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

it("signing out and visiting /me/stats prompts a sign-in", async () => {
  const res = await fetch(new URL("/me/stats", baseUrl), { redirect: "manual" });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toContain("/login");
});

it("a fresh account with no shared groups sees an empty stats page", async () => {
  const cookie = await signup(uniqueName("Lonely"), "a-real-password");
  const html = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie } })).text();
  expect(html).toContain("don't share a group with anyone yet");
});

it("shows an overall win-loss record against a friend after a result is logged", async () => {
  const groupPath = await createGroup(`spec-stats-group-${Date.now()}-overall`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const otherCookie = await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  expect((await logResult(groupPath, cookie, "FIFA", winnerId, loserId)).status).toBe(303);

  const priyaStats = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie } })).text();
  expect(priyaStats).toContain("Marcus");
  expect(priyaStats).toContain("1–0");

  // The record is symmetric but opposite from the other side.
  const marcusStats = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie: otherCookie } })).text();
  expect(marcusStats).toContain("Priya");
  expect(marcusStats).toContain("0–1");
});

it("breaks the record down per game once more than one game has been played against the same friend", async () => {
  const groupPath = await createGroup(`spec-stats-group-${Date.now()}-bygame`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  expect((await logResult(groupPath, cookie, "FIFA", winnerId, loserId)).status).toBe(303);
  expect((await logResult(groupPath, cookie, "Chess", loserId, winnerId)).status).toBe(303);

  const html = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie } })).text();
  // Overall: 1 win (FIFA), 1 loss (Chess) --- 1-1 against Marcus.
  expect(html).toContain("1–1");
  expect(html).toContain("FIFA");
  expect(html).toContain("Chess");
});

it("aggregates every result in every shared group into one overall tally against a friend", async () => {
  // Two accounts signed up directly (not via register(), which signs up a
  // uniquified name AND joins in one step) --- names are already globally
  // unique (decisions/0002), so memberId() can match on the full name
  // exactly once each account joins both groups below.
  const priyaName = uniqueName("Priya");
  const marcusName = uniqueName("Marcus");
  const priyaCookie = await signup(priyaName, "a-real-password");
  const marcusCookie = await signup(marcusName, "a-real-password");

  const groupA = await createGroup(`spec-stats-group-${Date.now()}-multi-a`);
  const groupB = await createGroup(`spec-stats-group-${Date.now()}-multi-b`);
  for (const groupPath of [groupA, groupB]) {
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: priyaCookie }, redirect: "manual" });
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: marcusCookie }, redirect: "manual" });
  }

  const priyaInA = await memberId(groupA, priyaCookie, priyaName);
  const marcusInA = await memberId(groupA, priyaCookie, marcusName);
  expect((await logResult(groupA, priyaCookie, "FIFA", priyaInA, marcusInA)).status).toBe(303); // Priya wins in A

  const priyaInB = await memberId(groupB, priyaCookie, priyaName);
  const marcusInB = await memberId(groupB, priyaCookie, marcusName);
  expect((await logResult(groupB, priyaCookie, "Chess", marcusInB, priyaInB)).status).toBe(303); // Priya loses in B

  const html = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie: priyaCookie } })).text();
  // One win in group A, one loss in group B against the same friend --- 1-1 overall.
  expect(html).toContain(marcusName);
  expect(html).toContain("1–1");
});

it("only compares against current friends --- someone you've never shared a group with isn't listed", async () => {
  const groupPath = await createGroup(`spec-stats-group-${Date.now()}-stranger`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const strangerCookie = await signup(uniqueName("Stranger"), "a-real-password");
  void strangerCookie;

  const html = await (await fetch(new URL("/me/stats", baseUrl), { headers: { cookie } })).text();
  expect(html).not.toContain("Stranger");
});

it("logging back in after logging out requires the password again before /me/stats works", async () => {
  const name = uniqueName("Stale");
  const oldCookie = await signup(name, "correct-horse");
  await fetch(new URL("/logout", baseUrl), { method: "POST", headers: { cookie: oldCookie }, redirect: "manual" });

  const staleAttempt = await fetch(new URL("/me/stats", baseUrl), { headers: { cookie: oldCookie }, redirect: "manual" });
  expect(staleAttempt.status).toBe(303);
  expect(staleAttempt.headers.get("location")).toContain("/login");

  const newCookie = await login(name, "correct-horse");
  const after = await fetch(new URL("/me/stats", baseUrl), { headers: { cookie: newCookie } });
  expect(after.status).toBe(200);
});
