import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { TelegramLoginButton } from "../auth/TelegramLoginButton";
import { useTelegramLogin } from "../auth/useTelegramLogin";
import { Button, Card, Loading } from "../components/ui";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "";
const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { status, loginWithTelegramWidget, loginAsDev } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("Ferz");
  const [busy, setBusy] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const telegram = useTelegramLogin(status === "anonymous");

  const handleWidget = useCallback(
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
          Открываем бота, вы подтверждаете вход одной кнопкой — ни пароля, ни номера телефона.
        </p>

        <div className="mt-5">
          {telegram.phase === "waiting" ? (
            <Waiting login={telegram} />
          ) : telegram.phase === "declined" ? (
            <Retry
              title="Вход отклонён в Telegram"
              hint="Если это были не вы — всё в порядке, в аккаунт никто не попал."
              onRetry={telegram.restart}
            />
          ) : telegram.phase === "expired" ? (
            <Retry
              title="Время на подтверждение вышло"
              hint="Ссылка живёт пять минут, чтобы её нельзя было использовать позже."
              onRetry={telegram.restart}
            />
          ) : telegram.phase === "error" ? (
            <Retry
              title="Не удалось начать вход"
              hint={telegram.error ?? "Попробуйте ещё раз."}
              onRetry={telegram.restart}
            />
          ) : (
            <a
              href={telegram.ticket?.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              onClick={telegram.follow}
              aria-disabled={telegram.ticket == null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2AABEE] px-4 py-3 font-semibold text-white transition hover:brightness-110 aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              Войти через Telegram
            </a>
          )}
        </div>

        {BOT_USERNAME && telegram.phase !== "waiting" && (
          <div className="mt-4">
            {showWidget ? (
              <TelegramLoginButton botUsername={BOT_USERNAME} onAuth={handleWidget} />
            ) : (
              <button
                type="button"
                onClick={() => setShowWidget(true)}
                className="text-xs text-stone-500 underline decoration-dotted"
              >
                Войти по номеру телефона
              </button>
            )}
          </div>
        )}

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
            Админы: <code>Ferz</code>, <code>Kate_AA</code> · игрок: <code>Sanya_River</code>
          </p>
        </Card>
      )}
    </div>
  );
}

/** The phrase is the whole point of this screen: the bot asks for a match. */
function Waiting({ login }: { login: ReturnType<typeof useTelegramLogin> }) {
  return (
    <div>
      <p className="text-sm text-stone-300">Подтвердите вход в Telegram</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-stone-500">Кодовая фраза</p>
      <p className="text-lg font-semibold text-gold-400">{login.ticket?.phrase}</p>
      <p className="mt-3 text-xs text-stone-500">
        Бот покажет эту же фразу. Совпадает — нажимайте «Это я».
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href={login.ticket?.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-chip-blue underline"
        >
          Открыть бота ещё раз
        </a>
        <button
          type="button"
          onClick={login.restart}
          className="text-xs text-stone-500 underline decoration-dotted"
        >
          Начать заново
        </button>
      </div>
    </div>
  );
}

function Retry({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-stone-200">{title}</p>
      <p className="mt-1 text-xs text-stone-500">{hint}</p>
      <Button className="mt-3 w-full" onClick={onRetry}>
        Попробовать снова
      </Button>
    </div>
  );
}
