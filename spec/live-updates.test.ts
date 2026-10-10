import { expect, inject, it } from "vitest";

// Crit 9's bar: a change one person makes reaches everyone else with the
// group open within about a second, with no reload. This opens the same SSE
// stream the group page's browser script would (src/live.ts via
// GET /g/:code/events) and checks a change made through a second, unrelated
// request shows up in it quickly --- the contract, independent of how the
// page itself renders.
const baseUrl = inject("baseUrl");

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

/** Reads an SSE stream until `predicate(bufferedText)` is true, or `timeoutMs` passes. */
async function readUntil(
  body: ReadableStream<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !predicate(buffer)) {
      const timeLeft = deadline - Date.now();
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), timeLeft),
        ),
      ]);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return buffer;
}

it("a result logged by one session reaches another session's open stream within ~1s", async () => {
  const groupPath = await createGroup(`spec-live-group-${Date.now()}`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  const eventsRes = await fetch(new URL(`${groupPath}/events`, baseUrl));
  expect(eventsRes.status).toBe(200);
  expect(eventsRes.headers.get("content-type")).toContain("text/event-stream");

  // A second, independent request --- as if someone else had the page open
  // and logged this from their own tab.
  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "FIFA", winner: winnerId, loser: loserId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const streamed = await readUntil(
    eventsRes.body!,
    (text) => text.includes("event: result") && text.includes("FIFA"),
    3000,
  );
  expect(streamed, "the open stream should have received the new result live").toContain("event: result");
  expect(streamed).toContain("FIFA");
});

it("a newly registered member reaches another session's open stream live", async () => {
  const groupPath = await createGroup(`spec-live-group-${Date.now()}-member`);
  await register(groupPath, "Priya", "a-real-password");

  const eventsRes = await fetch(new URL(`${groupPath}/events`, baseUrl));
  expect(eventsRes.status).toBe(200);

  await register(groupPath, "Marcus", "another-password");

  const streamed = await readUntil(
    eventsRes.body!,
    (text) => text.includes("event: member") && text.includes("Marcus"),
    3000,
  );
  expect(streamed, "the open stream should see the new member live, without a reload").toContain("event: member");
  expect(streamed).toContain("Marcus");
});
