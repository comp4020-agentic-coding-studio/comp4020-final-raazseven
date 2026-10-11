import { expect, it } from "vitest";
import { baseUrl, createGroup, login, memberId, register, signup, uniqueName } from "./support.ts";

// Crit 8's bar: a stranger can do the core thing (create an account, log a
// 1v1 result) and find their trace still there when they come back. This
// checks that round trip over HTTP against the running app, so it holds for
// whatever stack builds it. Global-account specifics (a name being taken,
// wrong-password rejection, direct login) moved to spec/accounts.test.ts
// once accounts stopped being scoped to one group --- this file stays
// focused on what it's named for: logging and keeping a result.

it("a registered member's logged result is still there on the next visit", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}`);

  const cookie = await register(groupPath, "Riley", "hunter22");
  await register(groupPath, "Sam", "another-password");
  const rileyId = await memberId(groupPath, cookie, "Riley");
  const samId = await memberId(groupPath, cookie, "Sam");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "FIFA", winner: rileyId, loser: samId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  // A fresh request with the same session cookie, as if Riley had closed the
  // tab and come back.
  const revisit = await fetch(new URL(groupPath, baseUrl), { headers: { cookie } });
  expect(revisit.status).toBe(200);
  const html = await revisit.text();
  expect(html).toContain("FIFA");
  expect(html).toContain("Riley");
  expect(html).toContain("Sam");
});

it("logging a result requires being a member of the group, not just signed in", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-nonmember`);
  const cookie = await register(groupPath, "Alex", "a-password-123");
  const alexId = await memberId(groupPath, cookie, "Alex");
  await register(groupPath, "Jo", "another-password");
  const joId = await memberId(groupPath, cookie, "Jo");

  // No session cookie at all: the app must not record this as a result, even
  // though both named players are real members.
  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ game: "FIFA", winner: alexId, loser: joId }),
  });
  expect(logRes.status).toBe(200);
  const html = await logRes.text();
  expect(html, "signed-out visitors should be prompted to log in or sign up").toContain(
    "Log in or sign up to join",
  );

  const after = await fetch(new URL(groupPath, baseUrl));
  const afterHtml = await after.text();
  expect(afterHtml).not.toContain("FIFA");
});

it("a signed-in user who hasn't joined this group can't log a result either", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-outsider`);
  const cookie = await register(groupPath, "In-group", "a-real-password");
  const inGroupId = await memberId(groupPath, cookie, "In-group");
  const outsiderCookie = await signup(uniqueName("outsider"), "a-real-password");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: outsiderCookie },
    body: new URLSearchParams({ game: "FIFA", winner: inGroupId, loser: inGroupId }),
  });
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("Join this group");

  expect(await (await fetch(new URL(groupPath, baseUrl))).text()).not.toContain("FIFA");
});

it("a result can't be logged against someone who isn't a member of the group", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-strangers`);
  const cookie = await register(groupPath, "Casey", "a-real-password");
  const caseyId = await memberId(groupPath, cookie, "Casey");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    // id 999999 belongs to no one in this (or any) group
    body: new URLSearchParams({ game: "FIFA", winner: caseyId, loser: "999999" }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(200); // re-rendered with an error, not redirected
  const html = await logRes.text();
  expect(html).toContain("must both be members of this group");

  const after = await fetch(new URL(groupPath, baseUrl));
  expect(await after.text()).not.toContain("FIFA");
});

it("winner and loser can't be the same player", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-self-match`);
  const cookie = await register(groupPath, "Drew", "a-real-password");
  const drewId = await memberId(groupPath, cookie, "Drew");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "Chess", winner: drewId, loser: drewId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("can't be the same player");
});

it("logging back in after logging out requires the password again, and the stale session can't log a result", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-logout`);

  // Captured directly (not via register()) so the later re-login can use
  // the exact, real, globally-unique name --- register() uniquifies "Sam"
  // internally, and that suffixed name is what's actually registered.
  const samName = uniqueName("Sam");
  const oldCookie = await signup(samName, "correct-horse");
  const joinRes = await fetch(new URL(`${groupPath}/join`, baseUrl), {
    method: "POST",
    headers: { cookie: oldCookie },
    redirect: "manual",
  });
  expect(joinRes.status).toBe(303);
  const robinCookie = await register(groupPath, "Robin", "another-password");
  const samId = await memberId(groupPath, robinCookie, samName);
  const robinId = await memberId(groupPath, robinCookie, "Robin");

  // Logout is global now (decisions/0002-global-accounts.md) --- no group
  // code involved.
  const logoutRes = await fetch(new URL("/logout", baseUrl), {
    method: "POST",
    headers: { cookie: oldCookie },
    redirect: "manual",
  });
  expect(logoutRes.status).toBe(303);

  // The old session token must no longer work after logging out.
  const staleAttempt = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: oldCookie },
    body: new URLSearchParams({ game: "Chess", winner: samId, loser: robinId }),
    redirect: "manual",
  });
  expect(staleAttempt.status).toBe(200); // not redirected: the result wasn't recorded
  const staleHtml = await staleAttempt.text();
  expect(staleHtml, "a logged-out session token must not still work").toContain("Log in or sign up to join");

  // Logging back in with the password works and issues a usable session.
  const newCookie = await login(samName, "correct-horse");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: newCookie },
    body: new URLSearchParams({ game: "Chess", winner: samId, loser: robinId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);
});
