import type { Group, GroupMatch, MemberWithRole, MembershipWithGroup, Result, Role, Tag, User } from "./db.ts";
import { getGroupById } from "./db.ts";
import { curatedTagsByCategory } from "./db.ts";
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

/** Every page shows who's signed in (or that nobody is) in the shared
 * header --- that's the actual fix for "it doesn't show I'm logged in": it
 * has to live here, not inside one card on one page. */
const layout = (title: string, body: string, script: string | undefined, user: User | undefined) => `<!doctype html>
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
    ${siteHeader(user ? { id: user.id, name: user.name } : undefined)}
    <main>
      ${body}
    </main>
    <footer class="site"><a href="/readme/">what good means here</a></footer>
    ${script ? `<script>${script}</script>` : ""}
  </body>
</html>`;

function userAvatarUrl(userId: number): string {
  return `/users/${userId}/avatar`;
}

function groupAvatarUrl(code: string): string {
  return `/g/${encodeURIComponent(code)}/avatar`;
}

function avatarImg(src: string, alt: string, size: "sm" | "md" | "lg" = "sm"): string {
  return `<img class="avatar avatar-${size}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${
    size === "lg" ? 56 : size === "md" ? 40 : 28
  }" height="${size === "lg" ? 56 : size === "md" ? 40 : 28}" />`;
}

// Toggles the file input alongside the generate/upload radio choice below
// it --- a progressive enhancement, not a dependency: with JS disabled both
// controls are simply visible together and the file input isn't required,
// so the generate-by-default path (an empty file part) still works fine.
const avatarChoiceScript = `
(function () {
  var radios = document.querySelectorAll('input[name="avatarChoice"]');
  var fileInput = document.getElementById("group-photo");
  if (!radios.length || !fileInput) return;
  function sync() {
    var checked = document.querySelector('input[name="avatarChoice"]:checked');
    var upload = checked && checked.value === "upload";
    fileInput.hidden = !upload;
    fileInput.required = !!upload;
    if (!upload) fileInput.value = "";
  }
  radios.forEach(function (r) { r.addEventListener("change", sync); });
  sync();
})();
`;

const CATEGORY_LABELS: Record<string, string> = {
  "video-game": "Video games",
  sport: "Real-world sports",
  "board-game": "Board & card games",
};

/** A fieldset of checkbox "chips" per curated category, plus one free-text
 * field for anything not on the list --- src/db.ts's findOrCreateTag() turns
 * that text into a real tag row (reused by name if it already exists)
 * rather than a second, parallel way of storing a tag. */
function tagPicker(selectedIds: number[], customTags: string): string {
  const byCategory = curatedTagsByCategory();
  const fieldsets = Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => {
      const options = (byCategory[category] ?? [])
        .map(
          (tag) => `<label class="tag-check">
            <input type="checkbox" name="tagIds" value="${tag.id}" ${selectedIds.includes(tag.id) ? "checked" : ""} />
            <span>${escapeHtml(tag.name)}</span>
          </label>`,
        )
        .join("");
      return `<fieldset class="tag-picker">
        <legend>${escapeHtml(label)}</legend>
        <div class="tag-options">${options}</div>
      </fieldset>`;
    })
    .join("");
  return `${fieldsets}
    <label for="custom-tags">Not listed? Add your own</label>
    <input id="custom-tags" name="customTags" placeholder="e.g. Ping pong, Bananagrams" value="${escapeHtml(customTags)}" />`;
}

/** Splits a group's current tags back into curated ids + custom names, the
 * shape the edit-profile form needs to prefill itself with --- otherwise
 * re-saving the form without retyping a custom tag would silently drop it
 * (setGroupTags replaces the full set, it doesn't merge). */
function splitGroupTags(tags: Tag[]): { tagIds: number[]; customTags: string } {
  const tagIds = tags.filter((t) => t.category !== "custom").map((t) => t.id);
  const customTags = tags
    .filter((t) => t.category === "custom")
    .map((t) => t.name)
    .join(", ");
  return { tagIds, customTags };
}

