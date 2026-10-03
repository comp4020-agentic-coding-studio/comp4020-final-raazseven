# syntax = docker/dockerfile:1

# Node + TypeScript (run directly, no build step --- Node 24 strips types
# natively) + Fastify, with SQLite (node:sqlite, built in, no native deps to
# compile) writing to the Fly volume at /data. Serves the app at / and the
# README at /readme/ (spec/README.md says what's checked).

FROM node:24-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate \
    && pnpm install --prod --frozen-lockfile

COPY src ./src
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.ts"]
