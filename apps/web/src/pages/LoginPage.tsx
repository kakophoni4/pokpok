import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { TelegramLoginButton } from "../auth/TelegramLoginButton";
import { Button, Card, Loading } from "../components/ui";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "";
const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { status, loginWithTelegramWidget, loginAsDev } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("Ferz");
  const [busy, setBusy] = useState(false);

  const handleTelegram = useCallback(
    (payload: Record<string, unknown>) => {
      setError(null);
      loginWithTelegramWidget(payload)
        .then(() => navigate("/me"))
        .catch((cause: Error) => setError(cause.message));
    },
    [loginWithTelegramWidget, navigate],
  );

  if (status === "loading") return <Loading />;
  if (status === "authenticated") return <Navigate to="/me" replace />;

  return (
    <div className="mx-auto max-w-md">
      <Card className="text-center">
        <span aria-hidden className="text-4xl">
          ♠️
        </span>
        <h1 className="mt-2 text-xl font-semibold">Вход в клуб</h1>
        <p className="mt-1 text-sm text-stone-400">
          Войдите через Telegram — ник подставится автоматически, отдельный пароль не нужен.
        </p>

        <div className="mt-5">
          {BOT_USERNAME ? (
            <TelegramLoginButton botUsername={BOT_USERNAME} onAuth={handleTelegram} />
          ) : (
            <p className="rounded-xl bg-felt-800 px-3 py-2.5 text-sm text-stone-400">
              Вход через Telegram появится, как только в <code>.env</code> будет указан{" "}
              <code>VITE_TELEGRAM_BOT_USERNAME</code>.
            </p>
          )}
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Вход через VK добавляется на следующем этапе — модель данных уже это поддерживает.
        </p>

        {error && <p className="mt-3 text-sm text-chip-red">{error}</p>}
      </Card>

      {IS_DEV && (
        <Card className="mt-4">
          <p className="label">Локальная разработка</p>
          <p className="mb-3 text-xs text-stone-500">
            Вход по нику из демо-данных, без бота. Работает только когда API запущен не в
            production.
          </p>
          <div className="flex gap-2">
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Ник, например Ferz"
              className="field"
            />
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                loginAsDev(nickname)
                  .then(() => navigate("/me"))
                  .catch((cause: Error) => setError(cause.message))
                  .finally(() => setBusy(false));
              }}
            >
              Войти
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Админ: <code>Ferz</code> · организатор: <code>Kate_AA</code> · игрок:{" "}
            <code>Sanya_River</code>
          </p>
        </Card>
      )}
    </div>
  );
}
