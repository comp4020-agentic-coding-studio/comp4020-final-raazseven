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

it("a registered member's logged result is still there on the next visit", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}`);

  const registerRes = await fetch(new URL(`${groupPath}/register`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Riley", password: "hunter22" }),
    redirect: "manual",
  });
  expect(registerRes.status).toBe(303);
  const cookie = sessionCookie(registerRes);

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "FIFA", winner: "Riley", loser: "Sam" }),
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

  // No session cookie at all: the app must not record this as a result.
  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ game: "FIFA", winner: "Nobody", loser: "Nobody Else" }),
  });
  expect(logRes.status).toBe(200);
  const html = await logRes.text();
  expect(
    html,
    "signed-out visitors should be asked to sign in, not have their result recorded",
  ).not.toContain("Nobody Else");

  const after = await fetch(new URL(groupPath, baseUrl));
  const afterHtml = await after.text();
  expect(afterHtml).not.toContain("Nobody Else");
});

it("logging back in after logging out requires the password again", async () => {
  const groupPath = await createGroup(`spec-test-group-${Date.now()}-logout`);

  const registerRes = await fetch(new URL(`${groupPath}/register`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Sam", password: "correct-horse" }),
    redirect: "manual",
  });
  const oldCookie = sessionCookie(registerRes);

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
    body: new URLSearchParams({ game: "Chess", winner: "Sam", loser: "Ghost" }),
  });
  const staleHtml = await staleAttempt.text();
  expect(staleHtml, "a logged-out session token must not still work").not.toContain("Ghost");

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
    body: new URLSearchParams({ game: "Chess", winner: "Sam", loser: "Robin" }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);
});
