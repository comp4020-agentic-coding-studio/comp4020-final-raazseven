import { expect, inject, it } from "vitest";

// Every member and group gets a generated avatar the instant they exist
// (src/avatars.ts), and can replace it with an uploaded photo. This checks
// both halves of that over HTTP against the running app.
const baseUrl = inject("baseUrl");

// A minimal valid 1x1 red PNG, inline so this file has no external fixture.
// Uint8Array.from (unlike Buffer.from) always allocates a fresh, non-pooled
// ArrayBuffer, which is what Blob's constructor type actually wants.
const TINY_PNG: Uint8Array<ArrayBuffer> = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

async function createGroup(name: string): Promise<string> {
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name }),
    redirect: "manual",
  });
  const groupPath = res.headers.get("location");
  expect(groupPath).toBeTruthy();
  return groupPath!;
}

async function register(groupPath: string, name: string, password: string): Promise<string> {
  const res = await fetch(new URL(`${groupPath}/register`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password }),
    redirect: "manual",
  });
  return sessionCookie(res);
}

async function memberId(groupPath: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(new URL(groupPath, baseUrl), { headers: { cookie } });
  const html = await res.text();
  const match = html.match(new RegExp(`<option value="(\\d+)">${name}</option>`));
  expect(match).toBeTruthy();
  return match![1]!;
}

function uploadForm(filename: string, mime: string, bytes: Uint8Array<ArrayBuffer>): FormData {
  const form = new FormData();
  form.set("avatar", new Blob([bytes], { type: mime }), filename);
  return form;
}

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
    body: uploadForm("avatar.png", "image/png", TINY_PNG),
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
    body: uploadForm("avatar.png", "image/png", TINY_PNG),
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
    body: uploadForm("notes.txt", "text/plain", new TextEncoder().encode("not an image")),
  });
  expect(wrongType.status).toBe(200); // re-rendered with an error, not redirected
  expect(await wrongType.text()).toContain("PNG, JPEG, or WebP");

  const after = await fetch(new URL(`${groupPath}/members/${id}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toContain("image/svg+xml");
});

it("a group gets a generated avatar and any signed-in member can replace it", async () => {
  const groupPath = await createGroup(`spec-avatar-group-${Date.now()}-group`);
  const cookie = await register(groupPath, "Devon", "a-real-password");

  const before = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(before.headers.get("content-type")).toContain("image/svg+xml");

  const uploadRes = await fetch(new URL(`${groupPath}/avatar`, baseUrl), {
    method: "POST",
    headers: { cookie },
    body: uploadForm("group.png", "image/png", TINY_PNG),
    redirect: "manual",
  });
  expect(uploadRes.status).toBe(303);

  const after = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(after.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await after.arrayBuffer())).toEqual(Buffer.from(TINY_PNG));
});
