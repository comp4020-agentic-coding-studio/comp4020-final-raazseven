import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register, signup, uniqueName } from "./support.ts";

// decisions/0008-site-wide-challenge-notification.md: decisions/0007 fixed
// the worst of the original gap (a challenge no longer starts active with
// no notice) but its fix only ever reached someone already looking at the
// one group's page where the challenge happened. These check the actual
// fix for that: GET /me/challenges returns a pending challenge regardless
// of which group it came from or which page the challenged person is on,
// and every page (not just the group's own) carries the <dialog> shell
// that fetches it.

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

it("signing out and hitting /me/events or /me/challenges requires signing in", async () => {
  const eventsRes = await fetch(new URL("/me/events", baseUrl));
  expect(eventsRes.status).toBe(401);

  const fragmentRes = await fetch(new URL("/me/challenges", baseUrl));
  expect(fragmentRes.status).toBe(401);
});

it("/me/challenges is empty for a signed-in user with no pending challenge", async () => {
  const cookie = await signup(uniqueName("Nobody"), "a-real-password");
  const html = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie } })).text();
  expect(html).toBe("");
});

it("a challenge shows up in /me/challenges even though it was never fetched from the group's own page", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  await challenge(groupPath, challengerCookie, opponentId);

  const html = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(html).toContain("You've been challenged");
  expect(html).toContain("Priya");
  expect(html).toContain("Tic-Tac-Toe");
});

it("every page --- not just the group's own --- renders the popup's <dialog> shell for a signed-in user", async () => {
  const cookie = await signup(uniqueName("AnyPage"), "a-real-password");
  const meHtml = await (await fetch(new URL("/me", baseUrl), { headers: { cookie } })).text();
  expect(meHtml).toContain('id="challenge-popup"');
  expect(meHtml).toContain("/me/events");
  expect(meHtml).toContain("/me/challenges");
});

it("a signed-out visitor gets no challenge-popup dialog at all", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).not.toContain('id="challenge-popup"');
});

it("the challenger's own challenge never appears in THEIR /me/challenges", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-challenger`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  await challenge(groupPath, challengerCookie, opponentId);

  const challengerView = await (
    await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: challengerCookie } })
  ).text();
  expect(challengerView).toBe("");
});

it("accepting a challenge clears it from /me/challenges, checked from a fresh request (not just the group page)", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-accept`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);

  const before = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(before).toContain("You've been challenged");

  const acceptRes = await fetch(new URL(`${gamePath}/accept`, baseUrl), {
    method: "POST",
    headers: { cookie: opponentCookie },
    redirect: "manual",
  });
  expect(acceptRes.status).toBe(303);

  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(after).toBe("");
});

it("declining a challenge clears it from /me/challenges", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-decline`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);

  const declineRes = await fetch(new URL(`${gamePath}/decline`, baseUrl), {
    method: "POST",
    headers: { cookie: opponentCookie },
    redirect: "manual",
  });
  expect(declineRes.status).toBe(303);

  const after = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(after).toBe("");
});

// decisions/0009-challenge-ping-no-longer-reloads-the-page.md: the group
// page's own live "challenge" listener used to call location.reload() ---
// which raced the accepting player's own in-flight navigation to the game
// page the accept route redirects to, sometimes landing them back on the
// group page instead. Fixed by fetching GET /g/:code/challenges (a
// per-group, per-viewer fragment, same shape as /me/challenges) and
// swapping it in, rather than reloading the whole page. These check the
// new route's contract directly; the race itself needs a real browser to
// reproduce (verified by hand with two headless-Chromium contexts), not
// something a plain HTTP request can assert on.

it("the group page's live script no longer reloads on a challenge ping", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-no-reload`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie } })).text();
  // The old buggy behaviour was a bare `location.reload();` call inside the
  // "challenge" listener --- checking for that exact call shape (not just
  // the substring "location.reload()", which also appears in this file's
  // own explanatory code comment) is what actually distinguishes "still
  // calls it" from "mentions why it used to."
  expect(html).not.toMatch(/addEventListener\("challenge",\s*function\s*\(\)\s*\{\s*location\.reload\(\);\s*\}\)/);
  expect(html).toContain(`fetch("/g/${groupPath.split("/").pop()}/challenges")`);
});

