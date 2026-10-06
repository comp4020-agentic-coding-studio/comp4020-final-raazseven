import { marked } from "marked";
import { readFileSync } from "node:fs";
import { baseStyles, siteHeader } from "./styles.ts";

export function renderReadme(): string {
  const md = readFileSync("README.md", "utf8");
  const body = marked.parse(md, { async: false });
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>README &middot; Score's in Check</title>
    <style>
      ${baseStyles}
      main h1:first-child { margin-top: 0; }
      main ul { padding-left: 1.25rem; }
      main li { margin: 0.35rem 0; }
      main a { color: var(--accent); }
    </style>
  </head>
  <body>
    ${siteHeader}
    <main>
      <div class="card">
        ${body}
      </div>
    </main>
    <footer class="site"><a href="/">&larr; back to the app</a></footer>
  </body>
</html>`;
}
