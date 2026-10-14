import { expect, it } from "vitest";
import { baseUrl, createGroup, currentUserId, memberId, register, signup, uniqueName } from "./support.ts";

// decisions/0003-team-results-and-profile-visibility.md: a profile's shared
// history is only visible through a group the VIEWER currently belongs to,
// checked server-side --- not public to anyone who knows a user id, and not
// gated by the target's own membership. These check that boundary directly.

it("two members of a shared group see their head-to-head history on each other's profile", async () => {
  const groupPath = await createGroup(`spec-profile-group-${Date.now()}`);
  const rileyCookie = await register(groupPath, "Riley", "a-real-password");
  const samCookie = await register(groupPath, "Sam", "a-real-password");
  const rileyId = await memberId(groupPath, rileyCookie, "Riley");
  const samId = await memberId(groupPath, rileyCookie, "Sam");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: rileyCookie },
    body: new URLSearchParams({ game: "FIFA", winner: rileyId, loser: samId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const rileyViewsSam = await (
    await fetch(new URL(`/u/${samId}`, baseUrl), { headers: { cookie: rileyCookie } })
  ).text();
  expect(rileyViewsSam).toContain("Head-to-head");
  expect(rileyViewsSam).toContain("FIFA");

  const samViewsRiley = await (
    await fetch(new URL(`/u/${rileyId}`, baseUrl), { headers: { cookie: samCookie } })
  ).text();
  expect(samViewsRiley).toContain("FIFA");
});

it("a team result shows under 'teamed up' for two people on the same side", async () => {
  const groupPath = await createGroup(`spec-profile-group-${Date.now()}-teamed`);
  const priyaCookie = await register(groupPath, "Priya", "a-real-password");
  const jordanCookie = await register(groupPath, "Jordan", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const priyaId = await memberId(groupPath, priyaCookie, "Priya");
  const jordanId = await memberId(groupPath, priyaCookie, "Jordan");
  const marcusId = await memberId(groupPath, priyaCookie, "Marcus");

  const body = new URLSearchParams();
  body.append("game", "Rocket League");
  body.append("winner", priyaId);
  body.append("winner", jordanId);
  body.append("loser", marcusId);
  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: priyaCookie },
    body,
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const priyaViewsJordan = await (
    await fetch(new URL(`/u/${jordanId}`, baseUrl), { headers: { cookie: priyaCookie } })
  ).text();
  expect(priyaViewsJordan).toContain("Teamed up");
  expect(priyaViewsJordan).toContain("Rocket League");

  const jordanViewsPriya = await (
    await fetch(new URL(`/u/${priyaId}`, baseUrl), { headers: { cookie: jordanCookie } })
  ).text();
  expect(jordanViewsPriya).toContain("Rocket League");
});

it("a user with no group in common with the viewer shows no shared history", async () => {
  const groupPath = await createGroup(`spec-profile-group-${Date.now()}-stranger`);
  const inGroupCookie = await register(groupPath, "InGroup", "a-real-password");
  const inGroupId = await memberId(groupPath, inGroupCookie, "InGroup");

  const outsiderCookie = await signup(uniqueName("outsider"), "a-real-password");
  const html = await (
    await fetch(new URL(`/u/${inGroupId}`, baseUrl), { headers: { cookie: outsiderCookie } })
  ).text();
  expect(html).toContain("don't share a group");
  expect(html).not.toContain("Head-to-head");
});

it("an anonymous visitor is prompted to log in rather than shown any history", async () => {
  const groupPath = await createGroup(`spec-profile-group-${Date.now()}-anon`);
  const cookie = await register(groupPath, "Taylor", "a-real-password");
  const taylorId = await memberId(groupPath, cookie, "Taylor");

  const html = await (await fetch(new URL(`/u/${taylorId}`, baseUrl))).text();
  expect(html).toContain("Log in to see shared history");
  expect(html).not.toContain("Head-to-head");
});

it("visiting your own profile redirects to /me", async () => {
  const cookie = await signup(uniqueName("self-view"), "a-real-password");
  const ownId = await currentUserId(cookie);

  const res = await fetch(new URL(`/u/${ownId}`, baseUrl), { headers: { cookie }, redirect: "manual" });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/me");
});
