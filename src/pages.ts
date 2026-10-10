import type { Group, GroupMatch, Member, Result } from "./db.ts";
import { getGroupById } from "./db.ts";
import { baseStyles, siteHeader } from "./styles.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const layout = (title: string, body: string, script?: string) => `<!doctype html>
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
    ${script ? `<script>${script}</script>` : ""}
  </body>
</html>`;

function memberAvatarUrl(code: string, memberId: number): string {
  return `/g/${encodeURIComponent(code)}/members/${memberId}/avatar`;
}

function groupAvatarUrl(code: string): string {
  return `/g/${encodeURIComponent(code)}/avatar`;
}

function avatarImg(src: string, alt: string, size: "sm" | "md" | "lg" = "sm"): string {
  return `<img class="avatar avatar-${size}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${
    size === "lg" ? 56 : size === "md" ? 40 : 28
  }" height="${size === "lg" ? 56 : size === "md" ? 40 : 28}" />`;
}

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

/** The inner markup of `#results-list` --- also what a live `result` event re-sends. */
export function resultsListFragment(group: Group, results: Result[]): string {
  if (results.length === 0) {
    return `<p class="empty">No results yet. Be the first to log one.</p>`;
  }
  const rows = results
    .map((r) => {
      const winnerAvatar = r.winner_member_id
        ? avatarImg(memberAvatarUrl(group.code, r.winner_member_id), r.winner)
        : "";
      return `<li class="result-row">
        <div class="matchup">
          <span class="game">${escapeHtml(r.game)}</span>
          ${winnerAvatar}
          <span class="winner">${escapeHtml(r.winner)}</span>
          <span>beat</span>
          <span class="loser">${escapeHtml(r.loser)}</span>
        </div>
        <span class="when">${new Date(r.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
      </li>`;
    })
    .join("\n");
  return `<ul class="results-list">${rows}</ul>`;
}

/** The inner markup of `#group-matches-list` --- also what a live `group-match` event re-sends. */
export function groupMatchesFragment(group: Group, matches: GroupMatch[]): string {
  if (matches.length === 0) {
    return `<p class="empty">No matches against other groups yet.</p>`;
  }
  const rows = matches
    .map((m) => {
      const weAreA = m.group_a_id === group.id;
      const opponentId = weAreA ? m.group_b_id : m.group_a_id;
      const ourScore = weAreA ? m.score_a : m.score_b;
      const theirScore = weAreA ? m.score_b : m.score_a;
      const opponent = getGroupById(opponentId);
      const opponentName = opponent?.name ?? "a group that's since gone";
      const outcome = ourScore === theirScore ? "drew with" : ourScore > theirScore ? "beat" : "lost to";
      return `<li class="group-match-row">
        <div class="opponent">
          ${opponent ? avatarImg(groupAvatarUrl(opponent.code), opponentName) : ""}
          <span class="game">${escapeHtml(m.game)}</span>
          <span>${outcome}</span>
          ${opponent ? `<a href="/g/${encodeURIComponent(opponent.code)}">${escapeHtml(opponentName)}</a>` : escapeHtml(opponentName)}
        </div>
        <span class="score">${ourScore}–${theirScore}</span>
      </li>`;
    })
    .join("\n");
  return `<ul class="results-list">${rows}</ul>`;
}

/** The inner `<option>`s of the winner/loser selects --- also what a live `member` event re-sends. */
export function memberOptionsFragment(members: Member[]): string {
  const options = members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("\n");
  return `<option value="" disabled selected>choose a player</option>${options}`;
}

const liveScript = (code: string) => `
(function () {
  var source = new EventSource(${JSON.stringify(`/g/${encodeURIComponent(code)}/events`)});
  function swapOptions(selectId, html) {
    var el = document.getElementById(selectId);
    if (!el) return;
    var previous = el.value;
    el.innerHTML = html;
    var stillThere = Array.prototype.some.call(el.options, function (o) { return o.value === previous; });
    if (stillThere) el.value = previous;
  }
  function swapInner(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  source.addEventListener("result", function (e) { swapInner("results-list", e.data); });
  source.addEventListener("group-match", function (e) { swapInner("group-matches-list", e.data); });
  source.addEventListener("member", function (e) {
    swapOptions("winner-select", e.data);
    swapOptions("loser-select", e.data);
  });
})();
`;

