import type { Group, Member, Result } from "./db.ts";
import { baseStyles, siteHeader } from "./styles.ts";

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
    <style>${baseStyles}</style>
  </head>
  <body>
    ${siteHeader}
    <main>
      ${body}
    </main>
    <footer class="site"><a href="/readme/">what good means here</a></footer>
  </body>
</html>`;

export function homePage(): string {
  return layout(
    "Score's in Check",
    `<h1>Score's in Check</h1>
    <p class="lede">Start a group, log who beat who, keep the bragging rights honest.</p>
    <div class="cards-row">
      <div class="card">
        <h2 style="margin-top:0">New group</h2>
        <form method="post" action="/groups">
          <label for="name">Group name</label>
          <input id="name" name="name" required placeholder="e.g. The Office FIFA League" />
          <button type="submit">Create group</button>
        </form>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Have a code?</h2>
        <form method="get" action="/g">
          <label for="code">Group code</label>
          <input id="code" name="code" required placeholder="e.g. ABC123" style="text-transform: uppercase" />
          <button type="submit">Go to group</button>
        </form>
      </div>
    </div>`,
  );
}

export function groupPage(
  group: Group,
  results: Result[],
  member: Member | undefined,
  authError?: string,
): string {
  const rows = results
    .map(
      (r) => `<li class="result-row">
        <div class="matchup">
          <span class="game">${escapeHtml(r.game)}</span>
          <span class="winner">${escapeHtml(r.winner)}</span>
          <span>beat</span>
          <span class="loser">${escapeHtml(r.loser)}</span>
        </div>
        <span class="when">${new Date(r.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
      </li>`,
    )
    .join("\n");

  const code = escapeHtml(group.code);

  const actionCard = member
    ? `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:0.5rem">
          <h2 style="margin-top:0">Log a result</h2>
          <form method="post" action="/g/${code}/logout" style="margin:0">
            <button type="submit" style="background:transparent; color:var(--muted); padding:0.25rem 0.5rem; font-weight:500">Log out</button>
          </form>
        </div>
        <p class="lede" style="margin-top:-0.25rem">Signed in as <strong>${escapeHtml(member.name)}</strong></p>
        <form method="post" action="/g/${code}/results">
          <label for="game">Game</label>
          <input id="game" name="game" required placeholder="e.g. FIFA, NBA 2K, basketball" />
          <label for="winner">Winner</label>
          <input id="winner" name="winner" required placeholder="who won" />
          <label for="loser">Loser</label>
          <input id="loser" name="loser" required placeholder="who lost" />
          <button type="submit">Log result</button>
        </form>
      </div>`
    : `<div class="card">
        <h2 style="margin-top:0">Sign in to log results</h2>
        ${authError ? `<p style="color:#b91c1c">${escapeHtml(authError)}</p>` : ""}
        <div class="cards-row">
          <div>
            <h3 style="font-size:0.95rem">Log in</h3>
            <form method="post" action="/g/${code}/login">
              <label for="login-name">Name</label>
              <input id="login-name" name="name" required placeholder="e.g. Raj" />
              <label for="login-password">Password</label>
              <input id="login-password" name="password" type="password" required />
              <button type="submit">Log in</button>
            </form>
          </div>
          <div>
            <h3 style="font-size:0.95rem">Create account</h3>
            <form method="post" action="/g/${code}/register">
              <label for="register-name">Name</label>
              <input id="register-name" name="name" required placeholder="e.g. Raj" />
              <label for="register-password">Password</label>
              <input id="register-password" name="password" type="password" required minlength="6" />
              <button type="submit">Create account</button>
            </form>
          </div>
        </div>
      </div>`;

  return layout(
    group.name,
    `<h1>${escapeHtml(group.name)}</h1>
    <p class="lede">Share this code so friends can find this group: <span class="code-chip">${code}</span></p>
    ${actionCard}
    <h2>Results</h2>
    ${
      results.length === 0
        ? `<p class="empty">No results yet. Be the first to log one.</p>`
        : `<ul class="results-list">${rows}</ul>`
    }`,
  );
}
