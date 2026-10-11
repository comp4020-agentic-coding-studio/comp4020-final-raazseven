import { expect, it } from "vitest";
import {
  baseUrl,
  createGroupAs,
  currentUserId,
  OTHER_PNG,
  register,
  signup,
  TINY_PNG,
  uniqueName,
  uploadForm,
} from "./support.ts";

// Every user gets a generated avatar the instant they sign up (src/avatars.ts)
// and can replace it --- globally, at /me/avatar, not per group
// (decisions/0002-global-accounts.md: the photo is the same wherever you
// show up). A group's avatar is mandatory from the moment it's created (see
// spec/group-creation.test.ts for that requirement) and can be replaced only
// by its owner. This checks both over HTTP against the running app.

it("a fresh user is served a generated avatar", async () => {
  const cookie = await signup(uniqueName("avatar-user"), "a-real-password");
  const id = await currentUserId(cookie);

  const res = await fetch(new URL(`/users/${id}/avatar`, baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("image/svg+xml");
  expect(await res.text()).toContain("<svg");
});

it("uploading a valid photo replaces a user's generated avatar, from their dashboard, everywhere", async () => {
  const cookie = await signup(uniqueName("avatar-upload"), "a-real-password");
  const id = await currentUserId(cookie);

  const uploadRes = await fetch(new URL("/me/avatar", baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm({}, "avatar", "avatar.png", "image/png", TINY_PNG),
    redirect: "manual",
  });
  expect(uploadRes.status).toBe(303);

  const after = await fetch(new URL(`/users/${id}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));
});

// There's no "a user can't update someone else's avatar" test here anymore
// --- /me/avatar always acts on whoever the session cookie belongs to, with
// no :id in the URL to mismatch against. The old per-group route
// (/g/:code/members/:id/avatar) was the thing that needed that check; this
// one has no equivalent attack surface to check.

it("an oversized or wrong-type upload is rejected and leaves the avatar unchanged", async () => {
  const cookie = await signup(uniqueName("avatar-reject"), "a-real-password");
  const id = await currentUserId(cookie);

  const wrongType = await fetch(new URL("/me/avatar", baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm({}, "avatar", "notes.txt", "text/plain", new TextEncoder().encode("not an image")),
  });
  expect(wrongType.status).toBe(200); // re-rendered with an error, not redirected
  expect(await wrongType.text()).toContain("PNG, JPEG, or WebP");

  const after = await fetch(new URL(`/users/${id}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toContain("image/svg+xml");
});

it("a group's avatar is the photo it was created with, and only the owner can replace it", async () => {
  // createGroupAs() (spec/support.ts) uploads TINY_PNG as part of group
  // creation itself --- a group photo is mandatory now, not optional-and-
  // generated, so there's no "before" state where the group has no avatar.
  const ownerCookie = await signup(uniqueName("group-avatar-owner"), "a-real-password");
  const groupPath = await createGroupAs(ownerCookie, `spec-avatar-group-${Date.now()}`);
  const memberCookie = await register(groupPath, uniqueName("group-avatar-member"), "a-real-password");

  const before = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(before.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await before.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));

  const asMember = await fetch(new URL(`${groupPath}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie: memberCookie },
    body: uploadForm({}, "avatar", "group.png", "image/png", OTHER_PNG),
  });
  expect(asMember.status).toBe(403);
  const stillOriginal = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(Buffer.from(await stillOriginal.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));

  const asOwner = await fetch(new URL(`${groupPath}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie: ownerCookie },
    body: uploadForm({}, "avatar", "group.png", "image/png", OTHER_PNG),
    redirect: "manual",
  });
  expect(asOwner.status).toBe(303);

  const after = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(OTHER_PNG));
});
