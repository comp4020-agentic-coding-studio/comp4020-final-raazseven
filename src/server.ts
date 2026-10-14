import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import {
  addGroupMatch,
  addResult,
  createGroup,
  getGroupByCode,
  getUserById,
  groupMatchesForGroup,
  headToHeadResults,
  InvalidCredentialsError,
  joinGroup,
  loginUser,
  logAction,
  logoutUser,
  memberInGroup,
  membersForGroup,
  membershipFor,
  membershipsForUser,
  NameTakenError,
  registerUser,
  removeMembership,
  resultsForGroup,
  setGroupAvatar,
  setGroupTags,
  setUserAvatar,
  tagById,
  tagsForGroup,
  teamedUpResults,
  updateGroupProfile,
  userByToken,
  type Group,
  type MemberWithRole,
  type User,
} from "./db.ts";
import {
  AVATAR_MAX_BYTES,
  AvatarTooLargeError,
  generatedAvatar,
  UnsupportedAvatarTypeError,
  validateAvatarUpload,
} from "./avatars.ts";
import {
  groupMatchesFragment,
  groupPage,
  homePage,
  loginPage,
  memberOptionsFragment,
  mePage,
  newGroupPage,
  profilePage,
  resultsListFragment,
  signupPage,
} from "./pages.ts";
import { renderReadme } from "./readme.ts";
import { broadcast, subscribe } from "./live.ts";

const app = Fastify({ logger: true });
await app.register(formbody);
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: AVATAR_MAX_BYTES } });

// One global cookie, not one per group (see decisions/0002-global-accounts.md)
// --- it's the same account everywhere, so there's no "replayed against
// another group" risk left to path-scope against.
const SESSION_COOKIE = "session";
const sessionCookieOpts = () => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  // Fly's proxy terminates TLS in front of the app (fly.toml), so the browser
  // always sees https in production; local dev is plain http, where a
  // `secure` cookie would just never be sent.
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
});

function currentUser(req: { cookies: Record<string, string | undefined> }): User | undefined {
  return userByToken(req.cookies[SESSION_COOKIE]);
}

/** Records one action both ways: a structured line through the request's own
 * logger (what `flyctl logs -a <app>` tails live, per crit 10's brief ---
 * "the presenter narrates from the logs") and a row in `audit_log` (crit 10
 * line 3: the logging has to outlive the crit itself, not just the log
 * buffer). `actorUserId` is null for an action with no signed-in actor. */
function record(
  req: FastifyRequest,
  actorUserId: number | null,
  action: string,
  groupId: number | null,
  detail: string,
): void {
  req.log.info({ action, actorUserId, groupId, detail }, action);
  logAction(actorUserId, action, groupId, detail);
}

/** Only ever a same-site path --- an unchecked `next` would be an open
 * redirect (send someone to any URL right after they type their password). */
function safeNext(raw: string | undefined, fallback: string): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}

/** Renders the group page with everything it needs, so every route that can
 * fail back to it doesn't have to repeat the lookups. */
