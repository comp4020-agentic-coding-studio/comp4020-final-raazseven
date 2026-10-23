import { expect, it } from "vitest";
import { baseUrl, createGroup, memberId, register } from "./support.ts";

// decisions/0005-witness-confirmation.md: a witness is optional --- not naming
// one keeps logging exactly as trust-based as it always was (scorekeeping.test.ts
// covers that path). These tests cover what's new: naming a third member as a
// witness, and that witness confirming or denying the result.

it("a result logged with no witness still works exactly as before", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-none`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "FIFA", winner: winnerId, loser: loserId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("FIFA");
  // "witness-pill" is always present as a CSS class name in every page's
  // stylesheet --- what actually indicates a witness is the rendered badge
  // text itself, which shouldn't appear at all when no witness was named.
  expect(html).not.toContain('class="witness-pill');
});

it("naming a witness marks the result pending until the witness confirms", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-pending`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const witnessCookie = await register(groupPath, "Devika", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");
  const witnessId = await memberId(groupPath, cookie, "Devika");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "FIFA", winner: winnerId, loser: loserId, witness: witnessId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("awaiting");

  // Only the named witness sees the confirm/deny form (with the result id in
  // its action URL) --- everyone else just sees the pill.
  const witnessView = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: witnessCookie } })).text();
  const match = witnessView.match(/\/results\/(\d+)\/witness/);
  expect(match, "expected a pending witness form in the witness's own view of the page").toBeTruthy();
  const resultId = match![1]!;

  const confirmRes = await fetch(new URL(`${groupPath}/results/${resultId}/witness`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: witnessCookie },
    body: new URLSearchParams({ decision: "confirm" }),
    redirect: "manual",
  });
  expect(confirmRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("confirmed by");
  expect(after).not.toContain("awaiting");
});

it("the witness can deny a result, which marks it disputed without deleting it", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-deny`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const witnessCookie = await register(groupPath, "Devika", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");
  const witnessId = await memberId(groupPath, cookie, "Devika");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "Chess", winner: winnerId, loser: loserId, witness: witnessId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);

  const witnessView = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: witnessCookie } })).text();
  const resultId = witnessView.match(/\/results\/(\d+)\/witness/)![1]!;

  const denyRes = await fetch(new URL(`${groupPath}/results/${resultId}/witness`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: witnessCookie },
    body: new URLSearchParams({ decision: "deny" }),
    redirect: "manual",
  });
  expect(denyRes.status).toBe(303);

  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  // Still visible --- never dropped, just flagged (CLAUDE.md: never drop data).
  expect(after).toContain("Chess");
  expect(after).toContain("disputed by");
});

it("only the named witness can confirm or deny, not the winner, loser, or a bystander", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-wrong-person`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  const loserCookie = await register(groupPath, "Marcus", "a-real-password");
  const witnessCookie = await register(groupPath, "Devika", "a-real-password");
  const bystanderCookie = await register(groupPath, "Noor", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");
  const witnessId = await memberId(groupPath, cookie, "Devika");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "Chess", winner: winnerId, loser: loserId, witness: witnessId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(303);
  const witnessView = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: witnessCookie } })).text();
  const resultId = witnessView.match(/\/results\/(\d+)\/witness/)![1]!;

  for (const wrongCookie of [cookie, loserCookie, bystanderCookie]) {
    const res = await fetch(new URL(`${groupPath}/results/${resultId}/witness`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: wrongCookie },
      body: new URLSearchParams({ decision: "confirm" }),
      redirect: "manual",
    });
    expect(res.status).toBe(200); // re-rendered with an error, not redirected
    expect(await res.text()).toContain("only the named witness");
  }

  // Still pending after every wrong attempt.
  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("awaiting");
});

it("a witness can't be a winner or loser on the same result", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-self-witness`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "Chess", winner: winnerId, loser: loserId, witness: loserId }),
    redirect: "manual",
  });
  expect(logRes.status).toBe(200);
  expect(await logRes.text()).toContain("witness can't also be a winner or loser");
});

it("a decision can't be replayed once the witness has already answered", async () => {
  const groupPath = await createGroup(`spec-witness-group-${Date.now()}-replay`);
  const cookie = await register(groupPath, "Priya", "a-real-password");
  await register(groupPath, "Marcus", "a-real-password");
  const witnessCookie = await register(groupPath, "Devika", "a-real-password");
  const winnerId = await memberId(groupPath, cookie, "Priya");
  const loserId = await memberId(groupPath, cookie, "Marcus");
  const witnessId = await memberId(groupPath, cookie, "Devika");

  const logRes = await fetch(new URL(`${groupPath}/results`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ game: "Chess", winner: winnerId, loser: loserId, witness: witnessId }),
    redirect: "manual",
  });
  const witnessView = await (await fetch(new URL(groupPath, baseUrl), { headers: { cookie: witnessCookie } })).text();
  const resultId = witnessView.match(/\/results\/(\d+)\/witness/)![1]!;
  expect(logRes.status).toBe(303);

  const firstDecision = await fetch(new URL(`${groupPath}/results/${resultId}/witness`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: witnessCookie },
    body: new URLSearchParams({ decision: "confirm" }),
    redirect: "manual",
  });
  expect(firstDecision.status).toBe(303);

  const secondDecision = await fetch(new URL(`${groupPath}/results/${resultId}/witness`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: witnessCookie },
    body: new URLSearchParams({ decision: "deny" }),
    redirect: "manual",
  });
  expect(secondDecision.status).toBe(200);
  expect(await secondDecision.text()).toContain("already been confirmed or denied");

  // Still confirmed, not flipped to disputed by the replayed request.
  const after = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(after).toContain("confirmed by");
});
