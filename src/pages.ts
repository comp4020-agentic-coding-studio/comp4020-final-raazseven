import type { Group, Result } from "./db.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
      form { display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0; }
      input, button { font: inherit; padding: 0.5rem; }
      button { cursor: pointer; }
      table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
      td, th { text-align: left; padding: 0.25rem 0.5rem; border-bottom: 1px solid #ddd; }
      .code { font-family: monospace; font-size: 1.25rem; letter-spacing: 0.1em; }
      footer { margin-top: 2rem; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    ${body}
    <footer><a href="/readme/">what good means here</a></footer>
  </body>
</html>`;

export function homePage(): string {
  return layout(
    "Score keeper",
    `<h1>Score keeper</h1>
    <p>Keep the record straight. Start a group, log who beat who.</p>
    <form method="post" action="/groups">
      <label for="name">Group name</label>
      <input id="name" name="name" required placeholder="e.g. The Office FIFA League" />
      <button type="submit">Create group</button>
    </form>
    <form method="get" action="/g">
      <label for="code">Have a code?</label>
      <input id="code" name="code" required placeholder="e.g. ABC123" style="text-transform: uppercase" />
      <button type="submit">Go to group</button>
    </form>`,
  );
}

export function groupPage(group: Group, results: Result[]): string {
  const rows = results
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.game)}</td>
        <td>${escapeHtml(r.winner)}</td>
        <td>${escapeHtml(r.loser)}</td>
        <td>${new Date(r.created_at).toLocaleString("en-AU")}</td>
      </tr>`,
    )
    .join("\n");

  return layout(
    group.name,
    `<h1>${escapeHtml(group.name)}</h1>
    <p>Share this code so friends can find this group: <span class="code">${escapeHtml(group.code)}</span></p>
    <form method="post" action="/g/${escapeHtml(group.code)}/results">
      <label for="game">Game</label>
      <input id="game" name="game" required placeholder="e.g. FIFA, NBA 2K, basketball" />
      <label for="winner">Winner</label>
      <input id="winner" name="winner" required placeholder="who won" />
      <label for="loser">Loser</label>
      <input id="loser" name="loser" required placeholder="who lost" />
      <button type="submit">Log result</button>
    </form>
    <h2>Results</h2>
    ${results.length === 0 ? "<p>No results yet. Be the first to log one.</p>" : `<table><thead><tr><th>Game</th><th>Winner</th><th>Loser</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>`}`,
  );
}