function renderGroupPage(
  group: Group,
  user: User | undefined,
  errors: { resultError?: string; matchError?: string; avatarError?: string; profileError?: string } = {},
): string {
  const membership = user ? membershipFor(user.id, group.id) : undefined;
  return groupPage(
    group,
    resultsForGroup(group.id),
    membersForGroup(group.id),
    groupMatchesForGroup(group.id),
    tagsForGroup(group.id),
    user,
    membership?.role,
    errors.resultError,
    errors.matchError,
    errors.avatarError,
    errors.profileError,
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

app.get("/", async (req, reply) => {
  reply.type("text/html").send(homePage(currentUser(req)));
});

app.get<{ Querystring: { next?: string } }>("/new", async (req, reply) => {
  const user = currentUser(req);
  if (!user) return reply.redirect(`/signup?next=${encodeURIComponent("/new")}`, 303);
  reply.type("text/html").send(newGroupPage(user));
});

app.get("/readme/", async (req, reply) => {
  reply.type("text/html").send(renderReadme(currentUser(req)));
});

app.get<{ Querystring: { next?: string } }>("/signup", async (req, reply) => {
  reply.type("text/html").send(signupPage({ next: safeNext(req.query.next, "/me") }));
});

app.post<{ Body: { name: string; password: string; next?: string } }>("/signup", async (req, reply) => {
  const name = req.body.name?.trim();
  const password = req.body.password ?? "";
  const next = safeNext(req.body.next, "/me");
  const fail = (createError: string) =>
    reply.type("text/html").send(signupPage({ createError, next, prefill: { name: req.body.name } }));

  if (!name || password.length < 6) {
    return fail("a name and a password of at least 6 characters are required");
  }
  let user: User;
  try {
    user = registerUser(name, password);
  } catch (err) {
    if (err instanceof NameTakenError) return fail(err.message);
    throw err;
  }
  record(req, user.id, "signup", null, `"${user.name}" created an account`);
  reply.setCookie(SESSION_COOKIE, user.token, sessionCookieOpts()).redirect(next, 303);
});

app.get<{ Querystring: { next?: string } }>("/login", async (req, reply) => {
  reply.type("text/html").send(loginPage({ next: safeNext(req.query.next, "/me") }));
});

app.post<{ Body: { name: string; password: string; next?: string } }>("/login", async (req, reply) => {
  const name = req.body.name?.trim();
  const password = req.body.password ?? "";
  const next = safeNext(req.body.next, "/me");

  let user: User;
  try {
    user = loginUser(name ?? "", password);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return reply.type("text/html").send(loginPage({ createError: err.message, next, prefill: { name } }));
    }
    throw err;
  }
  record(req, user.id, "login", null, `"${user.name}" logged in`);
  reply.setCookie(SESSION_COOKIE, user.token, sessionCookieOpts()).redirect(next, 303);
});

app.post("/logout", async (req, reply) => {
  const user = currentUser(req);
  if (user) {
    logoutUser(user.id);
    record(req, user.id, "logout", null, `"${user.name}" logged out`);
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" }).redirect("/", 303);
});

app.get("/me", async (req, reply) => {
  const user = currentUser(req);
  if (!user) return reply.redirect(`/login?next=${encodeURIComponent("/me")}`, 303);
  reply.type("text/html").send(mePage(user, membershipsForUser(user.id)));
});

app.post("/me/avatar", async (req, reply) => {
  const user = currentUser(req);
  if (!user) return reply.redirect(`/login?next=${encodeURIComponent("/me")}`, 303);

  try {
    const data = await req.file();
    if (!data) throw new UnsupportedAvatarTypeError("no file was uploaded");
    const buffer = await data.toBuffer();
    if (data.file.truncated) throw new AvatarTooLargeError(`avatars must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
    validateAvatarUpload(data.mimetype, buffer.length);
    setUserAvatar(user.id, buffer, data.mimetype);
  } catch (err) {
    if (err instanceof AvatarTooLargeError || err instanceof UnsupportedAvatarTypeError) {
      return reply.type("text/html").send(mePage(user, membershipsForUser(user.id), err.message));
    }
    throw err;
  }
  reply.redirect("/me", 303);
});

app.get<{ Params: { id: string } }>("/users/:id/avatar", async (req, reply) => {
  // A user's photo is public (shown in any group they're in, to anyone who
  // can see that group) the same way a group's photo already is.
  const found = getUserById(Number(req.params.id));
  if (!found) return reply.code(404).send("no such user");
  sendAvatar(req, reply, found, found.name);
});

app.post("/groups", async (req, reply) => {
  const user = currentUser(req);
  if (!user) return reply.redirect(`/signup?next=${encodeURIComponent("/new")}`, 303);

  // A field can repeat (every checked "tagIds" checkbox arrives as its own
  // part under the same name), so every text field is collected as an array
  // and single-value fields just read [0].
  const fields: Record<string, string[]> = {};
  let avatarBuffer: Buffer | undefined;
  let avatarMime: string | undefined;
  let avatarTruncated = false;

  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "avatar") {
        const buffer = await part.toBuffer();
        // An unselected <input type="file"> still arrives as an empty file
        // part in most browsers, not as a missing field --- only treat it
        // as "a photo was offered" once it actually has bytes.
        if (buffer.length > 0) {
          avatarBuffer = buffer;
          avatarMime = part.mimetype;
          avatarTruncated = part.file.truncated;
        }
      }
    } else {
      (fields[part.fieldname] ??= []).push(part.value as string);
    }
  }

  const name = fields.name?.[0]?.trim();
  const bio = fields.bio?.[0]?.trim();
  const customTagsRaw = fields.customTags?.[0] ?? "";
  const customNames = customTagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // Only ids that actually resolve to a real tag count --- a crafted request
  // naming a made-up id is dropped silently rather than creating a dangling
  // group_tags row.
  const tagIds = (fields.tagIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && tagById(id) !== undefined);
  const prefill = { name: fields.name?.[0], bio: fields.bio?.[0], tagIds, customTags: customTagsRaw };
  const fail = (createError: string) => reply.type("text/html").send(newGroupPage(user, { createError, prefill }));

  if (!name) return fail("a group name is required");
  if (!bio) return fail("a short bio for the group is required");
  if (tagIds.length === 0 && customNames.length === 0) {
    return fail("at least one game tag is required --- pick one or add your own");
  }
  if (avatarBuffer) {
    if (avatarTruncated) return fail(`the photo must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
    try {
      validateAvatarUpload(avatarMime!, avatarBuffer.length);
    } catch (err) {
      if (err instanceof AvatarTooLargeError || err instanceof UnsupportedAvatarTypeError) return fail(err.message);
      throw err;
    }
  }

  const group = createGroup(name, bio);
  setGroupTags(group.id, tagIds, customNames);
  if (avatarBuffer) setGroupAvatar(group.id, avatarBuffer, avatarMime!);
  joinGroup(user.id, group.id, "owner");
  record(req, user.id, "group.create", group.id, `"${user.name}" created group "${group.name}" (${group.code})`);
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
  reply.type("text/html").send(renderGroupPage(group, currentUser(req)));
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

app.post<{ Params: { code: string } }>("/g/:code/join", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const user = currentUser(req);
  if (!user) return reply.redirect(`/login?next=${encodeURIComponent(`/g/${group.code}`)}`, 303);
  joinGroup(user.id, group.id, "member");
  record(req, user.id, "group.join", group.id, `"${user.name}" joined group "${group.name}" (${group.code})`);
  // This used to broadcast from the old per-group /register route; joining
  // (not signing up, which has no group context at all) is the new "someone
  // became pickable in the winner/loser dropdowns" moment.
  broadcast(group.code, { type: "member", html: memberOptionsFragment(membersForGroup(group.id)) });
  reply.redirect(`/g/${group.code}`, 303);
});

/** Reads a possibly-repeated form field (formbody parses several same-named
 * parts into an array automatically; a single part stays a bare string) as a
 * deduplicated set of valid integer ids --- the same pattern the group-tags
 * form already uses for `tagIds`. */
function idSet(raw: string | string[] | undefined): Set<number> {
  const values = raw === undefined ? [] : ([] as string[]).concat(raw);
  return new Set(
    values.map((v) => Number(v)).filter((id) => Number.isInteger(id)),
  );
}

app.post<{ Params: { code: string }; Body: { game: string; winner: string | string[]; loser: string | string[] } }>(
  "/g/:code/results",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");

    const user = currentUser(req);
    const membership = user ? membershipFor(user.id, group.id) : undefined;
    if (!user || !membership) {
      // Not a member of this group (or not signed in at all) --- send them
      // to join rather than silently dropping the result.
      return reply.type("text/html").send(renderGroupPage(group, user));
    }

    const game = req.body.game?.trim();
    const winnerIds = idSet(req.body.winner);
    const loserIds = idSet(req.body.loser);
    if (!game || winnerIds.size === 0 || loserIds.size === 0) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, user, { resultError: "game, at least one winner and at least one loser are required" }));
    }
    // A side can be a team (any number of people), but no one can be on
    // both sides of the same result --- the original single-id check
    // generalized to a set-intersection one.
    const overlap = [...winnerIds].some((id) => loserIds.has(id));
    if (overlap) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, user, { resultError: "winner and loser can't be the same player" }));
    }
    // Everyone named has to already be a member of this group --- a result
    // can't be logged against someone who was never there.
    const allMembers = [...winnerIds, ...loserIds].every((id) => memberInGroup(group.id, id));
    if (!allMembers) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, user, { resultError: "winner and loser must both be members of this group" }));
    }

    const result = addResult(group.id, game, [...winnerIds], [...loserIds]);
    record(
      req,
      user.id,
      "result.create",
      group.id,
      `"${user.name}" logged ${game}: ${result.winner} beat ${result.loser} in "${group.name}"`,
    );
    broadcast(group.code, { type: "result", html: resultsListFragment(group, resultsForGroup(group.id)) });
    reply.redirect(`/g/${group.code}`, 303);
  },
);