export function homePage(user?: User): string {
  return layout(
    "Score's in Check",
    `<section class="hero">
      <div class="hero-grid">
        <div class="hero-content">
          <div class="logo-mark hero-animate">${logoMark(56)}</div>
          <h1 class="hero-animate">Stop arguing about who's actually winning.</h1>
          <p class="lede hero-animate">
            Score's in Check is the record your friend group actually keeps up
            to date: one account, every group you're in, every result logged
            as it happens and visible to everyone the second it's in.
          </p>
          <div class="hero-actions hero-animate">
            ${
              user
                ? `<a class="btn-solid" href="/me">Go to your groups</a>`
                : `<a class="btn-solid" href="/signup">Sign up</a>
                   <a class="btn-ghost" href="#login">Log in with a code</a>`
            }
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
        <h3>One account, every group</h3>
        <p>Sign up once. Create a group or join one with a code --- both from your dashboard, not a new account each time.</p>
      </div>
      <div class="step">
        ${iconChip("account", "teal")}
        <h3>Owners and members</h3>
        <p>Whoever starts a group is its owner --- they can edit its profile and manage who's in it. Everyone can log results.</p>
      </div>
      <div class="step">
        ${iconChip("bolt", "amber")}
        <h3>Watch it settle live</h3>
        <p>Every result, and every group-vs-group match, shows up for everyone open to the page within a second.</p>
      </div>
    </div>

    <div class="section-heading">
      <h2>Built for friend groups, not a leaderboard for strangers</h2>
      <p>Everything here is in the app today, not a roadmap.</p>
    </div>
    <div class="features">
      <div class="feature">
        ${iconChip("account", "indigo")}
        <h3>Real members, not typed names</h3>
        <p>A result can only be logged against someone who's actually a member of the group.</p>
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
        <p>Your profile photo follows you across every group you're in --- generated instantly, or upload your own.</p>
      </div>
    </div>

    <div class="section-heading" id="get-started">
      <h2>Get started</h2>
      <p>${user ? "You're signed in --- jump straight to your groups." : "One account, then create or join a group from your dashboard."}</p>
    </div>
    <div class="cards-row">
      <div class="card action-section" id="signup">
        <h2 style="margin-top:0">${user ? "Your dashboard" : "Sign up"}</h2>
        <p class="lede" style="font-size:0.85rem">${
          user
            ? "Every group you're in, in one place."
            : "Create your account, then start a group (you'll be its owner) or join one with a code."
        }</p>
        <a class="btn-solid" href="${user ? "/me" : "/signup"}">${user ? "Go to my groups" : "Create account"}</a>
      </div>
      <div class="card action-section" id="login">
        <h2 style="margin-top:0">${user ? "Join another group" : "Already have an account?"}</h2>
        <p class="lede" style="font-size:0.85rem">${
          user ? "Have a group's code? Jump straight to it." : "Log in, then find or start a group from your dashboard."
        }</p>
        ${
          user
            ? `<form method="get" action="/g">
                <label for="code">Group code</label>
                <input id="code" name="code" required placeholder="e.g. ABC123" style="text-transform: uppercase" />
                <button type="submit">Go to group</button>
              </form>`
            : `<a class="btn-ghost" href="/login">Log in</a>`
        }
      </div>
    </div>`,
    undefined,
    user,
  );
}

/** The dedicated "start a group" page --- a name + bio + tag picker + photo
 * choice is a real form, not something that belongs squeezed into half a
 * two-column row next to a one-field "log in" card. Requires being signed
 * in already (src/server.ts redirects to /signup?next=/new otherwise) ---
 * the creator becomes the group's owner the moment it exists. */
export interface NewGroupPageOptions {
  createError?: string;
  /** What to put back in the form after a failed submit --- everything except
   * the file, which HTML has no way to hand back to a form. */
  prefill?: { name?: string; bio?: string; tagIds?: number[]; customTags?: string };
}

export function newGroupPage(user: User, opts: NewGroupPageOptions = {}): string {
  const prefill = opts.prefill ?? {};
  return layout(
    "Start a group — Score's in Check",
    `<div class="new-group-page">
      <a class="back-link" href="/me">&larr; Back to your groups</a>
      <h1>Start a new group</h1>
      <p class="lede">A name, a bio, and at least one game tag are required --- your group's profile, before anyone's logged a single result. You'll be its owner.</p>
      ${opts.createError ? `<p class="error-text">${escapeHtml(opts.createError)}</p>` : ""}
      <form class="card" method="post" action="/groups" enctype="multipart/form-data">
        <label for="name">Group name</label>
        <input id="name" name="name" required placeholder="e.g. The Office FIFA League" value="${escapeHtml(prefill.name ?? "")}" />
        <label for="bio">Bio</label>
        <textarea id="bio" name="bio" required rows="2" placeholder="Who you are and why you keep score">${escapeHtml(prefill.bio ?? "")}</textarea>
        <label>Game tags</label>
        <p class="lede" style="font-size:0.8rem; margin:-0.25rem 0 0.5rem">Pick at least one, or add your own below.</p>
        ${tagPicker(prefill.tagIds ?? [], prefill.customTags ?? "")}
        <label>Group photo</label>
        <div class="avatar-choice">
          <label class="radio-option"><input type="radio" name="avatarChoice" value="generate" checked /> Generate one for me</label>
          <label class="radio-option"><input type="radio" name="avatarChoice" value="upload" /> Upload a photo</label>
        </div>
        <input id="group-photo" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden />
        <button type="submit">Create group</button>
      </form>
    </div>`,
    avatarChoiceScript,
    user,
  );
}

