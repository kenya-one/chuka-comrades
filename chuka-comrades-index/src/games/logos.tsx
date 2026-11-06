export const EFOOTBALL_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/e/ee/EFootball_logo.svg";

export function EfootballLogo() {
  return <img className="gm-logo-img" src={EFOOTBALL_LOGO_URL} alt="eFootball logo" />;
}

/** Pool has no single official brand mark, so this is a classic 8-ball emblem. Replace with your own image if you have one. */
export function PoolLogo() {
  return (
    <svg className="gm-logo-img" viewBox="0 0 64 64" role="img" aria-label="Pool logo">
      <circle cx="32" cy="32" r="30" fill="#14181f" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#c8202f" strokeWidth="3" />
      <circle cx="32" cy="32" r="15" fill="#fff" />
      <text x="32" y="39.5" textAnchor="middle" fontSize="21" fontWeight="800" fontFamily="Arial,sans-serif" fill="#14181f">8</text>
      <ellipse cx="22" cy="17" rx="7" ry="4" fill="#ffffff55" transform="rotate(-35 22 17)" />
    </svg>
  );
}