app.post<{ Params: { code: string }; Body: { opponentCode: string; game: string; scoreUs: string; scoreThem: string } }>(
  "/g/:code/matches",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");

    const user = currentUser(req);
    const membership = user ? membershipFor(user.id, group.id) : undefined;
    if (!user || !membership) return reply.type("text/html").send(renderGroupPage(group, user));

    const opponentCode = req.body.opponentCode?.trim().toUpperCase();
    const game = req.body.game?.trim();
    const scoreUs = Number(req.body.scoreUs);
    const scoreThem = Number(req.body.scoreThem);
    const opponent = opponentCode ? getGroupByCode(opponentCode) : undefined;

    if (!opponent || opponent.id === group.id) {
      return reply.type("text/html").send(
        renderGroupPage(group, user, { matchError: "enter the code of a different, existing group" }),
      );
    }
    if (!game || !Number.isInteger(scoreUs) || scoreUs < 0 || !Number.isInteger(scoreThem) || scoreThem < 0) {
      return reply.type("text/html").send(
        renderGroupPage(group, user, { matchError: "game and both (non-negative, whole-number) scores are required" }),
      );
    }

    addGroupMatch(group.id, opponent.id, game, scoreUs, scoreThem, user.id);
    record(
      req,
      user.id,
      "group-match.create",
      group.id,
      `"${user.name}" logged a ${game} match: "${group.name}" ${scoreUs}-${scoreThem} "${opponent.name}"`,
    );
    broadcast(group.code, { type: "group-match", html: groupMatchesFragment(group, groupMatchesForGroup(group.id)) });
    broadcast(opponent.code, {
      type: "group-match",
      html: groupMatchesFragment(opponent, groupMatchesForGroup(opponent.id)),
    });
    reply.redirect(`/g/${group.code}`, 303);
  },
);

