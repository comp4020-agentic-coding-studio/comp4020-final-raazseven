import { expect, it } from "vitest";
import { baseUrl, createGroupAs, login, memberId, register, signup, uniqueName } from "./support.ts";

// decisions/0002-global-accounts.md: one account per person, not one per
// group. These check the things that only exist because of that --- direct
// login with no group code, a dashboard listing every group you're in, one
// account joining more than one group, and owner-only actions --- rather
// than re-checking result-logging or real-time, which spec/scorekeeping.test.ts
// and spec/live-updates.test.ts already cover and don't change here.

it("logging in doesn't require a group code --- /login works directly", async () => {
  const name = uniqueName("direct-login");
  await signup(name, "a-real-password");

  const res = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password: "a-real-password" }),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/me"); // the default landing spot, no group involved
});

it("a signed-in user's identity shows up in the shared header on any page, not just one group's card", async () => {
  const name = uniqueName("persistent-header");
  const cookie = await signup(name, "a-real-password");

  const home = await fetch(new URL("/", baseUrl), { headers: { cookie } });
  expect(await home.text()).toContain(name);

  const me = await fetch(new URL("/me", baseUrl), { headers: { cookie } });
  expect(await me.text()).toContain(name);
});

it("a name is taken globally now, not just within one group", async () => {
  const name = uniqueName("global-name");
  await signup(name, "a-real-password");

  const res = await fetch(new URL("/signup", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password: "a-different-password" }),
  });
  expect(res.status).toBe(200); // re-rendered with an error, not redirected
  expect(await res.text()).toContain("already taken");
});

it("logging in with the wrong password is rejected", async () => {
  const name = uniqueName("wrong-password");
  await signup(name, "the-real-password");

  const res = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password: "a-guess" }),
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("incorrect");
});

it("one account can join more than one group, and /me lists all of them", async () => {
  const cookie = await signup(uniqueName("multi-group"), "a-real-password");
  const groupA = await createGroupAs(cookie, `spec-multi-a-${Date.now()}`);

  // A second, separate group, owned by someone else --- our account joins
  // it as a regular member.
  const groupBOwnerCookie = await signup(uniqueName("other-owner"), "a-real-password");
  const groupB = await createGroupAs(groupBOwnerCookie, `spec-multi-b-${Date.now()}`);
  await fetch(new URL(`${groupB}/join`, baseUrl), { method: "POST", headers: { cookie }, redirect: "manual" });

  const dashboard = await (await fetch(new URL("/me", baseUrl), { headers: { cookie } })).text();
  expect(dashboard).toContain(`href="${groupA}"`);
  expect(dashboard).toContain(`href="${groupB}"`);
});

it("visiting a group you're not in offers to join rather than showing nothing or erroring", async () => {
  const groupPath = await createGroupAs(await signup(uniqueName("some-owner"), "a-real-password"), `spec-join-${Date.now()}`);
  const visitorCookie = await signup(uniqueName("visitor"), "a-real-password");

  const before = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: visitorCookie } })).text();
  expect(before).toContain("Join this group");
  expect(before, "shouldn't see the log-a-result form before joining").not.toContain("Log a result");

  const joinRes = await fetch(new URL(`${groupPath}/join`, baseUrl), {
    method: "POST",
    headers: { cookie: visitorCookie },
    redirect: "manual",
  });
  expect(joinRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: visitorCookie } })).text();
  expect(after).toContain("Log a result");
});

it("a signed-out visitor sees a log in/sign up prompt, not the join or log-a-result forms", async () => {
  const groupPath = await createGroupAs(await signup(uniqueName("owner-for-anon"), "a-real-password"), `spec-anon-${Date.now()}`);
  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("Log in or sign up to join");
  expect(html).not.toContain("Join this group");
  expect(html).not.toContain("Log a result");
});

it("only the owner can edit the group's profile --- a plain member is forbidden", async () => {
  const ownerCookie = await signup(uniqueName("profile-owner"), "a-real-password");
  const groupPath = await createGroupAs(ownerCookie, `spec-owner-profile-${Date.now()}`);
  const memberCookie = await register(groupPath, uniqueName("profile-member"), "a-real-password");

  const asMember = await fetch(new URL(`${groupPath}/profile`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: memberCookie },
    body: new URLSearchParams({ bio: "I'm not the owner", customTags: "Testing" }),
  });
  expect(asMember.status).toBe(403);

  const asOwner = await fetch(new URL(`${groupPath}/profile`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: ownerCookie },
    body: new URLSearchParams({ bio: "Updated by the real owner", customTags: "Testing" }),
    redirect: "manual",
  });
  expect(asOwner.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("Updated by the real owner");
  expect(html).not.toContain("I'm not the owner");
});

it("only the owner can remove a member --- a plain member is forbidden, the owner succeeds", async () => {
  const ownerCookie = await signup(uniqueName("remove-owner"), "a-real-password");
  const groupPath = await createGroupAs(ownerCookie, `spec-remove-${Date.now()}`);
  const targetName = uniqueName("to-be-removed");
  await register(groupPath, targetName, "a-real-password");
  const otherMemberCookie = await register(groupPath, uniqueName("bystander"), "a-real-password");
  const targetId = await memberId(groupPath, ownerCookie, targetName);

  const asMember = await fetch(new URL(`${groupPath}/members/${targetId}/remove`, baseUrl), {
    method: "POST",
    headers: { cookie: otherMemberCookie },
  });
  expect(asMember.status).toBe(403);
  expect(await (await fetch(new URL(groupPath, baseUrl))).text()).toContain(targetName);

  const asOwner = await fetch(new URL(`${groupPath}/members/${targetId}/remove`, baseUrl), {
    method: "POST",
    headers: { cookie: ownerCookie },
    redirect: "manual",
  });
  expect(asOwner.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  // Removed from the member list, but --- see spec/scorekeeping.test.ts's
  // sibling concern --- nothing here claims their past results disappear.
  const memberListSection = after.slice(after.indexOf('class="member-list"'), after.indexOf("group-layout"));
  expect(memberListSection).not.toContain(targetName);
});

it("the owner can't be removed --- there's no ownership transfer, so that would leave the group unmanaged", async () => {
  const ownerName = uniqueName("unremovable-owner");
  const ownerCookie = await signup(ownerName, "a-real-password");
  const groupPath = await createGroupAs(ownerCookie, `spec-unremovable-${Date.now()}`);
  const ownerId = await memberId(groupPath, ownerCookie, ownerName);

  const res = await fetch(new URL(`${groupPath}/members/${ownerId}/remove`, baseUrl), {
    method: "POST",
    headers: { cookie: ownerCookie },
    redirect: "manual",
  });
  // The request succeeds (it's the owner acting, so requireOwner() passes)
  // but the removal itself is a no-op --- the owner role is excluded.
  expect(res.status).toBe(303);
  const html = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: ownerCookie } })).text();
  expect(html).toContain("role-badge\">Owner");
});