it("GET /g/:code/challenges returns this viewer's own pending challenge, scoped to this one group", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-group-fragment`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const before = await (await fetch(new URL(`${groupPath}/challenges`, baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(before).toBe("");

  await challenge(groupPath, challengerCookie, opponentId);

  const after = await (await fetch(new URL(`${groupPath}/challenges`, baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(after).toContain("Challenges waiting on you");
  expect(after).toContain("Priya");

  // The challenger themselves see nothing --- it's their own outgoing
  // challenge, not an incoming one.
  const challengerView = await (
    await fetch(new URL(`${groupPath}/challenges`, baseUrl), { headers: { cookie: challengerCookie } })
  ).text();
  expect(challengerView).toBe("");
});

it("GET /g/:code/challenges clears once the challenge is accepted", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-group-fragment-accept`);
  const challengerCookie = await register(groupPath, "Priya", "a-real-password");
  const opponentCookie = await register(groupPath, "Marcus", "a-real-password");
  const opponentId = await memberId(groupPath, challengerCookie, "Marcus");

  const gamePath = await challenge(groupPath, challengerCookie, opponentId);
  const beforeAccept = await (await fetch(new URL(`${groupPath}/challenges`, baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(beforeAccept).toContain("Challenges waiting on you");

  const acceptRes = await fetch(new URL(`${gamePath}/accept`, baseUrl), {
    method: "POST",
    headers: { cookie: opponentCookie },
    redirect: "manual",
  });
  expect(acceptRes.status).toBe(303);
  // The actual bug this guards against: the redirect target has to be the
  // game, not the group page it would have bounced back to under the old
  // location.reload() behaviour.
  expect(acceptRes.headers.get("location")).toBe(gamePath);

  const afterAccept = await (await fetch(new URL(`${groupPath}/challenges`, baseUrl), { headers: { cookie: opponentCookie } })).text();
  expect(afterAccept).toBe("");
});

it("GET /g/:code/challenges for a signed-out visitor or a nonexistent group is handled safely", async () => {
  const groupPath = await createGroup(`spec-notif-group-${Date.now()}-signed-out`);
  const signedOutRes = await fetch(new URL(`${groupPath}/challenges`, baseUrl));
  expect(signedOutRes.status).toBe(200);
  expect(await signedOutRes.text()).toBe("");

  const missingRes = await fetch(new URL("/g/ZZZZZZ/challenges", baseUrl));
  expect(missingRes.status).toBe(404);
});

it("challenges from two different groups both show up in one /me/challenges fetch", async () => {
  const challengerName = uniqueName("Priya");
  const opponentName = uniqueName("Marcus");
  const challengerCookie = await signup(challengerName, "a-real-password");
  const opponentCookie = await signup(opponentName, "a-real-password");

  const groupA = await createGroup(`spec-notif-group-${Date.now()}-multi-a`);
  const groupB = await createGroup(`spec-notif-group-${Date.now()}-multi-b`);
  for (const groupPath of [groupA, groupB]) {
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: challengerCookie }, redirect: "manual" });
    await fetch(new URL(`${groupPath}/join`, baseUrl), { method: "POST", headers: { cookie: opponentCookie }, redirect: "manual" });
  }

  const opponentInA = await memberId(groupA, challengerCookie, opponentName);
  const opponentInB = await memberId(groupB, challengerCookie, opponentName);
  await challenge(groupA, challengerCookie, opponentInA);
  await challenge(groupB, challengerCookie, opponentInB);

  const html = await (await fetch(new URL("/me/challenges", baseUrl), { headers: { cookie: opponentCookie } })).text();
  const matches = html.match(/You've been challenged/g) ?? [];
  expect(matches.length).toBe(1); // one shared heading in the fragment markup
  expect((html.match(/challenged you to Tic-Tac-Toe/g) ?? []).length).toBe(2);
});