export interface AuthPageOptions {
  createError?: string;
  next?: string;
  prefill?: { name?: string };
}

export function signupPage(opts: AuthPageOptions = {}): string {
  const next = opts.next ?? "/me";
  return layout(
    "Sign up — Score's in Check",
    `<div class="new-group-page">
      <a class="back-link" href="/">&larr; Back to home</a>
      <h1>Create your account</h1>
      <p class="lede">One account works everywhere --- every group you create or join from here on uses this login.</p>
      ${opts.createError ? `<p class="error-text">${escapeHtml(opts.createError)}</p>` : ""}
      <form class="card" method="post" action="/signup">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <label for="name">Name</label>
        <input id="name" name="name" required placeholder="e.g. Raj" value="${escapeHtml(opts.prefill?.name ?? "")}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required minlength="6" />
        <button type="submit">Create account</button>
      </form>
      <p class="lede" style="font-size:0.85rem">Already have an account? <a href="/login?next=${encodeURIComponent(next)}">Log in</a></p>
    </div>`,
    undefined,
    undefined,
  );
}

export function loginPage(opts: AuthPageOptions = {}): string {
  const next = opts.next ?? "/me";
  return layout(
    "Log in — Score's in Check",
    `<div class="new-group-page">
      <a class="back-link" href="/">&larr; Back to home</a>
      <h1>Log in</h1>
      <p class="lede">The same account you use everywhere on Score's in Check.</p>
      ${opts.createError ? `<p class="error-text">${escapeHtml(opts.createError)}</p>` : ""}
      <form class="card" method="post" action="/login">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <label for="name">Name</label>
        <input id="name" name="name" required placeholder="e.g. Raj" value="${escapeHtml(opts.prefill?.name ?? "")}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Log in</button>
      </form>
      <p class="lede" style="font-size:0.85rem">New here? <a href="/signup?next=${encodeURIComponent(next)}">Create an account</a></p>
    </div>`,
    undefined,
    undefined,
  );
}

/** The dashboard: who you are, every group you're in and your role, and a
 * way to create or join another --- the thing that didn't exist before
 * (decisions/0002-global-accounts.md), since there was no account to have
 * a dashboard for. */