function requireOwner(group: Group, user: User | undefined): string | undefined {
  if (!user) return "you need to be signed in";
  const membership = membershipFor(user.id, group.id);
  if (!membership) return "you're not a member of this group";
  if (membership.role !== "owner") return "only the group's owner can do that";
  return undefined;
}

app.post<{ Params: { code: string }; Body: { bio: string; tagIds?: string | string[]; customTags?: string } }>(
  "/g/:code/profile",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");
    const user = currentUser(req);
    const deniedReason = requireOwner(group, user);
    if (deniedReason) return reply.code(403).send(deniedReason);

    const bio = req.body.bio?.trim();
    const customNames = (req.body.customTags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const rawTagIds = req.body.tagIds === undefined ? [] : ([] as string[]).concat(req.body.tagIds);
    const tagIds = rawTagIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && tagById(id) !== undefined);

    if (!bio) {
      return reply.type("text/html").send(renderGroupPage(group, user, { profileError: "a bio is required" }));
    }
    if (tagIds.length === 0 && customNames.length === 0) {
      return reply
        .type("text/html")
        .send(renderGroupPage(group, user, { profileError: "at least one game tag is required" }));
    }

    updateGroupProfile(group.id, bio, tagIds, customNames);
    record(req, user!.id, "group.profile-update", group.id, `"${user!.name}" updated "${group.name}"'s profile`);
    reply.redirect(`/g/${group.code}`, 303);
  },
);

