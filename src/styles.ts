export const baseStyles = `
  :root {
    --bg: #faf9f7;
    --surface: #ffffff;
    --text: #1f2328;
    --muted: #6b7280;
    --border: #e5e7eb;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --accent-contrast: #ffffff;
    --chip-bg: #fef3c7;
    --chip-text: #92400e;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
    --shadow-lift: 0 10px 24px rgba(16, 24, 40, 0.1);
    /* A small secondary palette, used only for icon chips and the hero
       mockup --- buttons and links stay on --accent alone, so there's still
       exactly one color a visitor learns means "do this." */
    --accent-amber: #d97706;
    --accent-teal: #0d9488;
    --accent-pink: #db2777;
    --font-display: "Sora", ui-sans-serif, system-ui, sans-serif;
    /* The page's content width, in one place so the header, main content and
       footer always widen together --- see the breakpoints below. Phones get
       the same single readable column as always; tablet and desktop get
       more room, and the group page turns that into a real two-column
       layout (.group-layout) instead of stretching one column thin. */
    --page-width: 40rem;
  }

  @media (min-width: 700px) {
    :root { --page-width: 48rem; }
  }

  @media (min-width: 1024px) {
    :root { --page-width: 72rem; }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --surface: #1c1f26;
      --text: #e8eaed;
      --muted: #9aa1ac;
      --border: #2d313a;
      --accent: #818cf8;
      --accent-hover: #6366f1;
      --accent-contrast: #14161a;
      --chip-bg: #3a2e14;
      --chip-text: #fcd34d;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5);
      --shadow-lift: 0 10px 24px rgba(0, 0, 0, 0.45);
      --accent-amber: #fbbf24;
      --accent-teal: #2dd4bf;
      --accent-pink: #f472b6;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero-animate {
      animation: fadeInUp 0.6s ease both;
    }
    .hero-content > .hero-animate:nth-child(1) { animation-delay: 0s; }
    .hero-content > .hero-animate:nth-child(2) { animation-delay: 0.08s; }
    .hero-content > .hero-animate:nth-child(3) { animation-delay: 0.16s; }
    .hero-content > .hero-animate:nth-child(4) { animation-delay: 0.24s; }
    .hero-visual.hero-animate { animation-delay: 0.15s; }
    .live-dot {
      animation: pulse 1.6s ease-in-out infinite;
    }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.8); }
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.55;
    /* A group/game/player name is free text with no length limit --- this is
       what stops one long, space-less word from forcing horizontal scroll
       instead of wrapping. */
    overflow-wrap: break-word;
  }

  header.site {
    border-bottom: 1px solid var(--border);
    padding: 1rem 1.25rem;
  }

  header.site .brand-row {
    max-width: var(--page-width);
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  header.site .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  header.site .brand-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
    text-decoration: none;
  }

  header.site .wordmark {
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: -0.01em;
  }

  header.site .tagline {
    color: var(--muted);
    font-size: 0.875rem;
  }

  .site-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-ghost, .btn-solid {
    text-decoration: none;
  }

  .btn-ghost {
    display: inline-block;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-ghost:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn-solid {
    display: inline-block;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .btn-solid:hover { background: var(--accent-hover); }

  main {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  h1, h2, h3, .wordmark, button, .btn-solid, .btn-ghost {
    font-family: var(--font-display);
  }

  h1 {
    font-size: 1.75rem;
    letter-spacing: -0.02em;
    margin: 0 0 0.25rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 2rem 0 0.75rem;
  }

  /* Only where a heading actually gets a live-dot (group page section
     titles) --- plain h2 (including the centered home-page section
     headings, which rely on text-align, not flex) is untouched. */
  h2.h2-live {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .live-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
  }

  p.lede {
    color: var(--muted);
    margin-top: 0;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.25rem;
    box-shadow: var(--shadow);
    margin-bottom: 1.25rem;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .icon-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 12px;
    margin-bottom: 0.75rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.8rem;
  }

  .icon-chip.c-indigo { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
  .icon-chip.c-amber { background: color-mix(in srgb, var(--accent-amber) 18%, transparent); color: var(--accent-amber); }
  .icon-chip.c-teal { background: color-mix(in srgb, var(--accent-teal) 18%, transparent); color: var(--accent-teal); }
  .icon-chip.c-pink { background: color-mix(in srgb, var(--accent-pink) 18%, transparent); color: var(--accent-pink); }

  .cards-row {
    display: grid;
    /* minmax(0, 1fr), not bare 1fr: a bare 1fr track still won't shrink
       narrower than its content's intrinsic min-width, and a text input's
       default min-width is wider than this grid ever gets inside the
       sidebar-width .group-layout-actions column --- without the explicit
       0 floor, the two columns blow out past their container instead of
       letting the inputs shrink. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
    /* Caps only the top-level (home page) use of this --- a cards-row
       nested inside a narrower card or .group-layout column is already
       narrower than this, so the cap never binds there. */
    max-width: 48rem;
    margin-inline: auto;
  }

  @media (max-width: 480px) {
    .cards-row { grid-template-columns: 1fr; }
  }

  /* The sidebar column of .group-layout (18-24rem) is narrow by design at
     every viewport, not just on mobile --- two side-by-side mini-forms (log
     in / create account, or the two match-score fields) are cramped there
     regardless of how wide the rest of the page is, so this always stacks
     them rather than reusing the width-based breakpoint above. */
  .group-layout-actions .cards-row {
    grid-template-columns: 1fr;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  input {
    font: inherit;
    font-size: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    /* An <input> is inline-block by default and sizes to its own intrinsic
       width (~20 characters), not its container's --- fine when it's a
       direct flex child of <form> (flex-stretch fills it for free by
       coincidence), but not when it's one level deeper in a wrapper <div>
       (the two score fields, the two login/signup columns): those need
       this spelled out explicitly instead of relying on that coincidence. */
    width: 100%;
  }

  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* The base "input" rule above is written for text/password/number/file
     fields; a radio or checkbox needs its native appearance back, not a
     stretched, padded, bordered box pretending to be a text field. */
  input[type="radio"], input[type="checkbox"] {
    width: auto;
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    accent-color: var(--accent);
  }

  .avatar-choice {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.25rem;
    margin-bottom: 0.25rem;
  }

  .avatar-choice .radio-option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
  }

  textarea {
    font: inherit;
    font-size: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    width: 100%;
    resize: vertical;
    min-height: 3.2rem;
  }

  textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .tag-pill {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--accent-teal);
    background: color-mix(in srgb, var(--accent-teal) 15%, transparent);
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    margin: 0 0.3rem 0.3rem 0;
  }

  .group-bio {
    color: var(--text);
    margin: 0.5rem 0;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.3rem 0.6rem 0.3rem 0.3rem;
    border-radius: 999px;
    border: 1px solid var(--border);
  }

  .user-chip:hover {
    border-color: var(--accent);
  }

  .member-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .member-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.6rem 0.25rem 0.25rem;
    font-size: 0.85rem;
  }

  .role-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--accent-amber);
    background: color-mix(in srgb, var(--accent-amber) 18%, transparent);
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }

  .remove-btn:hover {
    color: #b91c1c;
    background: none;
  }

  .tag-picker {
    border: none;
    padding: 0;
    margin: 0 0 0.75rem;
  }

  .tag-picker legend {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0;
    margin-bottom: 0.4rem;
  }

  .tag-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  /* A checkbox styled as a toggle chip: the input itself is visually
     hidden but still present, focusable and keyboard-operable --- the
     adjacent <span> is what actually looks like a chip, driven by the
     sibling ":checked" selector rather than any JS. */
  .tag-check {
    cursor: pointer;
  }

  .tag-check input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .tag-check span {
    display: inline-block;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .tag-check input:checked + span {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }

  .tag-check input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  select {
    font: inherit;
    font-size: 1rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
  }

  select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .avatar {
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--border);
  }

  .avatar-sm { width: 28px; height: 28px; }
  .avatar-md { width: 40px; height: 40px; }
  .avatar-lg { width: 56px; height: 56px; }

  @media (min-width: 1024px) {
    .avatar-lg { width: 72px; height: 72px; }
  }

  .profile-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .profile-header-text {
    /* Without this a flex item won't shrink below its content's natural
       width, so a long, space-less group name would push past the viewport
       instead of wrapping. */
    min-width: 0;
  }

  .avatar-upload {
    /* the generic "form" rule below sets flex-direction: column for every
       other form on the page; this one needs an explicit row (it's a file
       input next to a button, not a stack of fields), with wrap as the
       escape hatch on the narrowest phones where both can't fit on one
       line. */
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 1rem;
  }

  .avatar-upload input[type="file"] {
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
  }

  .avatar-upload button {
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .error-text { color: #b91c1c; }

  /* Mobile: just a single stacked column, same as ever --- actions (sign
     in / log a result / log a match) above the feed (results / group
     matches). Tablet and up: two real columns side by side, so the page
     uses the width it's been given instead of staying one narrow strip
     with empty margins on either side. */
  @media (min-width: 900px) {
    .group-layout {
      display: grid;
      grid-template-columns: minmax(18rem, 24rem) 1fr;
      align-items: start;
      gap: 2rem;
    }
  }

  .group-match-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    padding: 0.85rem 0.25rem;
    border-bottom: 1px solid var(--border);
  }

  .group-match-row .opponent {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .group-match-row .score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  button {
    font: inherit;
    font-weight: 600;
    padding: 0.65rem 1rem;
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-contrast);
    cursor: pointer;
  }

  button:hover { background: var(--accent-hover); }

  .code-chip {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    background: var(--chip-bg);
    color: var(--chip-text);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
  }

  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border);
  }

  .result-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    padding: 0.85rem 0.25rem;
    border-bottom: 1px solid var(--border);
  }

  .result-row .matchup {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .result-row .game {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
  }

  .result-row .winner { font-weight: 700; }
  .result-row .loser { color: var(--muted); }
  .result-row .when { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }

  .empty {
    color: var(--muted);
    font-style: italic;
    padding: 1rem 0;
  }

  footer.site {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: 1rem 1.25rem 3rem;
    font-size: 0.875rem;
  }

  footer.site a { color: var(--muted); }

  .hero {
    /* Pulls out to cancel main's own padding, so the gradient band spans
       the full content width instead of sitting inset inside it; the
       padding below puts that spacing straight back for the hero's own
       content. */
    margin: -2rem -1.25rem 1rem;
    padding: 2.5rem 1.25rem 2rem;
    border-radius: 0 0 28px 28px;
    background: radial-gradient(ellipse 90% 70% at 50% -10%, color-mix(in srgb, var(--accent) 16%, var(--bg)) 0%, var(--bg) 75%);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: center;
    text-align: center;
  }

  @media (min-width: 900px) {
    .hero-grid { grid-template-columns: 1.1fr 1fr; text-align: left; }
    .hero-content { text-align: left; }
    .hero h1, .hero .lede { margin-inline: 0; }
    .hero-actions { justify-content: flex-start; }
  }

  .hero .logo-mark {
    margin-bottom: 1rem;
    display: inline-flex;
  }

  @media (min-width: 900px) {
    .hero .logo-mark { display: none; } /* the header's own logo is enough once there's a two-column hero */
  }

  .hero h1 {
    font-size: 2rem;
    max-width: 30rem;
    margin-inline: auto;
  }

  @media (min-width: 700px) {
    .hero h1 { font-size: 2.5rem; max-width: 40rem; }
  }

  .hero .lede {
    font-size: 1.05rem;
    max-width: 32rem;
    margin: 0.75rem auto 1.5rem;
  }

  .hero-actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hero-actions .btn-solid, .hero-actions .btn-ghost {
    padding: 0.7rem 1.4rem;
    font-size: 1rem;
  }

  /* The hero's "picture": a crafted preview of the actual product, built
     from the same tokens as the real app rather than a screenshot, so it
     can't go stale when the UI does. Hidden below the two-column breakpoint
     --- a second copy of the same three rows doesn't earn its vertical
     space on a phone the way it does next to the headline on a wide hero. */
  .hero-visual { display: none; }

  @media (min-width: 900px) {
    .hero-visual { display: block; }
  }

  .mockup-window {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-lift);
    overflow: hidden;
    transform: rotate(-1.5deg);
    transition: transform 0.25s ease;
  }

  .mockup-window:hover { transform: rotate(0deg); }

  .mockup-chrome {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--border) 35%, var(--surface));
  }

  .mockup-chrome .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .mockup-chrome .dot-red { background: #f87171; }
  .mockup-chrome .dot-amber { background: #fbbf24; }
  .mockup-chrome .dot-green { background: #4ade80; }

  .mockup-chrome .mockup-url {
    margin-left: 0.5rem;
    font-size: 0.7rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--muted);
  }

  .mockup-body { padding: 1rem; }

  .mockup-live {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #16a34a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }

  .mockup-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--border);
    font-size: 0.85rem;
  }

  .mockup-row:first-of-type { border-top: none; }

  .mockup-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .mockup-row .mockup-game {
    margin-left: auto;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    background: var(--bg);
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    white-space: nowrap;
  }

  .steps {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin: 2.5rem 0;
  }

  @media (min-width: 700px) {
    .steps { grid-template-columns: repeat(3, 1fr); }
  }

  .step {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.25rem;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .step:hover, .feature:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lift);
  }

  .step .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    font-weight: 700;
    font-size: 0.85rem;
    margin-bottom: 0.6rem;
  }

  .step h3 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
  }

  .step p {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .features {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin: 2.5rem 0;
  }

  @media (min-width: 700px) {
    .features { grid-template-columns: repeat(2, 1fr); }
  }

  @media (min-width: 1024px) {
    .features { grid-template-columns: repeat(4, 1fr); }
  }

  .feature {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.25rem;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .feature h3 {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
  }

  .feature p {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .section-heading {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .section-heading h2 {
    margin: 0 0 0.35rem;
  }

  .section-heading p {
    margin: 0;
    color: var(--muted);
  }

  .action-section {
    scroll-margin-top: 1.5rem;
  }

  /* A form this size (name, bio, a 39-tag picker, a photo choice) reads as
     a real page, not a card --- centred and capped narrower than the site's
     usual --page-width so the tag chips wrap into a focused column instead
     of spreading thin across a wide desktop viewport. */
  .new-group-page {
    max-width: 34rem;
    margin: 0 auto;
  }

  .back-link {
    display: inline-block;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    margin-bottom: 1rem;
  }

  .back-link:hover {
    color: var(--accent);
  }
`;

