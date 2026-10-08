import type { Achievement } from "@poker/contracts";
import { defaultAwardArt } from "../lib/award-art";

export function AwardArtwork({ achievement }: { achievement: Achievement }) {
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
    const cards = achievement.code === "quads"
      ? ["A", "A", "A", "A"]
      : achievement.code === "royal_flush"
        ? ["10", "J", "Q", "K", "A"]
        : achievement.code === "straight_flush"
          ? ["5", "6", "7", "8", "9"]
          : [null, null];
    const start = (336 - (cards.length * 56 + (cards.length - 1) * 10)) / 2;
    return (
      <svg className="award-artwork combination-artwork" viewBox="0 0 336 126" aria-hidden="true">
        {cards.map((rank, index) => {
          const suit = achievement.code === "quads" ? index : 0;
          const color = suit === 1 || suit === 2 ? "#a63343" : "#122039";
          return (
            <g key={index} transform={`translate(${start + index * 66} 12)`}>
              <rect x="1" y="4" width="56" height="94" rx="5" fill="#030811" opacity=".5" />
              <rect width="56" height="94" rx="5" fill={rank ? "#f3f0e7" : "#162c49"} stroke={rank ? "#cec7b7" : "#b9a275"} />
              {rank ? (
                <>
                  <text x="7" y="21" fontFamily="Manrope, sans-serif" fontSize="16" fontWeight="700" fill={color}>{rank}</text>
                  <g transform="translate(6 25) scale(.43)"><CardSuit suit={suit} color={color} /></g>
                  <g transform="translate(16 38)"><CardSuit suit={suit} color={color} /></g>
                  <g transform="translate(49 74) rotate(180)">
                    <text x="0" y="0" fontFamily="Manrope, sans-serif" fontSize="16" fontWeight="700" fill={color}>{rank}</text>
                  </g>
                </>
              ) : (
                <>
                  <rect x="5" y="5" width="46" height="84" rx="2" fill="none" stroke="#b9a275" opacity=".65" />
                  <path d="M28 13 48 47 28 81 8 47Z" fill="none" stroke="#b9a275" opacity=".45" />
                  <g transform="translate(16 35)"><CardSuit suit={0} color="#cfb680" /></g>
                </>
              )}
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <img
      className="award-artwork"
      src={defaultAwardArt(achievement)}
      alt=""
      loading="lazy"
      width="180"
      height="180"
    />
  );
}

function CardSuit({ suit, color }: { suit: number; color: string }) {
  const paths = [
    "M12 0C9 5 0 10 0 16a7 7 0 0 0 10 6c0 3-1 5-4 7h12c-3-2-4-4-4-7a7 7 0 0 0 10-6C24 10 15 5 12 0Z",
    "M12 27 2 15C-5 6 6-3 12 5c6-8 17 1 10 10Z",
    "M12 0 24 14 12 28 0 14Z",
    "M12 0a6 6 0 0 0-5 10 7 7 0 1 0 3 12c0 3-1 5-4 7h12c-3-2-4-4-4-7a7 7 0 1 0 3-12A6 6 0 0 0 12 0Z",
  ];
  return <path d={paths[suit]} fill={color} />;
}
