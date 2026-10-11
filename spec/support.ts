// Shared helpers for the HTTP-level spec tests. Every test file needs a
// group and a signed-in member to get anywhere, and group creation now
// requires a full profile (bio, a tag, a photo), not just a name --- this is
// the one place that knows how to build a valid one, instead of five spec
// files each carrying their own (slightly different) copy.
import { expect, inject } from "vitest";

export const baseUrl = inject("baseUrl");

export function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "expected a session cookie to be set").toBeTruthy();
  return setCookie!.split(";")[0]!;
}

// Two minimal, distinct valid 1x1 PNGs (red, blue), inline so no spec file
// needs an external fixture --- having two different ones lets a test prove
// an upload actually replaced the bytes, not just re-sent the same ones.
// Uint8Array.from (unlike Buffer.from) always allocates a fresh, non-pooled
// ArrayBuffer, which is what Blob's constructor type wants.
export const TINY_PNG: Uint8Array<ArrayBuffer> = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

export const OTHER_PNG: Uint8Array<ArrayBuffer> = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
    "base64",
  ),
);

export function uploadForm(fields: Record<string, string>, fileField: string, filename: string, mime: string, bytes: Uint8Array<ArrayBuffer>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set(fileField, new Blob([bytes], { type: mime }), filename);
  return form;
}

/** Creates a group with a throwaway but valid profile --- name, bio, one
 * tag, and a photo are all mandatory now, so every test that just needs
 * *a* group still has to supply all four. */
export async function createGroup(
  name: string,
  overrides: { bio?: string; tags?: string } = {},
): Promise<string> {
  const form = uploadForm(
    { name, bio: overrides.bio ?? "a spec-test group", tags: overrides.tags ?? "Testing" },
    "avatar",
    "avatar.png",
    "image/png",
    TINY_PNG,
  );
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  expect(res.status, "creating a group should redirect to its page").toBe(303);
  const groupPath = res.headers.get("location");
  expect(groupPath, "creating a group should redirect to its page").toBeTruthy();
  return groupPath!;
}

export async function register(groupPath: string, name: string, password: string): Promise<string> {
  const res = await fetch(new URL(`${groupPath}/register`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password }),
    redirect: "manual",
  });
  expect(res.status, `registering ${name}`).toBe(303);
  return sessionCookie(res);
}

// Winner/loser are a member's id (the log-a-result form is a <select>
// populated from the group's real members), not free text --- this reads the
// id back off the rendered page the same way a browser would.
export async function memberId(groupPath: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(new URL(groupPath, baseUrl), { headers: { cookie } });
  const html = await res.text();
  const match = html.match(new RegExp(`<option value="(\\d+)">${name}</option>`));
  expect(match, `expected ${name} to appear as an option in the winner/loser selects`).toBeTruthy();
  return match![1]!;
}
