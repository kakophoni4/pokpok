import { useId } from "react";
import type { Achievement } from "@poker/contracts";

export function AwardArtwork({ achievement }: { achievement: Achievement }) {
  const id = useId().replace(/:/g, "");
  if (
    achievement.icon?.startsWith("https://") ||
    achievement.icon?.startsWith("/")
  ) {
    return (
      <img
        className="award-artwork"
        src={achievement.icon}
        alt=""
        loading="lazy"
      />
    );
  }
  if (achievement.category === "game") {
    const values =
      achievement.code === "quads"
        ? ["A", "A", "A", "A"]
        : achievement.code === "royal_flush"
          ? ["10", "J", "Q", "K", "A"]
          : achievement.code === "straight_flush"
            ? ["5", "6", "7", "8", "9"]
            : ["A", "K"];
    return (
      <svg className="award-artwork" viewBox="0 0 180 160" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}card`} x2="0.7" y2="1">
            <stop stopColor="#fff8e8" />
            <stop offset="1" stopColor="#bcae8d" />
          </linearGradient>
        </defs>
        {values.map((value, i) => (
          <g
            key={i}
            transform={`translate(${90 + (i - (values.length - 1) / 2) * 23} 86) rotate(${(i - (values.length - 1) / 2) * 9})`}
          >
            <rect
              x="-27"
              y="-51"
              width="54"
              height="88"
              rx="5"
              fill="#030711"
              transform="translate(3 5)"
              opacity=".6"
            />
            <rect
              x="-27"
              y="-51"
              width="54"
              height="88"
              rx="5"
              fill={`url(#${id}card)`}
              stroke="#e9d1a0"
            />
            <text
              x="-20"
              y="-29"
              fontSize="16"
              fontFamily="Georgia"
              fill="#101b30"
            >
              {value}
            </text>
            <path
              d="M0 -18C-8 -10 -18 -4 -18 5a10 10 0 0 0 18 6 10 10 0 0 0 18-6c0-9-10-15-18-23Zm-3 24-4 14H7L3 6Z"
              fill="#101b30"
              transform="translate(0 3) scale(.62)"
            />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg className="award-artwork" viewBox="0 0 180 160" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f1dfad" />
          <stop offset=".28" stopColor="#b89a5f" />
          <stop offset=".55" stopColor="#ead3a0" />
          <stop offset="1" stopColor="#775b2b" />
        </linearGradient>
      </defs>
      <path
        d="m54 17 29 4 7 51-28-6Zm72 0-29 4-7 51 28-6Z"
        fill="#183763"
        stroke="#536788"
      />
      <circle
        cx="90"
        cy="96"
        r="47"
        fill="#050b18"
        stroke="#28364b"
        strokeWidth="4"
      />
      <circle cx="90" cy="92" r="44" fill={`url(#${id}metal)`} />
      <circle cx="90" cy="92" r="37" fill="#18273a" stroke="#e5ca8b" />
      <circle
        cx="90"
        cy="92"
        r="32"
        fill="none"
        stroke="#b49b64"
        strokeDasharray="1 4"
      />
      <path
        d="M90 67c-10 10-22 17-22 29a13 13 0 0 0 22 9 13 13 0 0 0 22-9c0-12-12-19-22-29Zm-3 34-5 17h16l-5-17Z"
        fill={`url(#${id}metal)`}
      />
    </svg>
  );
}
