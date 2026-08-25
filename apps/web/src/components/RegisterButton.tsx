import type { TournamentSummary } from "@poker/contracts";
import { REGISTRABLE_STATUSES } from "@poker/contracts";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useCancelRegistration, useRegister } from "../lib/queries";
import { platform } from "../platform/platform";
import { Button } from "./ui";

/**
 * Sign-up control shared by the schedule and the tournament page, so the rules
 * about who may register and when live in exactly one place on the client.
 */
export function RegisterButton({ tournament }: { tournament: TournamentSummary }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const register = useRegister(tournament.id);
  const cancel = useCancelRegistration(tournament.id);

  const registration = tournament.myRegistration;
  const isSignedUp = Boolean(registration && registration.status !== "cancelled");
  const registrationOpen = REGISTRABLE_STATUSES.includes(tournament.status);
  const closesAt = tournament.regClosesAt ? new Date(tournament.regClosesAt) : null;
  const tooLate = closesAt != null && closesAt < new Date();

  if (!user) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => navigate("/login")}>
        Войти, чтобы записаться
      </Button>
    );
  }

  if (isSignedUp) {
    return (
      <div className="space-y-1.5">
        <Button
          variant="ghost"
          className="w-full"
          loading={cancel.isPending}
          onClick={() => {
            platform.haptic("tap");
            cancel.mutate();
          }}
        >
          Отменить запись
        </Button>
        {cancel.isError && (
          <p className="text-xs text-chip-red">{(cancel.error as Error).message}</p>
        )}
      </div>
    );
  }

  if (!registrationOpen || tooLate) {
    return (
      <Button variant="secondary" className="w-full" disabled>
        Запись закрыта
      </Button>
    );
  }

  const isFull =
    tournament.capacity != null && tournament.registeredCount >= tournament.capacity;

  return (
    <div className="space-y-1.5">
      <Button
        className="w-full"
        variant={isFull ? "secondary" : "primary"}
        loading={register.isPending}
        onClick={() => {
          register.mutate(platform.isEmbedded ? "miniapp" : "web", {
            onSuccess: (result) =>
              platform.haptic(result.status === "waitlist" ? "tap" : "success"),
            onError: () => platform.haptic("error"),
          });
        }}
      >
        {isFull ? "Встать в лист ожидания" : "Записаться"}
      </Button>
      {register.isError && (
        <p className="text-xs text-chip-red">{(register.error as Error).message}</p>
      )}
    </div>
  );
}
