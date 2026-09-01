import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { PlayerProfile } from "../components/PlayerProfile";
import { ErrorState, Loading } from "../components/ui";
import { usePlayerStats, useUserAchievements } from "../lib/queries";

export function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const stats = usePlayerStats(id);
  const achievements = useUserAchievements(id);

  if (stats.isPending) return <Loading />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  if (!stats.data) return null;

  return (
    <>
      <Link to="/rating" className="mb-3 inline-block text-sm text-stone-400 hover:text-stone-200">
        ← К рейтингу
      </Link>
      <PlayerProfile
        stats={stats.data}
        achievements={achievements.data}
        canRevoke={can("hostess")}
      />
    </>
  );
}
