import { expect, inject, it } from "vitest";

// Crit 8's bar: a stranger can do the core thing (create an account, log a
// 1v1 result) and find their trace still there when they come back. This
// checks that round trip over HTTP against the running app, so it holds for
// whatever stack builds it.
const baseUrl = inject("baseUrl");

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "registering should set a membership session cookie").toBeTruthy();
  return setCookie!.split(";")[0]!;
}

async function createGroup(name: string): Promise<string> {
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name }),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  const groupPath = res.headers.get("location");
  expect(groupPath, "creating a group should redirect to its page").toBeTruthy();
  return groupPath!;
}

async function register(groupPath: string, name: string, password: string): Promise<string> {
  const res = await fetch(new URL(`${groupPath}/register`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password }),
    redirect: "manual",
  });
  expect(res.status, `registering ${name}`).toBe(303);
  return sessionCookie(res);
}

// Winner/loser are now a member's id (the log-a-result form is a <select>
// populated from the group's real members), not free text --- this reads the
// id back off the rendered page the same way a browser would.
async function memberId(groupPath: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(new URL(groupPath, baseUrl), { headers: { cookie } });
  const html = await res.text();
  const match = html.match(new RegExp(`<option value="(\\d+)">${name}</option>`));
  expect(match, `expected ${name} to appear as an option in the winner/loser selects`).toBeTruthy();
  return match![1]!;
}

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

it("logging a result requires signing in first", async () => {
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
  expect(html, "signed-out visitors should be asked to sign in").toContain("Sign in to log results");

  const after = await fetch(new URL(groupPath, baseUrl));
  const afterHtml = await after.text();
  expect(afterHtml).not.toContain("FIFA");
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

it("logging back in after logging out requires the password again", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-logout`);

  const oldCookie = await register(groupPath, "Sam", "correct-horse");
  const robinCookie = await register(groupPath, "Robin", "another-password");
  const samId = await memberId(groupPath, robinCookie, "Sam");
  const robinId = await memberId(groupPath, robinCookie, "Robin");

  const logoutRes = await fetch(new URL(`${groupPath}/logout`, baseUrl), {
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
  expect(staleHtml, "a logged-out session token must not still work").toContain("Sign in to log results");

  // Logging back in with the password works and issues a usable session.
  const loginRes = await fetch(new URL(`${groupPath}/login`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Sam", password: "correct-horse" }),
    redirect: "manual",
  });
  expect(loginRes.status).toBe(303);
  const newCookie = sessionCookie(loginRes);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: newCookie },
    body: new URLSearchParams({ game: "Chess", winner: samId, loser: robinId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);
});
