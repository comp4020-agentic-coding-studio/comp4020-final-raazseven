import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { addResult, createGroup, getGroupByCode, resultsForGroup } from "./db.ts";
import { groupPage, homePage } from "./pages.ts";
import { renderReadme } from "./readme.ts";

const app = Fastify({ logger: true });
await app.register(formbody);

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
  reply.type("text/html").send(groupPage(group, resultsForGroup(group.id)));
});

app.post<{ Params: { code: string }; Body: { game: string; winner: string; loser: string } }>(
  "/g/:code/results",
  async (req, reply) => {
    const group = getGroupByCode(req.params.code.toUpperCase());
    if (!group) return reply.code(404).send("no group with that code");
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
