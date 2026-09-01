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
          description="Администратор может создать их в разделе «Админ» — название, описание и сколько рейтинга они дают."
        />
      )}

      {catalogue.data && catalogue.data.length > 0 && (
        <ul className="space-y-2">
          {catalogue.data.map((achievement) => {
            const owned = ownedCodes.has(achievement.code);
            return (
              <li
                key={achievement.id}
                className={cx(
                  "card flex items-start gap-3 p-4 transition",
                  owned ? "border-gold-500/30 bg-gold-500/5" : "opacity-90",
                )}
              >
                <span aria-hidden className={cx("text-3xl leading-none", !owned && "grayscale")}>
                  {achievement.icon ?? "🏅"}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{achievement.title}</h3>
                    {owned && <Badge tone="gold">получено</Badge>}
                  </div>

                  {achievement.description && (
                    <p className="mt-1 text-sm text-stone-400">{achievement.description}</p>
                  )}

                  {achievement.holdersCount != null && achievement.holdersCount > 0 && (
                    <p className="mt-1 text-xs text-stone-500">
                      {achievement.holdersCount}{" "}
                      {plural(achievement.holdersCount, "игрок", "игрока", "игроков")} уже получили
                    </p>
                  )}
                </div>

                <span className="nums shrink-0 font-semibold text-gold-400">
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
