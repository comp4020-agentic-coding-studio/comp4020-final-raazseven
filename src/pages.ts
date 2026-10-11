import type { Group, GroupMatch, Member, Result } from "./db.ts";
import { getGroupById, parseTags } from "./db.ts";
import { baseStyles, iconChip, logoMark, siteHeader } from "./styles.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The same mark as the header/hero logo, inlined as a favicon so the browser
// tab carries it too --- one SVG, two uses, instead of a separate image asset.
const faviconHref = `data:image/svg+xml,${encodeURIComponent(logoMark(36))}`;

/** `showNav` puts Log in / Sign up links in the header --- see siteHeader(). */
const layout = (title: string, body: string, script?: string, showNav = false) => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/svg+xml" href="${faviconHref}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
    <style>${baseStyles}</style>
  </head>
  <body>
    ${siteHeader(showNav)}
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

export interface HomePageOptions {
  createError?: string;
  /** What to put back in the form after a failed submit --- everything except
   * the file, which HTML has no way to hand back to a form. */
  prefill?: { name?: string; bio?: string; tags?: string };
}

export function homePage(opts: HomePageOptions = {}): string {
  const prefill = opts.prefill ?? {};
  return layout(
    "Score's in Check",
    `<section class="hero">
      <div class="hero-grid">
        <div class="hero-content">
          <div class="logo-mark hero-animate">${logoMark(56)}</div>
          <h1 class="hero-animate">Stop arguing about who's actually winning.</h1>
          <p class="lede hero-animate">
            Score's in Check is the record your friend group actually keeps up
            to date: real accounts, every result logged as it happens, visible
            to everyone the second it's in.
          </p>
          <div class="hero-actions hero-animate">
            <a class="btn-solid" href="#signup">Sign up &mdash; start your group</a>
            <a class="btn-ghost" href="#login">Log in with a code</a>
          </div>
        </div>
        <div class="hero-visual hero-animate">
          <div class="mockup-window">
            <div class="mockup-chrome">
              <span class="dot dot-red"></span><span class="dot dot-amber"></span><span class="dot dot-green"></span>
              <span class="mockup-url">scoresincheck.app/g/ABC123</span>
            </div>
            <div class="mockup-body">
              <div class="mockup-live"><span class="live-dot"></span> Live</div>
              <div class="mockup-row">
                <span class="mockup-avatar" style="background:#4f46e5">P</span>
                <span><strong>Priya</strong> beat Marcus</span>
                <span class="mockup-game">FIFA</span>
              </div>
              <div class="mockup-row">
                <span class="mockup-avatar" style="background:#0d9488">T</span>
                <span><strong>Tala</strong> beat Winston</span>
                <span class="mockup-game">NBA 2K</span>
              </div>
              <div class="mockup-row">
                <span class="mockup-avatar" style="background:#db2777">M</span>
                <span><strong>Marcus</strong> beat Tala</span>
                <span class="mockup-game">FIFA</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="steps">
      <div class="step">
        ${iconChip("signin", "indigo")}
        <h3>Start a group, or join one</h3>
        <p>Create your own group and get a share code, or enter a friend's code to land on theirs.</p>
      </div>
      <div class="step">
        ${iconChip("account", "teal")}
        <h3>Sign up, then log results</h3>
        <p>Everyone gets their own name and password inside the group --- no logging a result as someone else.</p>
      </div>
      <div class="step">
        ${iconChip("bolt", "amber")}
        <h3>Watch it settle live</h3>
        <p>Every result, and every group-vs-group match, shows up for everyone open to the page within a second.</p>
      </div>
    </div>

    <div class="section-heading">
      <h2>Built for one friend group, not a leaderboard for strangers</h2>
      <p>Everything here is in the app today, not a roadmap.</p>
    </div>
    <div class="features">
      <div class="feature">
        ${iconChip("account", "indigo")}
        <h3>Real members, not typed names</h3>
        <p>A result can only be logged against someone who actually signed up to the group.</p>
      </div>
      <div class="feature">
        ${iconChip("bolt", "amber")}
        <h3>Live, not eventually</h3>
        <p>No refresh button. A result logged on one phone appears on everyone else's open page right away.</p>
      </div>
      <div class="feature">
        ${iconChip("vs", "pink")}
        <h3>Group vs. group</h3>
        <p>Played another friend group for real? Log the final score once, and it's on both groups' pages.</p>
      </div>
      <div class="feature">
        ${iconChip("camera", "teal")}
        <h3>A face, not just a name</h3>
        <p>Every member and group gets a profile photo &mdash; generated instantly, or upload your own.</p>
      </div>
    </div>

    <div class="section-heading" id="get-started">
      <h2>Get started</h2>
      <p>Two ways in, depending on whether your group exists yet.</p>
    </div>
    <div class="cards-row">
      <div class="card action-section" id="signup">
        <h2 style="margin-top:0">Sign up &mdash; start a new group</h2>
        <p class="lede" style="font-size:0.85rem">A name, a bio, at least one game tag, and a photo --- your group's profile, before anyone's logged a single result. You'll create your own personal account on the next page.</p>
        ${opts.createError ? `<p class="error-text">${escapeHtml(opts.createError)}</p>` : ""}
        <form method="post" action="/groups" enctype="multipart/form-data">
          <label for="name">Group name</label>
          <input id="name" name="name" required placeholder="e.g. The Office FIFA League" value="${escapeHtml(prefill.name ?? "")}" />
          <label for="bio">Bio</label>
          <textarea id="bio" name="bio" required rows="2" placeholder="Who you are and why you keep score">${escapeHtml(prefill.bio ?? "")}</textarea>
          <label for="tags">Game tags</label>
          <input id="tags" name="tags" required placeholder="e.g. FIFA, Trivia, Board games" value="${escapeHtml(prefill.tags ?? "")}" />
          <label for="group-photo">Group photo</label>
          <input id="group-photo" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit">Create group</button>
        </form>
      </div>
      <div class="card action-section" id="login">
        <h2 style="margin-top:0">Log in &mdash; have a code?</h2>
        <p class="lede" style="font-size:0.85rem">Enter your group's code, then log in (or sign up) once you're there.</p>
        <form method="get" action="/g">
          <label for="code">Group code</label>
          <input id="code" name="code" required placeholder="e.g. ABC123" style="text-transform: uppercase" />
          <button type="submit">Go to group</button>
        </form>
      </div>
    </div>`,
    undefined,
    true,
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
      <div class="profile-header-text">
        <h1 style="margin-bottom:0.1rem">${escapeHtml(group.name)}</h1>
        <p class="lede" style="margin-top:0">Share this code so friends can find this group: <span class="code-chip">${code}</span></p>
      </div>
    </div>
    ${group.bio ? `<p class="group-bio">${escapeHtml(group.bio)}</p>` : ""}
    ${
      parseTags(group.tags).length > 0
        ? `<div class="group-tags">${parseTags(group.tags)
            .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
            .join("")}</div>`
        : ""
    }
    ${
      member
        ? `<form class="avatar-upload" method="post" action="/g/${code}/avatar" enctype="multipart/form-data">
            <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
            <button type="submit">Update group photo</button>
          </form>`
        : ""
    }
    <div class="group-layout">
      <div class="group-layout-actions">
        ${actionCard}
        ${groupMatchCard}
      </div>
      <div class="group-layout-feed">
        <h2 class="h2-live"><span class="live-dot"></span>Results</h2>
        <div id="results-list">${resultsListFragment(group, results)}</div>
        <h2 class="h2-live"><span class="live-dot"></span>Group matches</h2>
        <div id="group-matches-list">${groupMatchesFragment(group, groupMatches)}</div>
      </div>
    </div>`,
    liveScript(group.code),
  );
}
