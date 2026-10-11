import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, OTHER_PNG, register, TINY_PNG, uploadForm } from "./support.ts";

// Every member gets a generated avatar the instant they exist (src/avatars.ts)
// and can replace it with an uploaded photo; a group's avatar is mandatory
// from the moment it's created (see spec/group-creation.test.ts for that
// requirement itself) and can likewise be replaced. This checks both over
// HTTP against the running app.

it("a fresh member is served a generated avatar", async () => {
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}`);
  const cookie = await register(groupPath, "Devon", "a-real-password");
  const id = await memberId(groupPath, cookie, "Devon");

  const res = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("image/svg+xml");
  expect(await res.text()).toContain("<svg");
});

it("uploading a valid photo replaces a member's generated avatar", async () => {
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}-upload`);
  const cookie = await register(groupPath, "Devon", "a-real-password");
  const id = await memberId(groupPath, cookie, "Devon");

  const uploadRes = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm({}, "avatar", "avatar.png", "image/png", TINY_PNG),
    redirect: "manual",
  });
  expect(uploadRes.status).toBe(303);

  const after = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));
});

it("a member can't update someone else's avatar", async () => {
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}-auth`);
  const ownerCookie = await register(groupPath, "Owner", "a-real-password");
  const otherCookie = await register(groupPath, "Other", "a-real-password");
  const ownerId = await memberId(groupPath, ownerCookie, "Owner");

  const res = await fetch(new URL(`${groupPath}/members/${ownerId}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie: otherCookie },
    body: uploadForm({}, "avatar", "avatar.png", "image/png", TINY_PNG),
  });
  expect(res.status).toBe(403);

  // and the avatar is unchanged --- still generated, not the upload attempt
  const after = await fetch(new URL(`${groupPath}/members/${ownerId}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toContain("image/svg+xml");
});

it("an oversized or wrong-type upload is rejected and leaves the avatar unchanged", async () => {
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}-reject`);
  const cookie = await register(groupPath, "Devon", "a-real-password");
  const id = await memberId(groupPath, cookie, "Devon");

  const wrongType = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm({}, "avatar", "notes.txt", "text/plain", new TextEncoder().encode("not an image")),
  });
  expect(wrongType.status).toBe(200); // re-rendered with an error, not redirected
  expect(await wrongType.text()).toContain("PNG, JPEG, or WebP");

  const after = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toContain("image/svg+xml");
});

it("a group's avatar is the photo it was created with, and any signed-in member can replace it", async () => {
  // createGroup() (spec/support.ts) uploads TINY_PNG as part of group
  // creation itself --- a group photo is mandatory now, not optional-and-
  // generated, so there's no "before" state where the group has no avatar.
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}-group`);
  const cookie = await register(groupPath, "Devon", "a-real-password");

  const before = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(before.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await before.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));

  const uploadRes = await fetch(new URL(`${groupPath}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm({}, "avatar", "group.png", "image/png", OTHER_PNG),
    redirect: "manual",
  });
  expect(uploadRes.status).toBe(303);

  const after = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(OTHER_PNG));
});
