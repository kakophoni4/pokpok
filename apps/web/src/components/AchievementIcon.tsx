export function AchievementIcon({ icon }: { icon?: string | null }) {
  if (!icon) return null;
  return icon.startsWith("/") || icon.startsWith("https://") ? (
    <img src={icon} alt="" width="24" height="24" className="inline-achievement-icon" loading="lazy" />
  ) : <span aria-hidden>{icon}</span>;
}
