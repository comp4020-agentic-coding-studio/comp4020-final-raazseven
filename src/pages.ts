import type { Group, GroupMatch, HeadToHeadTally, MemberWithRole, MembershipWithGroup, Result, Role, Tag, User } from "./db.ts";
import { disputesForResult, getGroupById, getUserById, participantsForResult } from "./db.ts";
import { curatedTagsByCategory } from "./db.ts";
import { baseStyles, iconChip, logoMark, siteHeader } from "./styles.ts";
import { GAME_NAMES, type MinigameSession, type RockPaperScissorsState, type TicTacToeState } from "./minigames.ts";

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
    ${user ? `<dialog id="challenge-popup" class="card"></dialog>` : ""}
    ${script ? `<script>${script}</script>` : ""}
    ${user ? `<script>${challengePopupScript}</script>` : ""}
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
    }
    <h2>Your stats</h2>
    <p class="lede" style="margin-top:0">Compare your record against everyone you share a group with, overall and per game.</p>
    <a class="btn-ghost" href="/me/stats">View my stats</a>`,
    undefined,
    user,
  );
}

/** One friend's row on the stats dashboard --- overall W-L, plus a per-game
 * breakdown once there's more than one game between them (a single-game
 * pair would just repeat the overall line twice, so it's skipped). */
function statRow(friend: User, tally: HeadToHeadTally): string {
  const played = tally.overallWins + tally.overallLosses;
  const byGameLines =
    tally.byGame.length > 1
      ? `<ul class="stat-by-game">${tally.byGame
          .map((g) => `<li><span class="game">${escapeHtml(g.game)}</span> ${g.wins}–${g.losses}</li>`)
          .join("")}</ul>`
      : "";
  return `<li class="result-row">
    <div class="matchup">
      ${avatarImg(userAvatarUrl(friend.id), friend.name)}
      <a href="/u/${friend.id}"><strong>${escapeHtml(friend.name)}</strong></a>
      ${
        played === 0
          ? `<span class="lede" style="margin:0; font-size:0.85rem">no results logged against them yet</span>`
          : `<span class="stat-record">${tally.overallWins}–${tally.overallLosses}</span>`
      }
    </div>
    ${byGameLines}
  </li>`;
}

/** The stats dashboard (`GET /me/stats`) --- overall and per-game win/loss
 * against every current "friend" (anyone the viewer shares a group with,
 * db.ts's friendsForUser()), sorted by games played so the people you
 * actually compete with most surface first. Counts every logged result
 * regardless of witness/dispute status (decisions/0005, 0006) --- the
 * dashboard reflects what's logged, the same way the results list itself
 * always shows every result. */
export function statsPage(user: User, tallies: Array<{ friend: User; tally: HeadToHeadTally }>): string {
  const sorted = [...tallies].sort((a, b) => {
    const playedA = a.tally.overallWins + a.tally.overallLosses;
    const playedB = b.tally.overallWins + b.tally.overallLosses;
    return playedB - playedA || a.friend.name.localeCompare(b.friend.name);
  });

  const totalWins = tallies.reduce((sum, t) => sum + t.tally.overallWins, 0);
  const totalLosses = tallies.reduce((sum, t) => sum + t.tally.overallLosses, 0);

  return layout(
    "My stats --- Score's in Check",
    `<div class="profile-header">
      ${avatarImg(userAvatarUrl(user.id), user.name, "lg")}
      <div class="profile-header-text">
        <h1 style="margin-bottom:0.1rem">My stats</h1>
        <p class="lede" style="margin-top:0">${
          totalWins + totalLosses === 0
            ? "No results logged yet --- play something and log it."
            : `Overall record across every friend: <strong>${totalWins}–${totalLosses}</strong>`
        }</p>
      </div>
    </div>
    <a class="back-link" href="/me">← Back to my groups</a>
    <h2>Vs. everyone you share a group with</h2>
    ${
      sorted.length === 0
        ? `<p class="empty">You don't share a group with anyone yet --- join or start one to find out.</p>`
        : `<ul class="results-list">${sorted.map(({ friend, tally }) => statRow(friend, tally)).join("")}</ul>`
    }`,
    undefined,
    user,
  );
}

/** The inner markup of `#results-list` --- also what a live `result` event re-sends. */
/** Renders one side of a result (winner or loser) as linked, avatar'd names,
 * joined with "&" for a team --- falls back to the single denormalised name
 * (no link, no avatar) only if `participantsForResult` somehow has nothing,
 * which shouldn't happen for any result logged after team results shipped. */
