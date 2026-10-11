import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// Crit 9's bar: a change one person makes reaches everyone else with the
// group open within about a second, with no reload. This opens the same SSE
// stream the group page's browser script would (src/live.ts via
// GET /g/:code/events) and checks a change made through a second, unrelated
// request shows up in it quickly --- the contract, independent of how the
// page itself renders.

const codeOf = (groupPath: string) => groupPath.replace("/g/", "");

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

it("a group-vs-group match reaches both groups' open streams live", async () => {
  // The third broadcast type (src/live.ts) alongside result/member --- this
  // was never actually asserted before: the group-matches.test.ts cases only
  // check the rendered page after the fact, not that it arrived live.
  const stamp = Date.now();
  const groupAPath = await createGroup(`spec-live-match-a-${stamp}`);
  const groupBPath = await createGroup(`spec-live-match-b-${stamp}`);
  const cookie = await register(groupAPath, "Priya", "a-real-password");

  const [eventsA, eventsB] = await Promise.all([
    fetch(new URL(`${groupAPath}/events`, baseUrl)),
    fetch(new URL(`${groupBPath}/events`, baseUrl)),
  ]);
  expect(eventsA.status).toBe(200);
  expect(eventsB.status).toBe(200);

  const matchRes = await fetch(new URL(`${groupAPath}/matches`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ opponentCode: codeOf(groupBPath), game: "Soccer", scoreUs: "3", scoreThem: "2" }),
    redirect: "manual",
  });
  expect(matchRes.status).toBe(303);

  const [streamedA, streamedB] = await Promise.all([
    readUntil(eventsA.body!, (text) => text.includes("event: group-match"), 3000),
    readUntil(eventsB.body!, (text) => text.includes("event: group-match"), 3000),
  ]);
  expect(streamedA, "group A's own open stream should see the match live").toContain("event: group-match");
  expect(streamedA).toContain("Soccer");
  expect(streamedB, "the opponent's open stream should see the same match live").toContain("event: group-match");
  expect(streamedB).toContain("Soccer");
});
