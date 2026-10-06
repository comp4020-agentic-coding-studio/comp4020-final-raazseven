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
    }
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.55;
  }

  header.site {
    border-bottom: 1px solid var(--border);
    padding: 1rem 1.25rem;
  }

  header.site .brand {
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  header.site a {
    color: var(--text);
    text-decoration: none;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: -0.01em;
  }

  header.site .tagline {
    color: var(--muted);
    font-size: 0.875rem;
  }

  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
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
  }

  .cards-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 480px) {
    .cards-row { grid-template-columns: 1fr; }
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
  }

  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
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
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
    max-width: 40rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 3rem;
    font-size: 0.875rem;
  }

  footer.site a { color: var(--muted); }
`;

export const siteHeader = `<header class="site">
  <div class="brand">
    <a href="/">Score's in Check</a>
    <span class="tagline">friendly competition, kept honest</span>
  </div>
</header>`;
