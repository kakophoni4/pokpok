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
    const photographs: Record<string, string> = {
      royal_flush: "royal-flush-v1",
      straight_flush: "straight-flush-v1",
      quads: "quads-v1",
      hand_of_day: "hand-of-day-v1",
    };
    return (
      <img
        className="award-artwork combination-artwork combination-photo"
        src={`/images/combinations/${photographs[achievement.code] ?? "hand-of-day-v1"}.webp`}
        alt=""
        loading="lazy"
        width="960"
        height="640"
      />
    );
  }  return (
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

