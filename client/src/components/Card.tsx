import type { CardKind } from "withfire-engine";

export type CardFaceKind = CardKind | "back";

/** Petal rose for the Flower card. */
function FlowerArt() {
  return (
    <svg viewBox="0 0 80 112" className="card-art" aria-hidden>
      <defs>
        <radialGradient id="fl-bg" cx="50%" cy="38%" r="80%">
          <stop offset="0%" stopColor="#fff7ea" />
          <stop offset="100%" stopColor="#f3e0c0" />
        </radialGradient>
        <radialGradient id="fl-petal" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffd9e8" />
          <stop offset="100%" stopColor="#e76aa2" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="76" height="108" rx="9" fill="url(#fl-bg)" />
      <rect x="5.5" y="5.5" width="69" height="101" rx="6.5" fill="none" stroke="#c8a065" strokeWidth="1.4" opacity="0.8" />
      <g transform="translate(40,50)">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="0" cy="-13.5" rx="9.5" ry="15"
            fill="url(#fl-petal)"
            stroke="#b34d7d" strokeWidth="0.8"
            transform={`rotate(${deg})`}
            opacity="0.95"
          />
        ))}
        <circle r="8" fill="#f7b733" stroke="#c98908" strokeWidth="1.2" />
        <circle r="3.4" fill="#fde8a8" />
      </g>
      <path d="M40 64 C 38 78, 42 84, 40 96" fill="none" stroke="#5b8f4e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 78 q -9 -2 -12 -9 q 10 -1 12 9 Z" fill="#6da55c" />
      <path d="M40 86 q 9 -2 12 -9 q -10 -1 -12 9 Z" fill="#6da55c" />
      <circle cx="14" cy="16" r="2.2" fill="#c8a065" opacity="0.7" />
      <circle cx="66" cy="16" r="2.2" fill="#c8a065" opacity="0.7" />
      <circle cx="14" cy="96" r="2.2" fill="#c8a065" opacity="0.7" />
      <circle cx="66" cy="96" r="2.2" fill="#c8a065" opacity="0.7" />
    </svg>
  );
}

/** Flame for the Fire card. */
function FireArt() {
  return (
    <svg viewBox="0 0 80 112" className="card-art" aria-hidden>
      <defs>
        <radialGradient id="fi-bg" cx="50%" cy="42%" r="85%">
          <stop offset="0%" stopColor="#3a1610" />
          <stop offset="100%" stopColor="#190705" />
        </radialGradient>
        <linearGradient id="fi-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff4d00" />
          <stop offset="55%" stopColor="#ff9a1f" />
          <stop offset="100%" stopColor="#ffe27a" />
        </linearGradient>
        <linearGradient id="fi-core" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffb45e" />
          <stop offset="100%" stopColor="#fff3c4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="76" height="108" rx="9" fill="url(#fi-bg)" />
      <rect x="5.5" y="5.5" width="69" height="101" rx="6.5" fill="none" stroke="#8a3c1c" strokeWidth="1.4" opacity="0.9" />
      <g>
        <path
          d="M40 18 c 5 14 -13 18 -9 33 2.5 8.5 9 11.5 9 11.5 s -3 -7.5 1.5 -12.5 c 4.5 -5 8 -10.5 6 -17 8.5 4.5 15 16 13 28.5 C 58.5 74 50 80.5 40 80.5 S 22 74.5 21.5 61.5 C 21 47 33.5 32 40 18 Z"
          fill="url(#fi-flame)"
          stroke="#7c2d0b" strokeWidth="1"
        />
        <path
          d="M40 50 c 3 7 -5.5 9 -3.5 16 1 3.8 3.5 5.5 3.5 5.5 s 6 -2.5 7 -8.5 c 0.8 -5 -2 -9.5 -7 -13 Z"
          fill="url(#fi-core)"
          opacity="0.95"
        />
      </g>
      <circle cx="14" cy="16" r="2.2" fill="#8a3c1c" opacity="0.9" />
      <circle cx="66" cy="16" r="2.2" fill="#8a3c1c" opacity="0.9" />
      <circle cx="14" cy="96" r="2.2" fill="#8a3c1c" opacity="0.9" />
      <circle cx="66" cy="96" r="2.2" fill="#8a3c1c" opacity="0.9" />
    </svg>
  );
}

/** Ornate card back. */
function BackArt() {
  return (
    <svg viewBox="0 0 80 112" className="card-art" aria-hidden>
      <defs>
        <radialGradient id="bk-bg" cx="50%" cy="40%" r="90%">
          <stop offset="0%" stopColor="#4a1d12" />
          <stop offset="100%" stopColor="#220c08" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="76" height="108" rx="9" fill="url(#bk-bg)" />
      <rect x="6" y="6" width="68" height="100" rx="6" fill="none" stroke="#b06a2e" strokeWidth="1.6" opacity="0.75" />
      <rect x="10" y="10" width="60" height="92" rx="4" fill="none" stroke="#b06a2e" strokeWidth="0.8" opacity="0.45" />
      <g transform="translate(40,56)" opacity="0.92">
        <path
          d="M0 -16 c 3.2 8.5 -7.5 10.5 -5 19 1.5 5 5 6.5 5 6.5 s -1.8 -4.3 0.8 -7 c 2.7 -2.9 4.6 -6 3.4 -9.7 5 2.6 8.6 9.2 7.4 16.3 C 10.4 12.6 5.6 16.5 0 16.5 S -10.8 13 -11.2 5.6 C -11.6 -2.6 -3.8 -8 0 -16 Z"
          fill="#d8762b"
        />
      </g>
      <path d="M40 14 l 4 5 -4 5 -4 -5 Z" fill="#b06a2e" opacity="0.7" />
      <path d="M40 88 l 4 5 -4 5 -4 -5 Z" fill="#b06a2e" opacity="0.7" />
    </svg>
  );
}

export function CardFace({
  kind,
  flipped,
  size = "md",
  onClick,
  pulse,
  title,
}: {
  kind: CardFaceKind;
  /** When set, renders a 3D flip from back → face. */
  flipped?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  pulse?: boolean;
  title?: string;
}) {
  const face = kind === "fire" ? <FireArt /> : <FlowerArt />;
  const interactive = !!onClick;

  if (kind === "back" && flipped === undefined) {
    return (
      <div
        className={`card card-${size} ${interactive ? "card-tap" : ""} ${pulse ? "card-pulse" : ""}`}
        onClick={onClick}
        role={interactive ? "button" : undefined}
        title={title}
      >
        <BackArt />
      </div>
    );
  }

  return (
    <div
      className={`card card-${size} card-3d ${flipped ? "is-flipped" : ""} ${interactive ? "card-tap" : ""} ${pulse ? "card-pulse" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      title={title}
    >
      <div className="card-3d-inner">
        <div className="card-3d-back"><BackArt /></div>
        <div className={`card-3d-face ${kind === "fire" ? "face-fire" : "face-flower"}`}>{face}</div>
      </div>
    </div>
  );
}
