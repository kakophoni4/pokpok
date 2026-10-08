import { useAuth } from "../auth/auth-context";
import { AwardArtwork } from "../components/AwardArtwork";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  cx,
} from "../components/ui";
import { formatPoints } from "../lib/format";
import { useAchievements, useUserAchievements } from "../lib/queries";

export function AchievementsPage() {
  const { user } = useAuth();
  const catalogue = useAchievements();
  const mine = useUserAchievements(user?.id);

  const ownedCodes = new Set(
    mine.data?.map((granted) => granted.achievement.code) ?? [],
  );

  return (
    <>
      <PageHeader
        title="Достижения"
        subtitle={
          user
            ? `У вас ${ownedCodes.size} из ${catalogue.data?.length ?? 0}`
            : ""
        }
      />

      {catalogue.isPending && <Loading />}
      {catalogue.isError && (
        <ErrorState
          error={catalogue.error}
          onRetry={() => void catalogue.refetch()}
        />
      )}
      {catalogue.data?.length === 0 && (
        <EmptyState title="Ачивок пока нет" description="" />
      )}

      {catalogue.data && catalogue.data.length > 0 && (
        <div className="space-y-10">
          {(["club", "game"] as const).map((category) => (
            <section key={category}>
              <h2 className="text-xl font-semibold border-b border-white/10 pb-4 mb-5">
                {category === "club" ? "Клубные награды" : "Игровые комбинации"}
              </h2>
              <ul className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 py-3">
                {catalogue.data
                  .filter((a) => a.category === category)
                  .map((achievement) => {
                    const owned = ownedCodes.has(achievement.code);
                    const count =
                      mine.data?.filter(
                        (a) => a.achievement.code === achievement.code,
                      ).length ?? 0;
                    return (
                      <li
                        key={achievement.id}
                        className={cx(
                          "flex flex-col items-center text-center min-w-0",
                          !owned && "achievement-locked",
                        )}
                      >
                        <AwardArtwork achievement={achievement} />
                        <h3 className="mt-3 text-sm font-medium leading-5 min-h-10">
                          {achievement.title}
                        </h3>
                        <p className="mt-1 text-xs text-stone-400 leading-5 line-clamp-3 min-h-[3.75rem]">
                          {achievement.description}
                        </p>
                        <span className="mt-2 text-sm tabular-nums text-gold-400 border-t border-white/10 pt-2 w-16">
                          {formatPoints(achievement.ratingPoints)}
                        </span>
                        <span className="text-xs text-stone-400 mt-1">
                          {owned ? `Получено ${count}` : "Не получено"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
