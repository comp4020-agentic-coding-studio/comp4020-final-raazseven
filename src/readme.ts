import { marked } from "marked";
import { readFileSync } from "node:fs";

export function renderReadme(): string {
  const md = readFileSync("README.md", "utf8");
  const body = marked.parse(md, { async: false });
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>README</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
      a { color: #1a5fb4; }
    </style>
  </head>
  <body>
    ${body}
    <p><a href="/">&larr; back to the app</a></p>
  </body>
</html>`;
}