function sideNames(resultId: number, side: "winner" | "loser", fallbackName: string): string {
  const participants = participantsForResult(resultId, side);
  if (participants.length === 0) return escapeHtml(fallbackName);
  return participants
    .map((p) => `${avatarImg(userAvatarUrl(p.id), p.name)}<a href="/u/${p.id}">${escapeHtml(p.name)}</a>`)
    .join(" &amp; ");
}

/** The witness badge next to a result --- a plain pill when there's nothing
 * to do, or (only for the named witness, only while still "pending") the
 * confirm/deny buttons themselves. Every other viewer, including the
 * winner/loser, sees only the status --- vouching for a result is the
 * witness's call alone (decisions/0005-witness-confirmation.md). */
function witnessBadge(result: Result, code: string, viewerId: number | undefined): string {
  if (result.witness_status === "none") return "";
  const witness = result.witness_user_id !== null ? getUserById(result.witness_user_id) : undefined;
  const witnessName = witness ? escapeHtml(witness.name) : "a witness";
  if (result.witness_status === "pending" && viewerId === result.witness_user_id) {
    return `<form method="post" action="/g/${code}/results/${result.id}/witness" class="witness-actions">
      <span class="witness-pill witness-pending">awaiting your word</span>
      <button type="submit" name="decision" value="confirm" class="btn-solid witness-btn">Confirm</button>
      <button type="submit" name="decision" value="deny" class="btn-ghost witness-btn">Deny</button>
    </form>`;
  }
  const label =
    result.witness_status === "pending"
      ? `awaiting ${witnessName}'s word`
      : result.witness_status === "confirmed"
        ? `confirmed by ${witnessName}`
        : `disputed by ${witnessName}`;
  return `<span class="witness-pill witness-${result.witness_status}">${label}</span>`;
}

/** Who logged a result, if anyone --- a result from before this column
 * existed has no logger and renders nothing
 * (decisions/0006-named-party-disputes-and-logger-attribution.md). Shown to
 * every viewer, not gated on anything: the point is a group being able to
 * see who's been doing the logging, which an optional witness alone never
 * surfaced. */
function loggedByLine(result: Result): string {
  if (result.logged_by_user_id === null) return "";
  const logger = getUserById(result.logged_by_user_id);
  if (!logger) return "";
  return `<span class="logged-by">logged by <a href="/u/${logger.id}">${escapeHtml(logger.name)}</a></span>`;
}

/** The dispute control for a result --- unlike the witness badge, this isn't
 * one decision between two states: every named winner/loser who disputes it
 * adds their own row, so this renders a running count plus (only for a
 * viewer who's actually eligible --- named on either side, didn't log it
 * themselves, hasn't already disputed it) a button to add their own.
 * Eligibility is re-checked server-side regardless of what this renders
 * (decisions/0006), the same client-renders-the-affordance,
 * server-re-checks-the-rule pattern the owner-only "Remove member" button
 * already uses. */
function disputeControls(result: Result, code: string, viewerId: number | undefined): string {
  const disputes = disputesForResult(result.id);
  const alreadyDisputed = viewerId !== undefined && disputes.some((d) => d.disputed_by_user_id === viewerId);
  const isParticipant =
    viewerId !== undefined &&
    (participantsForResult(result.id, "winner").some((p) => p.id === viewerId) ||
      participantsForResult(result.id, "loser").some((p) => p.id === viewerId));
  const canDispute = isParticipant && viewerId !== result.logged_by_user_id && !alreadyDisputed;

  const countPill =
    disputes.length > 0
      ? `<span class="witness-pill witness-disputed">disputed by ${disputes.length} of ${
          participantsForResult(result.id, "winner").length + participantsForResult(result.id, "loser").length
        } named</span>`
      : "";

  if (!canDispute) return countPill;
  return `${countPill}<form method="post" action="/g/${code}/results/${result.id}/dispute" style="display:inline">
    <button type="submit" class="btn-ghost witness-btn">Dispute this</button>
  </form>`;
}

