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
        title="Награды клуба"
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
            <section
              key={category}
              className={`award-section award-section-${category}`}
            >
              <h2 className="section-heading award-section-heading">
                {category === "club" ? "Клубные награды" : "Игровые комбинации"}
              </h2>
              <ul className="award-gallery">
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
                          "award-tile flex flex-col items-center text-center min-w-0",
                          user && !owned && "achievement-locked",
                        )}
                      >
                        <AwardArtwork achievement={achievement} />
                        <h3 className="mt-3 text-sm font-medium leading-5 ">
                          {achievement.title}
                        </h3>
                        <p className="mt-1 text-xs text-stone-400 leading-5 ">
                          {achievement.description}
                        </p>
                        {achievement.ratingPoints !== 0 && (
                          <span className="award-points mt-2 text-sm tabular-nums text-gold-400 border-t border-white/10 pt-2 w-16">
                            {formatPoints(achievement.ratingPoints)}
                          </span>
                        )}
                        <span className="text-xs text-stone-400 mt-1">
                          {owned
                            ? `Получено ${count}`
                            : user
                              ? "Не получено"
                              : ""}
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
