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
              fill={
                achievement.code === "quads" && (i === 1 || i === 2)
                  ? "#9e4149"
                  : "#101b30"
              }
            >
              {value}
            </text>
            <text
              x="0"
              y="15"
              textAnchor="middle"
              fontSize="32"
              fontFamily="Georgia"
              fill={
                achievement.code === "quads" && (i === 1 || i === 2)
                  ? "#9e4149"
                  : "#101b30"
              }
            >
              {achievement.code === "quads"
                ? ["♠", "♥", "♦", "♣"][i]
                : "♠"}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  const key = `${achievement.code} ${achievement.title}`.toLowerCase();
  const art = /win|victory|побед|чемпион/.test(key)
    ? "trophy"
    : /final|legend|финал|легенд|корол/.test(key)
      ? "crown"
      : "medallion";
  return (
    <img
      className="award-artwork"
      src={`/images/award-${art}-v3.webp`}
      alt=""
      loading="lazy"
      width="180"
      height="180"
    />
  );
}