/** A deterministic, theme-independent mark --- app icons stay the same
 * regardless of light/dark, the same way a real app's logo would. Used both
 * inline (header, hero) and as the page favicon (see src/pages.ts). */
export function logoMark(size = 32): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Score's in Check logo">
    <rect width="36" height="36" rx="10" fill="#4f46e5" />
    <path d="M10 19L15.5 24.5L26 12" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

export type IconName = "signin" | "account" | "bolt" | "camera";

// Small hand-drawn line icons (24x24, stroke = currentColor) for the step
// and feature chips --- colored by whatever .icon-chip.c-* class wraps them,
// so the same markup works across every accent color below.
const ICON_PATHS: Record<IconName, string> = {
  signin: `<path d="M9 3H4v18h5M15 12H4m11 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`,
  account: `<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8" fill="none" />
    <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" />
    <path d="M16 13l2 2 4-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`,
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />`,
  camera: `<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.8" fill="none" />
    <circle cx="12" cy="13.5" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none" />
    <path d="M8 7l1.5-2.5h5L16 7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`,
};

export function icon(name: IconName, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

/** A small colored badge holding either an icon or (for "vs") short bold
 * text --- one container, reused for every step/feature so the color is the
 * only thing that varies. */
export function iconChip(content: IconName | "vs", color: "indigo" | "amber" | "teal" | "pink"): string {
  const inner = content === "vs" ? "VS" : icon(content);
  return `<span class="icon-chip c-${color}">${inner}</span>`;
}

function headerEscapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The site header, on every page. Shown here is the whole fix for "it
 * doesn't show I'm logged in": a user's identity used to only ever appear
 * inside one card on one group's page; it's in the shared header now, so it
 * follows you to the home page, every group, and /me alike. */
export function siteHeader(user?: { id: number; name: string }): string {
  const nav = user
    ? `<nav class="site-nav" aria-label="Account">
        <a class="user-chip" href="/me">
          <img class="avatar avatar-sm" src="/users/${user.id}/avatar" alt="${headerEscapeHtml(user.name)}" width="28" height="28" />
          <span>${headerEscapeHtml(user.name)}</span>
        </a>
        <form method="post" action="/logout" style="margin:0">
          <button type="submit" class="btn-ghost">Log out</button>
        </form>
      </nav>`
    : `<nav class="site-nav" aria-label="Account">
        <a class="btn-ghost" href="/login">Log in</a>
        <a class="btn-solid" href="/signup">Sign up</a>
      </nav>`;
  return `<header class="site">
    <div class="brand-row">
      <div class="brand">
        <a class="brand-link" href="/">
          ${logoMark(28)}
          <span class="wordmark">Score's in Check</span>
        </a>
        <span class="tagline">friendly competition, kept honest</span>
      </div>
      ${nav}
    </div>
  </header>`;
}
