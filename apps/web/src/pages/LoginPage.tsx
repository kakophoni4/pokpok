import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useTelegramLogin } from "../auth/useTelegramLogin";
import { Button, Card, Loading } from "../components/ui";
import { platform } from "../platform/platform";

const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { status, signingIn, loginAsDev, loginWithMiniApp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("Ferz");
  const [busy, setBusy] = useState(platform.isEmbedded);
  const [agreed, setAgreed] = useState(platform.isEmbedded);
  const telegram = useTelegramLogin(status === "anonymous" && !platform.isEmbedded);

  useEffect(() => {
    if (status !== "anonymous") return;
    if (!platform.isEmbedded && !platform.telegramInitData()) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    loginWithMiniApp()
      .then(() => {
        if (!cancelled) navigate("/", { replace: true });
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, loginWithMiniApp, navigate]);

  if (status === "loading" || (status === "anonymous" && signingIn && busy && !error)) {
    return <Loading label="Входим через Telegram…" />;
  }
  if (status === "authenticated") return <Navigate to="/" replace />;

  // Inside Telegram there is no widget to fall back to, so a failed hand-off
  // needs a button of its own rather than a spinner that says "trying" forever.
  if (platform.isEmbedded) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="space-y-3 p-5 text-center">
          <h1 className="text-xl font-semibold">Вход из Telegram</h1>
          <p className="text-sm text-stone-400">
            Telegram не передал данные входа. Закройте клуб полностью и откройте его из меню бота.
          </p>
          {error && <p className="text-sm text-chip-red">{error}</p>}
          <Button
            className="w-full"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              loginWithMiniApp()
                .then(() => navigate("/", { replace: true }))
                .catch((cause: Error) => setError(cause.message))
                .finally(() => setBusy(false));
            }}
          >
            Попробовать снова
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="overflow-hidden p-0 text-center">
        {/* The photo's own aspect ratio, so the four aces are never cropped. */}
        <div
          className="aspect-[16/9] bg-cover bg-center"
          style={{ backgroundImage: "url(/images/login-hero.jpg)" }}
          aria-hidden
        />
        <div className="p-5">
          <h1 className="text-xl font-semibold">Вход в клуб</h1>

          <label className="mt-4 flex items-start gap-2 text-left text-sm text-stone-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              Принимаю{" "}
              <Link to="/rules" className="text-gold-400 underline">
                правила клуба
              </Link>
            </span>
          </label>

          <div className="mt-5">
            {!agreed ? (
              <Button className="w-full" disabled>
                Войти через Telegram
              </Button>
            ) : telegram.phase === "waiting" ? (
              <Waiting login={telegram} />
            ) : telegram.phase === "declined" ? (
              <Retry
                title="Вход отклонён в Telegram"
                hint="Если это были не вы - всё в порядке, в аккаунт никто не попал."
                onRetry={telegram.restart}
              />
            ) : telegram.phase === "expired" ? (
              <Retry
                title="Время на подтверждение вышло"
                hint="Ссылка живёт пять минут."
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

          {error && <p className="mt-3 text-sm text-chip-red">{error}</p>}
        </div>
      </Card>

      {IS_DEV && (
        <Card className="mt-4">
          <p className="label">Локальная разработка</p>
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
        </Card>
      )}
    </div>
  );
}

function Waiting({ login }: { login: ReturnType<typeof useTelegramLogin> }) {
  return (
    <div>
      <p className="text-sm text-stone-300">Подтвердите вход в Telegram</p>
      <p className="mt-3 text-sm text-stone-400">Кодовая фраза</p>
      <p className="text-lg font-semibold text-gold-400">{login.ticket?.phrase}</p>
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
