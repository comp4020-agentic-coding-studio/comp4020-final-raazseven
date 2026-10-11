// Shared helpers for the HTTP-level spec tests. Accounts are global now
// (decisions/0002-global-accounts.md): signing up and creating/joining a
// group are two separate steps, not one combined per-group registration ---
// this is the one place that knows the new two-step shape, instead of every
// spec file carrying its own copy.
import { expect, inject } from "vitest";

export const baseUrl = inject("baseUrl");

export function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "expected a session cookie to be set").toBeTruthy();
  return setCookie!.split(";")[0]!;
}

// A fresh, globally-unique name for throwaway accounts a test doesn't care
// about the identity of (e.g. createGroup()'s owner) --- names are unique
// across the whole app now, not just within one group.
let uniqueCounter = 0;
export function uniqueName(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}`;
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

/** Signs up a global account and returns its session cookie --- the one
 * global step every other helper here builds on. */
export async function signup(name: string, password: string, next?: string): Promise<string> {
  const res = await fetch(new URL("/signup", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password, ...(next ? { next } : {}) }),
    redirect: "manual",
  });
  expect(res.status, `signing up ${name}`).toBe(303);
  return sessionCookie(res);
}

export async function login(name: string, password: string, next?: string): Promise<string> {
  const res = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, password, ...(next ? { next } : {}) }),
    redirect: "manual",
  });
  expect(res.status, `logging in ${name}`).toBe(303);
  return sessionCookie(res);
}

/** Creates a group as whoever `ownerCookie` belongs to --- they become its
 * owner. Use this (not createGroup()) when a test needs to control *who*
 * the owner is, e.g. to check an owner-only action. */
export async function createGroupAs(
  ownerCookie: string,
  name: string,
  overrides: { bio?: string; tags?: string } = {},
): Promise<string> {
  const form = uploadForm(
    { name, bio: overrides.bio ?? "a spec-test group", customTags: overrides.tags ?? "Testing" },
    "avatar",
    "avatar.png",
    "image/png",
    TINY_PNG,
  );
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    headers: { cookie: ownerCookie },
    body: form,
    redirect: "manual",
  });
  expect(res.status, "creating a group should redirect to its page").toBe(303);
  const groupPath = res.headers.get("location");
  expect(groupPath, "creating a group should redirect to its page").toBeTruthy();
  return groupPath!;
}

/** Creates a group with a throwaway but valid profile, owned by a
 * throwaway account whose identity the caller doesn't care about --- the
 * shape every pre-accounts spec test already expected from createGroup(). */
export async function createGroup(name: string, overrides: { bio?: string; tags?: string } = {}): Promise<string> {
  const ownerCookie = await signup(uniqueName("owner"), "a-real-password");
  return createGroupAs(ownerCookie, name, overrides);
}

/** Signs up a brand-new account and joins it to an existing group as a
 * regular member --- the two-step replacement for the old one-step
 * "register against this group." Same external signature as before, so
 * most call sites didn't need to change at all.
 *
 * `name` is uniquified internally before signing up: names are global now
 * (decisions/0002-global-accounts.md), where plenty of spec files picked
 * the same plain names ("Priya," "Sam") back when each group was its own
 * namespace. The exact name passed in is still a prefix of the real one, so
 * every existing `.toContain(name)` assertion keeps working unchanged;
 * memberId() below matches on that same prefix. */
export async function register(groupPath: string, name: string, password: string): Promise<string> {
  const cookie = await signup(uniqueName(name), password);
  const res = await fetch(new URL(`${groupPath}/join`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(res.status, `${name} joining ${groupPath}`).toBe(303);
  return cookie;
}

// Winner/loser are a member's id (the log-a-result form is a <select>
// populated from the group's real members), not free text --- this reads the
// id back off the rendered page the same way a browser would. Matches `name`
// as a prefix, not exact text --- register() above uniquifies the real name
// with a suffix the caller never sees.
export async function memberId(groupPath: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(new URL(groupPath, baseUrl), { headers: { cookie } });
  const html = await res.text();
  const match = html.match(new RegExp(`<option value="(\\d+)">${name}[^<]*</option>`));
  expect(match, `expected ${name} to appear as an option in the winner/loser selects`).toBeTruthy();
  return match![1]!;
}

/** Scrapes the signed-in user's own id off /me's avatar <img> src --- there's
 * no API that just returns a bare id, so this reads it the same way a
 * browser displaying that page effectively "knows" it. */
export async function currentUserId(cookie: string): Promise<string> {
  const html = await (await fetch(new URL("/me", baseUrl), { headers: { cookie } })).text();
  const match = html.match(/\/users\/(\d+)\/avatar/);
  expect(match, "expected the signed-in user's avatar to appear on /me").toBeTruthy();
  return match![1]!;
}