export function mePage(user: User, memberships: MembershipWithGroup[], avatarError?: string): string {
  const groupRows = memberships
    .map(
      ({ group, role }) => `<li class="result-row">
        <div class="matchup">
          ${avatarImg(groupAvatarUrl(group.code), group.name, "sm")}
          <a href="/g/${encodeURIComponent(group.code)}"><strong>${escapeHtml(group.name)}</strong></a>
          ${role === "owner" ? `<span class="role-badge">Owner</span>` : ""}
        </div>
      </li>`,
    )
    .join("");

  return layout(
    "My groups — Score's in Check",
    `<div class="profile-header">
      ${avatarImg(userAvatarUrl(user.id), user.name, "lg")}
      <div class="profile-header-text">
        <h1 style="margin-bottom:0.1rem">${escapeHtml(user.name)}</h1>
        <p class="lede" style="margin-top:0">Your account --- works the same in every group below.</p>
      </div>
    </div>
    <form class="avatar-upload" method="post" action="/me/avatar" enctype="multipart/form-data">
      <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
      <button type="submit">Update my photo</button>
    </form>
    ${avatarError ? `<p class="error-text">${escapeHtml(avatarError)}</p>` : ""}

    <div class="cards-row">
      <div class="card">
        <h2 style="margin-top:0">Start a group</h2>
        <p class="lede" style="font-size:0.85rem">You'll be its owner.</p>
        <a class="btn-solid" href="/new">Start a group</a>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Join a group</h2>
        <p class="lede" style="font-size:0.85rem">Have a code? Enter it, then join from the group's page.</p>
        <form method="get" action="/g">
          <label for="code">Group code</label>
          <input id="code" name="code" required placeholder="e.g. ABC123" style="text-transform: uppercase" />
          <button type="submit">Go to group</button>
        </form>
      </div>
    </div>

    <h2>Your groups</h2>
    ${
      memberships.length === 0
        ? `<p class="empty">You're not in a group yet --- start one or join one above.</p>`
        : `<ul class="results-list">${groupRows}</ul>`
    }`,
    undefined,
    user,
  );
}

/** The inner markup of `#results-list` --- also what a live `result` event re-sends. */
export function resultsListFragment(group: Group, results: Result[]): string {
  if (results.length === 0) {
    return `<p class="empty">No results yet. Be the first to log one.</p>`;
  }
  const rows = results
    .map((r) => {
      const winnerAvatar = r.winner_user_id ? avatarImg(userAvatarUrl(r.winner_user_id), r.winner) : "";
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
export function memberOptionsFragment(members: MemberWithRole[]): string {
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
  members: MemberWithRole[],
  groupMatches: GroupMatch[],
  groupTags: Tag[],
  user: User | undefined,
  role: Role | undefined,
  resultError?: string,
  matchError?: string,
  avatarError?: string,
  profileError?: string,
): string {
  const code = escapeHtml(group.code);
  const memberOptions = memberOptionsFragment(members);
  const isMember = role !== undefined;
  const isOwner = role === "owner";
  const nextParam = encodeURIComponent(`/g/${group.code}`);

  const memberList = `<div class="member-list">
    ${members
      .map((m) => {
        const canRemove = isOwner && user && m.id !== user.id && m.role !== "owner";
        return `<div class="member-chip">
          ${avatarImg(userAvatarUrl(m.id), m.name, "sm")}
          <span>${escapeHtml(m.name)}</span>
          ${m.role === "owner" ? `<span class="role-badge">Owner</span>` : ""}
          ${
            canRemove
              ? `<form method="post" action="/g/${code}/members/${m.id}/remove" style="display:inline; margin:0">
                  <button type="submit" class="remove-btn">Remove</button>
                </form>`
              : ""
          }
        </div>`;
      })
      .join("")}
  </div>`;

  const joinOrAuthCard = !user
    ? `<div class="card">
        <h2 style="margin-top:0">Log in or sign up to join</h2>
        <p class="lede" style="font-size:0.85rem">You'll need an account to log a result in this group.</p>
        <div class="hero-actions" style="justify-content:flex-start">
          <a class="btn-solid" href="/signup?next=${nextParam}">Sign up</a>
          <a class="btn-ghost" href="/login?next=${nextParam}">Log in</a>
        </div>
      </div>`
    : !isMember
      ? `<div class="card">
          <h2 style="margin-top:0">Join this group</h2>
          <p class="lede" style="font-size:0.85rem">Signed in as <strong>${escapeHtml(user.name)}</strong>.</p>
          <form method="post" action="/g/${code}/join">
            <button type="submit">Join ${escapeHtml(group.name)}</button>
          </form>
        </div>`
      : "";

  const logResultCard = isMember
    ? `<div class="card">
        <h2 style="margin-top:0">Log a result</h2>
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
    : "";

  const groupMatchCard = isMember
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

  const { tagIds: currentTagIds, customTags: currentCustomTags } = splitGroupTags(groupTags);
  const editProfileCard = isOwner
    ? `<div class="card">
        <h2 style="margin-top:0">Edit group profile</h2>
        ${profileError ? `<p class="error-text">${escapeHtml(profileError)}</p>` : ""}
        <form method="post" action="/g/${code}/profile">
          <label for="edit-bio">Bio</label>
          <textarea id="edit-bio" name="bio" required rows="2">${escapeHtml(group.bio ?? "")}</textarea>
          <label>Game tags</label>
          ${tagPicker(currentTagIds, currentCustomTags)}
          <button type="submit">Save changes</button>
        </form>
        <form class="avatar-upload" method="post" action="/g/${code}/avatar" enctype="multipart/form-data">
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit">Update group photo</button>
        </form>
        ${avatarError ? `<p class="error-text">${escapeHtml(avatarError)}</p>` : ""}
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
      groupTags.length > 0
        ? `<div class="group-tags">${groupTags.map((t) => `<span class="tag-pill">${escapeHtml(t.name)}</span>`).join("")}</div>`
        : ""
    }
    <h2>Members</h2>
    ${memberList}
    <div class="group-layout">
      <div class="group-layout-actions">
        ${joinOrAuthCard}
        ${logResultCard}
        ${groupMatchCard}
        ${editProfileCard}
      </div>
      <div class="group-layout-feed">
        <h2 class="h2-live"><span class="live-dot"></span>Results</h2>
        <div id="results-list">${resultsListFragment(group, results)}</div>
        <h2 class="h2-live"><span class="live-dot"></span>Group matches</h2>
        <div id="group-matches-list">${groupMatchesFragment(group, groupMatches)}</div>
      </div>
    </div>`,
    liveScript(group.code),
    user,
  );
}
