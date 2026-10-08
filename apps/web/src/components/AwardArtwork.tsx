import type { Achievement } from "@poker/contracts";
import { defaultAwardArt, resolveAwardArt } from "../lib/award-art";

export function AwardArtwork({ achievement }: { achievement: Achievement }) {
  if (
    achievement.icon?.startsWith("https://") ||
    achievement.icon?.startsWith("/")
  ) {
    return (
      <img
        className="award-artwork"
        src={resolveAwardArt(achievement.icon)}
        alt=""
        loading="lazy"
      />
    );
  }
  if (achievement.category === "game") {
    const photographs: Record<string, string> = {
      royal_flush: "royal-flush-cutout-v2",
      straight_flush: "straight-flush-cutout-v2",
      quads: "quads-cutout-v2",
      hand_of_day: "hand-of-day-cutout-v2",
    };
    return (
      <img
        className="award-artwork combination-artwork combination-photo"
        src={`/images/combinations/${photographs[achievement.code] ?? "hand-of-day-cutout-v2"}.webp`}
        alt=""
        loading="lazy"
        width="960"
        height="640"
      />
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

