import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import {
  addGroupMatch,
  addResult,
  createGroup,
  getGroupByCode,
  groupMatchesForGroup,
  InvalidCredentialsError,
  loginMember,
  logoutMember,
  memberById,
  memberByToken,
  membersForGroup,
  NameTakenError,
  registerMember,
  resultsForGroup,
  setGroupAvatar,
  setMemberAvatar,
  type Group,
} from "./db.ts";
import {
  AVATAR_MAX_BYTES,
  AvatarTooLargeError,
  generatedAvatar,
  UnsupportedAvatarTypeError,
  validateAvatarUpload,
} from "./avatars.ts";
import { groupMatchesFragment, groupPage, homePage, memberOptionsFragment, resultsListFragment } from "./pages.ts";
import { renderReadme } from "./readme.ts";
import { broadcast, subscribe } from "./live.ts";

const app = Fastify({ logger: true });
await app.register(formbody);
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: AVATAR_MAX_BYTES } });

const memberCookieName = (code: string) => `member_${code}`;
const memberCookieOpts = (code: string) => ({
  path: `/g/${code}`,
  httpOnly: true,
  sameSite: "lax" as const,
  // Fly's proxy terminates TLS in front of the app (fly.toml), so the browser
  // always sees https in production; local dev is plain http, where a
  // `secure` cookie would just never be sent.
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
});

function currentMember(req: { cookies: Record<string, string | undefined> }, group: Group) {
  return memberByToken(group.id, req.cookies[memberCookieName(group.code)]);
}

/** Renders the group page with everything it needs, so every route that can
 * fail back to it doesn't have to repeat the four lookups. */
function renderGroupPage(
  group: Group,
  member: ReturnType<typeof currentMember>,
  errors: { authError?: string; resultError?: string; matchError?: string; avatarError?: string } = {},
): string {
  return groupPage(
    group,
    resultsForGroup(group.id),
    membersForGroup(group.id),
    groupMatchesForGroup(group.id),
    member,
    errors.authError,
    errors.resultError,
    errors.matchError,
    errors.avatarError,
  );
}

function sseLine(event: string, payload: string): string {
  // SSE requires every line of a multi-line payload to carry its own
  // "data:" prefix; EventSource reassembles them with "\n" in between.
  return `event: ${event}\n${payload
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n")}\n\n`;
}

function sendAvatar(
  req: FastifyRequest,
  reply: FastifyReply,
  avatar: { avatar_blob: Buffer | null; avatar_mime: string | null; avatar_updated_at: string | null },
  fallbackSeed: string,
) {
  const hasUpload = avatar.avatar_blob && avatar.avatar_mime;
  const etag = hasUpload ? `"${avatar.avatar_updated_at}"` : `"generated"`;
  if (req.headers["if-none-match"] === etag) {
    reply.code(304).send();
    return;
  }
  reply.header("Cache-Control", "no-cache").header("ETag", etag);
  if (hasUpload) {
    reply.type(avatar.avatar_mime!).send(avatar.avatar_blob);
  } else {
    reply.type("image/svg+xml").send(generatedAvatar(fallbackSeed));
  }
}

app.get("/", async (_req, reply) => {
  reply.type("text/html").send(homePage());
});

app.get("/readme/", async (_req, reply) => {
  reply.type("text/html").send(renderReadme());
});

app.post<{ Body: { name: string } }>("/groups", async (req, reply) => {
  const name = req.body.name?.trim();
  if (!name) return reply.code(400).send("group name is required");
  const group = createGroup(name);
  reply.redirect(`/g/${group.code}`, 303);
});

app.get<{ Querystring: { code?: string } }>("/g", async (req, reply) => {
  const code = req.query.code?.trim().toUpperCase();
  if (!code) return reply.code(400).send("a group code is required");
  reply.redirect(`/g/${code}`, 303);
});

app.get<{ Params: { code: string } }>("/g/:code", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const member = currentMember(req, group);
  reply.type("text/html").send(renderGroupPage(group, member));
});

// Server-sent events: one open connection per viewer, scoped to this group.
// src/live.ts is the in-memory pub-sub; decisions/0001-live-update-scope.md
// records what gets broadcast here and why.
app.get<{ Params: { code: string } }>("/g/:code/events", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.write(": connected\n\n");

  const heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 25_000);
  const unsubscribe = subscribe(group.code, (event) => {
    reply.raw.write(sseLine(event.type, event.html));
  });
  req.raw.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  reply.hijack();
});

app.post<{ Params: { code: string }; Body: { name: string; password: string } }>(
  "/g/:code/register",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");
    const name = req.body.name?.trim();
    const password = req.body.password ?? "";
    if (!name || password.length < 6) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, undefined, { authError: "a name and a password of at least 6 characters are required" }));
    }

    let member;
    try {
      member = registerMember(group.id, name, password);
    } catch (err) {
      if (err instanceof NameTakenError) {
        return reply.type("text/html").send(renderGroupPage(group, undefined, { authError: err.message }));
      }
      throw err;
    }

    broadcast(group.code, { type: "member", html: memberOptionsFragment(membersForGroup(group.id)) });

    reply.setCookie(memberCookieName(group.code), member.token, memberCookieOpts(group.code)).redirect(
      `/g/${group.code}`,
      303,
    );
  },
);