export function resultsListFragment(group: Group, results: Result[], viewerId?: number): string {
  if (results.length === 0) {
    return `<p class="empty">No results yet. Be the first to log one.</p>`;
  }
  const rows = results
    .map((r) => {
      return `<li class="result-row">
        <div class="matchup">
          <span class="game">${escapeHtml(r.game)}</span>
          <span class="winner">${sideNames(r.id, "winner", r.winner)}</span>
          <span>beat</span>
          <span class="loser">${sideNames(r.id, "loser", r.loser)}</span>
          ${witnessBadge(r, group.code, viewerId)}
          ${disputeControls(r, group.code, viewerId)}
          ${loggedByLine(r)}
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
    // A multi-select can have more than one chosen option at once (a team
    // result) --- capture the full selected set, not just el.value (which
    // only ever reports the first), and restore whichever of those ids
    // still exist in the refreshed option list.
    var previous = Array.prototype.filter.call(el.options, function (o) { return o.selected; })
      .map(function (o) { return o.value; });
    el.innerHTML = html;
    Array.prototype.forEach.call(el.options, function (o) {
      if (previous.indexOf(o.value) !== -1) o.selected = true;
    });
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
  // A pending challenge's visibility is viewer-specific (decisions/0007) ---
  // this pub-sub has no per-recipient payload, so this re-fetches the
  // viewer's own correct card rather than swapping in HTML meant for
  // whoever triggered the broadcast. A full location.reload() here used to
  // race the acceptor's OWN in-flight navigation away from this exact page:
  // accepting broadcasts this same event on the group's channel, so the
  // acceptor's still-open group-page tab would sometimes reload itself
  // right back to the group page instead of letting the accept route's
  // redirect land on the game page (decisions/0009). A targeted fragment
  // fetch never competes with that navigation the way reloading the whole
  // page did.
  source.addEventListener("challenge", function () {
    fetch(${JSON.stringify(`/g/${encodeURIComponent(code)}/challenges`)})
      .then(function (r) { return r.text(); })
      .then(function (html) { swapInner("challenges-card", html); });
  });
})();
`;

/** The inner `<option>`s for "who do you want to challenge" --- every member
 * except the viewer themselves (challenging yourself isn't a game). */
function opponentOptionsFragment(members: MemberWithRole[], viewerId: number): string {
  const options = members
    .filter((m) => m.id !== viewerId)
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join("\n");
  return `<option value="" disabled selected>choose an opponent</option>${options}`;
}

/** "Challenges waiting on you" (decisions/0007) --- every pending challenge
 * where the viewer is the one being challenged, each with its own
 * accept/decline form. This is the actual fix for the gap 0007 names: before
 * this card existed, nothing on the group page ever told you someone had
 * challenged you, so you'd only find out by already being on the exact game
 * URL. Rendered first in the actions column (ahead of the challenge-someone
 * form itself) since answering an existing challenge is more pressing than
 * starting a new one. Empty when there's nothing pending, same as every
 * other conditional card on this page. Exported so `GET /g/:code/challenges`
 * (src/server.ts) can re-render it standalone for the live fragment swap
 * `liveScript`'s "challenge" listener fetches (decisions/0009). */
export function pendingChallengesCard(code: string, challenges: MinigameSession[]): string {
  if (challenges.length === 0) return "";
  const rows = challenges
    .map((session) => {
      const challenger = getUserById(session.playerIds[0]);
      const challengerName = challenger ? escapeHtml(challenger.name) : "someone";
      const gamePath = `/g/${code}/games/${encodeURIComponent(session.id)}`;
      return `<li class="result-row">
        <div class="matchup">
          ${challenger ? avatarImg(userAvatarUrl(challenger.id), challenger.name) : ""}
          <span>${challengerName} challenged you to ${escapeHtml(GAME_NAMES[session.game])}</span>
        </div>
        <div class="witness-actions">
          <form method="post" action="${gamePath}/accept" style="display:inline">
            <button type="submit" class="btn-solid witness-btn">Accept</button>
          </form>
          <form method="post" action="${gamePath}/decline" style="display:inline">
            <button type="submit" class="btn-ghost witness-btn">Decline</button>
          </form>
        </div>
      </li>`;
    })
    .join("\n");
  return `<div class="card">
    <h2 style="margin-top:0">Challenges waiting on you</h2>
    <ul class="results-list">${rows}</ul>
  </div>`;
}

/** The site-wide challenge popup's inner markup (decisions/0008) --- unlike
 * `pendingChallengesCard` above (scoped to one group, rendered inline on
 * that group's own page), this spans every group the viewer is in at once,
 * since the whole point is reaching them no matter which page they're on.
 * Each challenge needs its own group's code (not one shared `code` param,
 * since the challenges here can come from different groups), so this looks
 * the group up per challenge rather than taking it as a parameter. Returns
 * empty string when there's nothing pending --- the client only shows the
 * `<dialog>` when this has real content. This is also the `/me/challenges`
 * fragment route's full response body (src/server.ts), fetched on page load
 * and after every live "challenge" ping (see `challengePopupScript` below). */
export function challengePopupFragment(challenges: MinigameSession[]): string {
  if (challenges.length === 0) return "";
  const rows = challenges
    .map((session) => {
      const challenger = getUserById(session.playerIds[0]);
      const group = getGroupById(session.groupId);
      if (!challenger || !group) return "";
      const gamePath = `/g/${encodeURIComponent(group.code)}/games/${encodeURIComponent(session.id)}`;
      return `<li class="result-row">
        <div class="matchup">
          ${avatarImg(userAvatarUrl(challenger.id), challenger.name)}
          <span>${escapeHtml(challenger.name)} challenged you to ${escapeHtml(GAME_NAMES[session.game])} in ${escapeHtml(group.name)}</span>
        </div>
        <div class="witness-actions">
          <form method="post" action="${gamePath}/accept" style="display:inline">
            <button type="submit" class="btn-solid witness-btn">Accept</button>
          </form>
          <form method="post" action="${gamePath}/decline" style="display:inline">
            <button type="submit" class="btn-ghost witness-btn">Decline</button>
          </form>
        </div>
      </li>`;
    })
    .join("\n");
  return `<h2 style="margin-top:0">You've been challenged</h2>
    <ul class="results-list">${rows}</ul>`;
}

/** Opens `/me/events` (decisions/0008's per-user channel) once per page load
 * and shows a real `<dialog>` popup --- not just a card sitting in a column
 * --- whenever a challenge exists or newly arrives. Checks on load too (a
 * `fetch` to `/me/challenges`, not just the live event), so refreshing or
 * opening the app for the first time after being challenged still surfaces
 * it, not only the live push. Only wired up for a signed-in user (the
 * per-user channel needs an id to key on); every page goes through
 * `layout()`, so this is the one place that has to work everywhere. */
const challengePopupScript = `
(function () {
  var dialog = document.getElementById("challenge-popup");
  if (!dialog) return;
  function showIfAny(html) {
    if (!html) { if (dialog.open) dialog.close(); return; }
    dialog.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }
  function check() {
    fetch("/me/challenges").then(function (r) { return r.text(); }).then(showIfAny);
  }
  check();
  var source = new EventSource("/me/events");
  source.addEventListener("challenge", check);
})();
`;

/** The "challenge someone to a mini-game" card (decisions/0004) --- sits
 * alongside the log-result/log-match/edit-profile cards in
 * .group-layout-actions. Only shown to a signed-in member, the same gate
 * logResultCard already uses, since a challenge is itself a kind of result
 * waiting to happen. */
function minigameChallengeCard(code: string, members: MemberWithRole[], user: User, challengeError?: string): string {
  const otherMembers = members.filter((m) => m.id !== user.id);
  if (otherMembers.length === 0) {
    return `<div class="card">
      <h2 style="margin-top:0">Challenge someone to a mini-game</h2>
      <p class="empty">No one else has joined this group yet.</p>
    </div>`;
  }
  return `<div class="card">
    <h2 style="margin-top:0">Challenge someone to a mini-game</h2>
    ${challengeError ? `<p class="error-text">${escapeHtml(challengeError)}</p>` : ""}
    <form method="post" action="/g/${code}/games">
      <label for="opponent-select">Opponent</label>
      <select id="opponent-select" name="opponentId" required>${opponentOptionsFragment(members, user.id)}</select>
      <label for="minigame-select">Game</label>
      <select id="minigame-select" name="game" required>
        <option value="tic-tac-toe">Tic-Tac-Toe</option>
        <option value="rock-paper-scissors">Rock-Paper-Scissors</option>
      </select>
      <button type="submit">Start challenge</button>
    </form>
  </div>`;
}

/** A Tic-Tac-Toe board has no hidden information --- every viewer (either
 * player, or a third member just watching the group page) sees the exact
 * same thing, the same way resultsListFragment() is viewer-agnostic. Every
 * empty cell renders as its own one-click form regardless of whose turn it
 * actually is; an off-turn click is rejected server-side (src/minigames.ts's
 * applyMove), the same client-renders-the-affordance,
 * server-re-checks-the-rule pattern the owner-only "Remove" button already
 * uses. */
function ticTacToeBoardHtml(session: MinigameSession, players: [User, User], moveUrl: string): string {
  const state = session.state as TicTacToeState;
  const [challenger, opponent] = players;
  const markFor = (userId: number): Mark => (session.playerIds[0] === userId ? "X" : "O");

  const cells = state.board
    .map((cell, i) => {
      if (cell) return `<div class="ttt-cell ttt-cell-filled">${cell}</div>`;
      if (session.status !== "active") return `<div class="ttt-cell"></div>`;
      return `<form method="post" action="${moveUrl}" style="margin:0">
        <input type="hidden" name="cell" value="${i}" />
        <button type="submit" class="ttt-cell" aria-label="play cell ${i + 1}"></button>
      </form>`;
    })
    .join("");

  let status: string;
  if (session.status === "finished") {
    status = session.isDraw
      ? "It's a draw."
      : `${escapeHtml(session.winnerId === challenger.id ? challenger.name : opponent.name)} wins!`;
  } else {
    const turnUser = state.turn === markFor(challenger.id) ? challenger : opponent;
    status = `${escapeHtml(turnUser.name)}'s turn (${state.turn})`;
  }

  return `<p class="lede" style="margin-top:0">${status}</p>
    <div class="ttt-board">${cells}</div>`;
}

type Mark = "X" | "O";

/** Rock-Paper-Scissors has hidden information: a player's choice can't be
 * shown to their opponent until both have chosen, or the second player could
 * simply wait for a live update revealing the first player's pick. While the
 * round is still active this only ever reveals `viewerId`'s own choice (or
 * nothing, from a third member just watching); `viewerId` is unused, and
 * both choices are shown, once the round is finished --- by then the
 * revealed state is identical and safe for everyone, which is also exactly
 * the moment src/server.ts actually broadcasts it (see applyMove's
 * `justFinished`). */
function rpsBoardHtml(session: MinigameSession, players: [User, User], viewerId: number | undefined, moveUrl: string): string {
  const state = session.state as RockPaperScissorsState;
  const [challenger, opponent] = players;

  if (session.status === "finished") {
    const choiceFor = (userId: number) => state.choices[userId]!;
    const status = session.isDraw
      ? `Both chose ${escapeHtml(choiceFor(challenger.id))} --- it's a draw.`
      : `${escapeHtml(session.winnerId === challenger.id ? challenger.name : opponent.name)} wins!`;
    return `<p class="lede" style="margin-top:0">${status}</p>
      <div class="rps-reveal">
        <p>${escapeHtml(challenger.name)} chose <strong>${escapeHtml(choiceFor(challenger.id))}</strong></p>
        <p>${escapeHtml(opponent.name)} chose <strong>${escapeHtml(choiceFor(opponent.id))}</strong></p>
      </div>`;
  }

  const viewerHasChosen = viewerId !== undefined && state.choices[viewerId] !== undefined;
  const viewerIsPlayer = viewerId !== undefined && session.playerIds.includes(viewerId);

  if (!viewerIsPlayer) {
    return `<p class="lede" style="margin-top:0">Waiting for both players to choose --- choices stay hidden until the round ends.</p>`;
  }
  if (viewerHasChosen) {
    return `<p class="lede" style="margin-top:0">You chose <strong>${escapeHtml(state.choices[viewerId!]!)}</strong>. Waiting for the other player...</p>`;
  }
  return `<p class="lede" style="margin-top:0">Pick one:</p>
    <form method="post" action="${moveUrl}" class="rps-choices">
      <button type="submit" name="choice" value="rock">Rock</button>
      <button type="submit" name="choice" value="paper">Paper</button>
      <button type="submit" name="choice" value="scissors">Scissors</button>
    </form>`;
}

/** A still-pending challenge's board area --- no board exists to show yet
 * (decisions/0007). The challenged opponent (playerIds[1]) gets
 * accept/decline buttons; the challenger and anyone else watching just see
 * who it's waiting on. `gamePath` is the game's own base path (not the move
 * URL), since accept/decline are their own routes alongside `/move`. */
function pendingChallengeHtml(session: MinigameSession, players: [User, User], viewerId: number | undefined, gamePath: string): string {
  const [challenger, opponent] = players;
  if (viewerId === opponent.id) {
    return `<p class="lede" style="margin-top:0">${escapeHtml(challenger.name)} challenged you to ${escapeHtml(GAME_NAMES[session.game])}.</p>
      <div class="witness-actions">
        <form method="post" action="${gamePath}/accept">
          <button type="submit" class="btn-solid">Accept</button>
        </form>
        <form method="post" action="${gamePath}/decline">
          <button type="submit" class="btn-ghost">Decline</button>
        </form>
      </div>`;
  }
  return `<p class="lede" style="margin-top:0">Waiting for ${escapeHtml(opponent.name)} to accept...</p>`;
}

/** The inner markup of `#game-board` --- also what a live "board" event
 * re-sends. Dispatches on status first (decisions/0007: a challenge has to
 * be accepted before there's a board worth rendering at all), then on game
 * kind for an active or finished session, same as before that change. */
export function gameBoardFragment(
  session: MinigameSession,
  players: [User, User],
  viewerId: number | undefined,
  gamePath: string,
): string {
  const moveUrl = `${gamePath}/move`;
  if (session.status === "pending") return pendingChallengeHtml(session, players, viewerId, gamePath);
  if (session.status === "declined") {
    return `<p class="lede" style="margin-top:0">${escapeHtml(players[1].name)} declined this challenge.</p>`;
  }
  return session.game === "tic-tac-toe"
    ? ticTacToeBoardHtml(session, players, moveUrl)
    : rpsBoardHtml(session, players, viewerId, moveUrl);
}

/** Parallel to liveScript() above, but scoped to one game's own SSE channel
 * (src/minigames.ts's channelFor()) rather than the group's --- a "board"
 * event just swaps #game-board wholesale, since every board renderer above
 * already produces the complete inner markup each time. */
const gameLiveScript = (code: string, gameId: string) => `
(function () {
  var source = new EventSource(${JSON.stringify(`/g/${encodeURIComponent(code)}/games/${encodeURIComponent(gameId)}/events`)});
  source.addEventListener("board", function (e) {
    var el = document.getElementById("game-board");
    if (el) el.innerHTML = e.data;
  });
})();
`;

/** One mini-game's own page --- the two players, the board, and a link back
 * to the group. `viewer` decides what the board shows (rpsBoardHtml's hidden
 * choice), not who's allowed to see the page at all: a third member watching
 * is fine, the same way the group page itself is visible to anyone. */
export function gamePage(
  group: Group,
  session: MinigameSession,
  players: [User, User],
  viewer: User | undefined,
  moveError?: string,
): string {
  const code = escapeHtml(group.code);
  const [challenger, opponent] = players;
  const gamePath = `/g/${code}/games/${encodeURIComponent(session.id)}`;

  return layout(
    `${GAME_NAMES[session.game]} --- ${group.name}`,
    `<a class="back-link" href="/g/${code}">← Back to ${escapeHtml(group.name)}</a>
    <h1 style="margin-bottom:0.25rem">${escapeHtml(GAME_NAMES[session.game])}</h1>
    <div class="profile-header" style="margin-top:0.5rem">
      ${avatarImg(userAvatarUrl(challenger.id), challenger.name, "sm")}
      <strong>${escapeHtml(challenger.name)}</strong>
      <span class="lede" style="margin:0">vs</span>
      ${avatarImg(userAvatarUrl(opponent.id), opponent.name, "sm")}
      <strong>${escapeHtml(opponent.name)}</strong>
    </div>
    <div class="card">
      ${moveError ? `<p class="error-text">${escapeHtml(moveError)}</p>` : ""}
      <div id="game-board">${gameBoardFragment(session, players, viewer?.id, gamePath)}</div>
    </div>`,
    gameLiveScript(group.code, session.id),
    viewer,
  );
}

export function groupPage(
  group: Group,
  results: Result[],
  members: MemberWithRole[],
  groupMatches: GroupMatch[],
  groupTags: Tag[],
  user: User | undefined,
  role: Role | undefined,
  pendingChallenges: MinigameSession[],
  resultError?: string,
  matchError?: string,
  avatarError?: string,
  profileError?: string,
  challengeError?: string,
  witnessError?: string,
  disputeError?: string,
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
          <a href="/u/${m.id}">
            ${avatarImg(userAvatarUrl(m.id), m.name, "sm")}
            <span>${escapeHtml(m.name)}</span>
          </a>
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

  const witnessOptions = `<option value="">no witness</option>${members
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join("\n")}`;

  const logResultCard = isMember
    ? `<div class="card">
        <h2 style="margin-top:0">Log a result</h2>
        <p class="lede" style="font-size:0.8rem; margin:-0.25rem 0 0.5rem">Hold ⌘/Ctrl to pick more than one player per side --- a 2v1 or a team result works the same way as a plain 1v1.</p>
        ${resultError ? `<p class="error-text">${escapeHtml(resultError)}</p>` : ""}
        <form method="post" action="/g/${code}/results">
          <label for="game">Game</label>
          <input id="game" name="game" required placeholder="e.g. FIFA, NBA 2K, basketball" />
          <label for="winner-select">Winner(s)</label>
          <select id="winner-select" name="winner" multiple required size="4">${memberOptions}</select>
          <label for="loser-select">Loser(s)</label>
          <select id="loser-select" name="loser" multiple required size="4">${memberOptions}</select>
          <label for="witness-select">Witness (optional)</label>
          <select id="witness-select" name="witness">${witnessOptions}</select>
          <p class="lede" style="font-size:0.75rem; margin:-0.25rem 0 0.5rem">Name a third member to vouch for this result --- it'll show as pending until they confirm or deny it.</p>
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

  const challengesCard = isMember && user ? pendingChallengesCard(code, pendingChallenges) : "";
  const minigameCard = isMember && user ? minigameChallengeCard(code, members, user, challengeError) : "";

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
        <div id="challenges-card">${challengesCard}</div>
        ${logResultCard}
        ${minigameCard}
        ${groupMatchCard}
        ${editProfileCard}
      </div>
      <div class="group-layout-feed">
        <h2 class="h2-live"><span class="live-dot"></span>Results</h2>
        ${witnessError ? `<p class="error-text">${escapeHtml(witnessError)}</p>` : ""}
        ${disputeError ? `<p class="error-text">${escapeHtml(disputeError)}</p>` : ""}
        <div id="results-list">${resultsListFragment(group, results, user?.id)}</div>
        <h2 class="h2-live"><span class="live-dot"></span>Group matches</h2>
        <div id="group-matches-list">${groupMatchesFragment(group, groupMatches)}</div>
      </div>
    </div>`,
    liveScript(group.code),
    user,
  );
}

/** A friend's profile: shared groups, and --- only once you're signed in, and
 * only through a group you're currently in together --- your head-to-head
 * and teamed-up history with them. The viewer's own current membership is
 * the server-checked visibility boundary
 * (decisions/0003-team-results-and-profile-visibility.md), computed in
 * src/server.ts before this ever renders, not re-derived here. */
export function profilePage(
  viewer: User | undefined,
  owner: User,
  sharedGroups: Group[],
  headToHead: Result[],
  teamedUp: Result[],
): string {
  const nextParam = encodeURIComponent(`/u/${owner.id}`);
  const signInPrompt = !viewer
    ? `<div class="card">
        <h2 style="margin-top:0">Log in to see shared history</h2>
        <p class="lede" style="font-size:0.85rem">Your match history with ${escapeHtml(owner.name)} only shows once you're signed in and share a group with them.</p>
        <div class="hero-actions" style="justify-content:flex-start">
          <a class="btn-solid" href="/signup?next=${nextParam}">Sign up</a>
          <a class="btn-ghost" href="/login?next=${nextParam}">Log in</a>
        </div>
      </div>`
    : sharedGroups.length === 0
      ? `<p class="empty">You don't share a group with ${escapeHtml(owner.name)}, so there's no history to show.</p>`
      : "";

  return layout(
    `${owner.name} — Score's in Check`,
    `<div class="profile-header">
      ${avatarImg(userAvatarUrl(owner.id), owner.name, "lg")}
      <div class="profile-header-text">
        <h1 style="margin-bottom:0.1rem">${escapeHtml(owner.name)}</h1>
        <p class="lede" style="margin-top:0">${
          sharedGroups.length > 0
            ? `Shares ${sharedGroups.length} group${sharedGroups.length === 1 ? "" : "s"} with you: ${sharedGroups.map((g) => escapeHtml(g.name)).join(", ")}`
            : "No groups in common with you"
        }</p>
      </div>
    </div>
    ${signInPrompt}
    ${
      viewer && sharedGroups.length > 0
        ? `<h2>Head-to-head</h2>
           ${headToHead.length === 0 ? `<p class="empty">You haven't played against ${escapeHtml(owner.name)} yet.</p>` : resultsListFragmentForProfile(headToHead)}
           <h2>Teamed up</h2>
           ${teamedUp.length === 0 ? `<p class="empty">You haven't teamed up with ${escapeHtml(owner.name)} yet.</p>` : resultsListFragmentForProfile(teamedUp)}`
        : ""
    }`,
    undefined,
    viewer,
  );
}

/** `resultsListFragment` needs a `Group` only to pass through to
 * `addResult`-era callers that never read it --- a profile page has no
 * single group in view (results here can span several shared groups), so
 * this calls the same per-result renderer directly instead of threading a
 * placeholder group through. */
function resultsListFragmentForProfile(results: Result[]): string {
  const rows = results
    .map((r) => {
      const group = getGroupById(r.group_id);
      return `<li class="result-row">
        <div class="matchup">
          <span class="game">${escapeHtml(r.game)}</span>
          <span class="winner">${sideNames(r.id, "winner", r.winner)}</span>
          <span>beat</span>
          <span class="loser">${sideNames(r.id, "loser", r.loser)}</span>
          ${group ? `<a class="lede" style="font-size:0.75rem" href="/g/${encodeURIComponent(group.code)}">in ${escapeHtml(group.name)}</a>` : ""}
        </div>
        <span class="when">${new Date(r.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
      </li>`;
    })
    .join("\n");
  return `<ul class="results-list">${rows}</ul>`;
}
