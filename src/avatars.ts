// Two ways to have a picture: a generated one (always available, no upload
// needed --- the Reddit-style default) or an uploaded photo that replaces it.
// This module only knows about the generated side and the rules for an
// upload; storing/serving the chosen one lives in src/db.ts / src/server.ts.

const PALETTE = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#4ade80", // green
  "#2dd4bf", // teal
  "#60a5fa", // blue
  "#818cf8", // indigo
  "#c084fc", // purple
  "#f472b6", // pink
];

// A small, deterministic hash (not cryptographic --- this only ever picks a
// color and two initials, never anything security-sensitive).
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initials(seed: string): string {
  const words = seed.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A deterministic SVG avatar seeded by a name or group code --- the same
 * seed always draws the same avatar, with no storage or upload involved. */
export function generatedAvatar(seed: string): string {
  const h = hash(seed || "?");
  const color = PALETTE[h % PALETTE.length];
  const letters = escapeXml(initials(seed));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="avatar for ${escapeXml(seed)}">
    <rect width="64" height="64" rx="12" fill="${color}" />
    <text x="32" y="33" text-anchor="middle" dominant-baseline="central"
      font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="600" fill="#ffffff">${letters}</text>
  </svg>`;
}

export const AVATAR_MAX_BYTES = 300 * 1024; // 300KB --- fits comfortably on a 256MB machine with no resizing step
export const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class AvatarTooLargeError extends Error {}
export class UnsupportedAvatarTypeError extends Error {}

/** Throws if the upload doesn't meet the upload rules; otherwise does nothing. */
export function validateAvatarUpload(mimeType: string, size: number): void {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new UnsupportedAvatarTypeError("avatars must be PNG, JPEG, or WebP");
  }
  if (size > AVATAR_MAX_BYTES) {
    throw new AvatarTooLargeError(`avatars must be ${AVATAR_MAX_BYTES / 1024}KB or smaller`);
  }
}