app.get<{ Params: { code: string } }>("/g/:code/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  sendAvatar(req, reply, group, group.name);
});

app.post<{ Params: { code: string } }>("/g/:code/avatar", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const user = currentUser(req);
  const deniedReason = requireOwner(group, user);
  if (deniedReason) return reply.code(403).send(deniedReason);

  try {
    const data = await req.file();
    if (!data) throw new UnsupportedAvatarTypeError("no file was uploaded");
    const buffer = await data.toBuffer();
    if (data.file.truncated) throw new AvatarTooLargeError(`avatars must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
    validateAvatarUpload(data.mimetype, buffer.length);
    setGroupAvatar(group.id, buffer, data.mimetype);
  } catch (err) {
    if (err instanceof AvatarTooLargeError || err instanceof UnsupportedAvatarTypeError) {
      return reply.type("text/html").send(renderGroupPage(group, user, { avatarError: err.message }));
    }
    throw err;
  }

  record(req, user!.id, "group.avatar-update", group.id, `"${user!.name}" updated "${group.name}"'s photo`);
  reply.redirect(`/g/${group.code}`, 303);
});

app.post<{ Params: { code: string; userId: string } }>("/g/:code/members/:userId/remove", async (req, reply) => {
  const group = getGroupByCode(req.params.code.toUpperCase());
  if (!group) return reply.code(404).send("no group with that code");
  const user = currentUser(req);
  const deniedReason = requireOwner(group, user);
  if (deniedReason) return reply.code(403).send(deniedReason);

  const targetId = Number(req.params.userId);
  const target: MemberWithRole | undefined = memberInGroup(group.id, targetId);
  // No ownership transfer feature --- removing the owner (including
  // yourself) would leave the group with nobody able to manage it.
  if (target && target.role !== "owner") {
    removeMembership(targetId, group.id);
    record(
      req,
      user!.id,
      "member.remove",
      group.id,
      `"${user!.name}" removed "${target.name}" from "${group.name}"`,
    );
  }
  reply.redirect(`/g/${group.code}`, 303);
});

app.get<{ Params: { id: string } }>("/u/:id", async (req, reply) => {
  const viewer = currentUser(req);
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return reply.code(404).send("no such user");
  if (viewer && viewer.id === targetId) return reply.redirect("/me", 303);

  const owner = getUserById(targetId);
  if (!owner) return reply.code(404).send("no such user");

  // Visibility rule (decisions/0003-team-results-and-profile-visibility.md):
  // a viewer only sees history with `owner` through a group they, the
  // viewer, currently belong to --- the viewer's own membership is the
  // boundary, not the target's, and it's checked here on the server, not
  // left to what the page happens to render.
  const viewerGroupIds = viewer ? new Set(membershipsForUser(viewer.id).map((m) => m.group.id)) : new Set<number>();
  const sharedGroups = membershipsForUser(owner.id)
    .map((m) => m.group)
    .filter((g) => viewerGroupIds.has(g.id));

  const headToHead = viewer ? headToHeadResults(viewer.id, owner.id) : [];
  const teamedUp = viewer ? teamedUpResults(viewer.id, owner.id) : [];

  reply.type("text/html").send(profilePage(viewer, owner, sharedGroups, headToHead, teamedUp));
});

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
