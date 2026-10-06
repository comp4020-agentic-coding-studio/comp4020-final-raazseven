import Fastify from "fastify";
import formbody from "@fastify/formbody";
import cookie from "@fastify/cookie";
import {
  addResult,
  createGroup,
  getGroupByCode,
  InvalidCredentialsError,
  loginMember,
  logoutMember,
  memberByToken,
  NameTakenError,
  registerMember,
  resultsForGroup,
  type Group,
} from "./db.ts";
import { groupPage, homePage } from "./pages.ts";
import { renderReadme } from "./readme.ts";

const app = Fastify({ logger: true });
await app.register(formbody);
await app.register(cookie);

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
  reply.type("text/html").send(groupPage(group, resultsForGroup(group.id), member));
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
        .send(
          groupPage(group, resultsForGroup(group.id), undefined, "a name and a password of at least 6 characters are required"),
        );
    }

    let member;
    try {
      member = registerMember(group.id, name, password);
    } catch (err) {
      if (err instanceof NameTakenError) {
        return reply.type("text/html").send(groupPage(group, resultsForGroup(group.id), undefined, err.message));
      }
      throw err;
    }

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
        return reply.type("text/html").send(groupPage(group, resultsForGroup(group.id), undefined, err.message));
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
      return reply.type("text/html").send(groupPage(group, resultsForGroup(group.id), undefined));
    }

    const { game, winner, loser } = req.body;
    if (!game?.trim() || !winner?.trim() || !loser?.trim()) {
      return reply.code(400).send("game, winner and loser are all required");
    }
    addResult(group.id, game.trim(), winner.trim(), loser.trim());
    reply.redirect(`/g/${group.code}`, 303);
  },
);

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
