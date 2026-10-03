import { expect, inject, it } from "vitest";

// Crit 8's bar: a stranger can do the core thing (log a 1v1 result in a
// group) and find their trace still there when they come back. This checks
// that round trip over HTTP against the running app, so it holds for
// whatever stack builds it.
const baseUrl = inject("baseUrl");

it("a logged result is still there on the next visit", async () => {
  const groupName = `spec-test-group-${Date.now()}`;

  const createRes = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: groupName }),
    redirect: "manual",
  });
  expect(createRes.status).toBe(303);
  const groupPath = createRes.headers.get("location");
  expect(groupPath, "creating a group should redirect to its page").toBeTruthy();

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ game: "FIFA", winner: "Riley", loser: "Sam" }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  // A fresh request, as if the stranger had closed the tab and come back.
  const revisit = await fetch(new URL(groupPath!, baseUrl));
  expect(revisit.status).toBe(200);
  const html = await revisit.text();
  expect(html).toContain("FIFA");
  expect(html).toContain("Riley");
  expect(html).toContain("Sam");
});