export function groupPage(
  group: Group,
  results: Result[],
  members: Member[],
  groupMatches: GroupMatch[],
  member: Member | undefined,
  authError?: string,
  resultError?: string,
  matchError?: string,
  avatarError?: string,
): string {
  const code = escapeHtml(group.code);
  const memberOptions = memberOptionsFragment(members);

  const actionCard = member
    ? `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:0.5rem">
          <h2 style="margin-top:0">Log a result</h2>
          <form method="post" action="/g/${code}/logout" style="margin:0">
            <button type="submit" style="background:transparent; color:var(--muted); padding:0.25rem 0.5rem; font-weight:500">Log out</button>
          </form>
        </div>
        <div class="profile-header">
          ${avatarImg(memberAvatarUrl(group.code, member.id), member.name, "md")}
          <p class="lede" style="margin:0">Signed in as <strong>${escapeHtml(member.name)}</strong></p>
        </div>
        <form class="avatar-upload" method="post" action="/g/${code}/members/${member.id}/avatar" enctype="multipart/form-data">
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit">Update my photo</button>
        </form>
        ${avatarError ? `<p class="error-text">${escapeHtml(avatarError)}</p>` : ""}
        ${resultError ? `<p class="error-text">${escapeHtml(resultError)}</p>` : ""}
        <form method="post" action="/g/${code}/results">
          <label for="game">Game</label>
          <input id="game" name="game" required placeholder="e.g. FIFA, NBA 2K, basketball" />
          <label for="winner-select">Winner</label>
          <select id="winner-select" name="winner" required>${memberOptions}</select>
          <label for="loser-select">Loser</label>
          <select id="loser-select" name="loser" required>${memberOptions}</select>
          <button type="submit">Log result</button>
        </form>
      </div>`
    : `<div class="card">
        <h2 style="margin-top:0">Sign in to log results</h2>
        ${authError ? `<p class="error-text">${escapeHtml(authError)}</p>` : ""}
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
            <p class="lede" style="margin-bottom:0; font-size:0.8rem">You'll get a generated avatar right away — upload a photo any time after signing in.</p>
          </div>
        </div>
      </div>`;

  const groupMatchCard = member
    ? `<div class="card">
        <h2 style="margin-top:0">Log a match against another group</h2>
        ${matchError ? `<p class="error-text">${escapeHtml(matchError)}</p>` : ""}
        <form method="post" action="/g/${code}/matches">
          <label for="opponent-code">Opponent group code</label>
          <input id="opponent-code" name="opponentCode" required placeholder="e.g. XYZ789" style="text-transform: uppercase" />
          <label for="match-game">Game</label>
          <input id="match-game" name="game" required placeholder="e.g. Soccer" />
          <div class="cards-row">
            <div>
              <label for="score-us">${escapeHtml(group.name)}'s score</label>
              <input id="score-us" name="scoreUs" type="number" min="0" required />
            </div>
            <div>
              <label for="score-them">Their score</label>
              <input id="score-them" name="scoreThem" type="number" min="0" required />
            </div>
          </div>
          <button type="submit">Log match</button>
        </form>
      </div>`
    : "";

  return layout(
    group.name,
    `<div class="profile-header">
      ${avatarImg(groupAvatarUrl(group.code), group.name, "lg")}
      <div>
        <h1 style="margin-bottom:0.1rem">${escapeHtml(group.name)}</h1>
        <p class="lede" style="margin-top:0">Share this code so friends can find this group: <span class="code-chip">${code}</span></p>
      </div>
    </div>
    ${
      member
        ? `<form class="avatar-upload" method="post" action="/g/${code}/avatar" enctype="multipart/form-data">
            <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
            <button type="submit">Update group photo</button>
          </form>`
        : ""
    }
    ${actionCard}
    <h2>Results</h2>
    <div id="results-list">${resultsListFragment(group, results)}</div>
    ${groupMatchCard}
    <h2>Group matches</h2>
    <div id="group-matches-list">${groupMatchesFragment(group, groupMatches)}</div>`,
    liveScript(group.code),
  );
}
