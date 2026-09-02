import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { PlayerProfile } from "../components/PlayerProfile";
import { Badge, Button, ErrorState, Loading } from "../components/ui";
import { useMyPrizes, useMyStats, useUserAchievements } from "../lib/queries";

export function ProfilePage() {
  const { user, status, signingIn, logout, can } = useAuth();
  const navigate = useNavigate();
  const stats = useMyStats(status === "authenticated");
  const achievements = useUserAchievements(user?.id);
  const prizes = useMyPrizes(status === "authenticated");

  if (status === "loading") return <Loading />;
  if (status === "anonymous") {
    if (signingIn) return <Loading label="Входим через Telegram…" />;
    return <Navigate to="/login" replace />;
  }
  if (stats.isPending) return <Loading label="Собираем статистику…" />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  if (!stats.data || !user) return null;

  return (
    <>
      <PlayerProfile
        stats={stats.data}
        achievements={achievements.data}
        wallet={prizes.data}
        canRevoke={can("hostess")}
        extra={
          <div className="mt-4 space-y-3 border-t border-felt-800 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
              <span>Привязано:</span>
              {user.identities.length === 0 && <span className="text-stone-500">ничего</span>}
              {user.identities.map((identity) => (
                <Badge key={identity.provider} tone="blue">
                  {identity.provider === "telegram" ? "Telegram" : "VK"}
                  {identity.username && ` · @${identity.username}`}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void logout().then(() => navigate("/"));
                }}
              >
                Выйти
              </Button>
            </div>
          </div>
        }
      />
    </>
  );
}
