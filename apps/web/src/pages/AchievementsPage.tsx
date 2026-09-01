import { useAuth } from "../auth/auth-context";
import { Badge, EmptyState, ErrorState, Loading, PageHeader, cx } from "../components/ui";
import { formatPoints, plural } from "../lib/format";
import { useAchievements, useUserAchievements } from "../lib/queries";

export function AchievementsPage() {
  const { user } = useAuth();
  const catalogue = useAchievements();
  const mine = useUserAchievements(user?.id);

  const ownedCodes = new Set(mine.data?.map((granted) => granted.achievement.code) ?? []);

  return (
    <>
      <PageHeader
        title="Достижения"
        subtitle={
          user
            ? `У вас ${ownedCodes.size} из ${catalogue.data?.length ?? 0}`
            : "За что клуб начисляет дополнительный рейтинг"
        }
      />

      {catalogue.isPending && <Loading />}
      {catalogue.isError && (
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      )}
      {catalogue.data?.length === 0 && (
        <EmptyState
          title="Ачивок пока нет"
          description="Администратор может создать их в разделе «Админ» - название, описание и сколько рейтинга они дают."
        />
      )}

      {catalogue.data && catalogue.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {catalogue.data.map((achievement) => {
            const owned = ownedCodes.has(achievement.code);
            return (
              <li
                key={achievement.id}
                className={cx(
                  "card grid min-h-[7.5rem] grid-cols-[auto_1fr_auto] items-center gap-3 p-4",
                  owned ? "border-gold-500/35 bg-gold-500/5" : "opacity-90",
                )}
              >
                <span aria-hidden className={cx("w-10 text-center text-3xl leading-none", !owned && "grayscale")}>
                  {achievement.icon ?? "🏅"}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{achievement.title}</h3>
                    {owned && <Badge tone="gold">получено</Badge>}
                  </div>

                  <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-stone-300">
                    {achievement.description || "\u00a0"}
                  </p>

                  <p className="mt-1 min-h-5 text-sm text-stone-400">
                    {achievement.holdersCount != null && achievement.holdersCount > 0
                      ? `${achievement.holdersCount} ${plural(achievement.holdersCount, "игрок", "игрока", "игроков")} уже получили`
                      : "\u00a0"}
                  </p>
                </div>

                <span className="nums shrink-0 self-center font-semibold text-gold-400">
                  {formatPoints(achievement.ratingPoints)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