app.post<{ Params: { code: string }; Body: { name: string; password: string } }>(
  "/g/:code/login",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");
    const name = req.body.name?.trim();
    const password = req.body.password ?? "";

    let member;
    try {
      member = loginMember(group.id, name ?? "", password);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.type("text/html").send(renderGroupPage(group, undefined, { authError: err.message }));
      }
      throw err;
    }

    reply.setCookie(memberCookieName(group.code), member.token, memberCookieOpts(group.code)).redirect(
      `/g/${group.code}`,
      303,
    );
  },
);

app.post<{ Params: { code: string } }>("/g/:code/logout", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const member = currentMember(req, group);
  if (member) logoutMember(member.id);
  reply.clearCookie(memberCookieName(group.code), { path: `/g/${group.code}` }).redirect(
    `/g/${group.code}`,
    303,
  );
});

app.post<{ Params: { code: string }; Body: { game: string; winner: string; loser: string } }>(
  "/g/:code/results",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");

    const member = currentMember(req, group);
    if (!member) {
      // Not signed in (or the session was invalidated) --- send them to
      // sign in rather than silently dropping the result.
      return reply.type("text/html").send(renderGroupPage(group, undefined));
    }

    const game = req.body.game?.trim();
    const winnerId = Number(req.body.winner);
    const loserId = Number(req.body.loser);
    if (!game || !Number.isInteger(winnerId) || !Number.isInteger(loserId)) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, member, { resultError: "game, winner and loser are all required" }));
    }
    if (winnerId === loserId) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, member, { resultError: "winner and loser can't be the same player" }));
    }
    // Both players have to already be members of this group --- a result
    // can't be logged against someone who was never there.
    const winner = memberById(group.id, winnerId);
    const loser = memberById(group.id, loserId);
    if (!winner || !loser) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, member, { resultError: "winner and loser must both be members of this group" }));
    }

    addResult(group.id, game, winnerId, loserId);
    broadcast(group.code, { type: "result", html: resultsListFragment(group, resultsForGroup(group.id)) });
    reply.redirect(`/g/${group.code}`, 303);
  },
);

app.post<{ Params: { code: string }; Body: { opponentCode: string; game: string; scoreUs: string; scoreThem: string } }>(
  "/g/:code/matches",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");

    const member = currentMember(req, group);
    if (!member) return reply.type("text/html").send(renderGroupPage(group, undefined));

    const opponentCode = req.body.opponentCode?.trim().toUpperCase();
    const game = req.body.game?.trim();
    const scoreUs = Number(req.body.scoreUs);
    const scoreThem = Number(req.body.scoreThem);
    const opponent = opponentCode ? getGroupByCode(opponentCode) : undefined;

    if (!opponent || opponent.id === group.id) {
      return reply.type("text/html").send(
        renderGroupPage(group, member, { matchError: "enter the code of a different, existing group" }),
      );
    }
    if (!game || !Number.isInteger(scoreUs) || scoreUs < 0 || !Number.isInteger(scoreThem) || scoreThem < 0) {
      return reply.type("text/html").send(
        renderGroupPage(group, member, { matchError: "game and both (non-negative, whole-number) scores are required" }),
      );
    }

    addGroupMatch(group.id, opponent.id, game, scoreUs, scoreThem, member.id);
    broadcast(group.code, { type: "group-match", html: groupMatchesFragment(group, groupMatchesForGroup(group.id)) });
    broadcast(opponent.code, {
      type: "group-match",
      html: groupMatchesFragment(opponent, groupMatchesForGroup(opponent.id)),
    });
    reply.redirect(`/g/${group.code}`, 303);
  },
);

app.get<{ Params: { code: string; id: string } }>("/g/:code/members/:id/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const member = memberById(group.id, Number(req.params.id));
  if (!member) return reply.code(404).send("no such member");
  sendAvatar(req, reply, member, member.name);
});

app.post<{ Params: { code: string; id: string } }>("/g/:code/members/:id/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const member = currentMember(req, group);
  if (!member || member.id !== Number(req.params.id)) {
    return reply.code(403).send("you can only update your own photo");
  }

  try {
    const data = await req.file();
    if (!data) throw new UnsupportedAvatarTypeError("no file was uploaded");
    const buffer = await data.toBuffer();
    if (data.file.truncated) throw new AvatarTooLargeError(`avatars must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
    validateAvatarUpload(data.mimetype, buffer.length);
    setMemberAvatar(member.id, buffer, data.mimetype);
  } catch (err) {
    if (err instanceof AvatarTooLargeError || err instanceof UnsupportedAvatarTypeError) {
      return reply.type("text/html").send(renderGroupPage(group, member, { avatarError: err.message }));
    }
    throw err;
  }

  reply.redirect(`/g/${group.code}`, 303);
});

app.get<{ Params: { code: string } }>("/g/:code/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  sendAvatar(req, reply, group, group.name);
});

app.post<{ Params: { code: string } }>("/g/:code/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const member = currentMember(req, group);
  if (!member) return reply.type("text/html").send(renderGroupPage(group, undefined));

  try {
    const data = await req.file();
    if (!data) throw new UnsupportedAvatarTypeError("no file was uploaded");
    const buffer = await data.toBuffer();
    if (data.file.truncated) throw new AvatarTooLargeError(`avatars must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
    validateAvatarUpload(data.mimetype, buffer.length);
    setGroupAvatar(group.id, buffer, data.mimetype);
  } catch (err) {
    if (err instanceof AvatarTooLargeError || err instanceof UnsupportedAvatarTypeError) {
      return reply.type("text/html").send(renderGroupPage(group, member, { avatarError: err.message }));
    }
    throw err;
  }

  reply.redirect(`/g/${group.code}`, 303);
});

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
