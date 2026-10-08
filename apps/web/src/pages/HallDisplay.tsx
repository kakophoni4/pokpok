import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import type { LiveView } from "@poker/contracts";
import { api } from "../lib/api";
import { ClubBrand } from "../components/ClubBrand";
import { Button, ErrorState, Loading } from "../components/ui";
import { DisplayAudio } from "../lib/display-audio";
import {
  clockText,
  cueText,
  DisplayCueTracker,
  projectDisplayClock,
} from "../lib/display-clock";
import "./hall-display.css";

const number = (n: number) => n.toLocaleString("ru-RU");
export function HallDisplayPage() {
  const { id } = useParams(),
    [search] = useSearchParams(),
    token = search.get("token") ?? "";
  const query = useQuery({
    queryKey: ["display", id, token],
    queryFn: () =>
      api.get<LiveView>(
        `/live/display/${id}?token=${encodeURIComponent(token)}`,
      ),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  const [now, setNow] = useState(Date.now),
    [enabled, setEnabled] = useState(false),
    [controls, setControls] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem("concept-tv-volume");
      return v === null ? 0.7 : Math.max(0, Math.min(1, Number(v) || 0));
    } catch {
      return 0.7;
    }
  });
  const [notice, setNotice] = useState<{ text: string; until: number } | null>(
    null,
  );
  const audio = useRef<DisplayAudio | null>(null),
    cues = useRef(new DisplayCueTracker());
  const screen = useRef<HTMLElement>(null);
  const view = query.data;
  const clock = view
    ? projectDisplayClock(view, now, query.dataUpdatedAt)
    : null;
  const fresh = !!view && !query.isError && now - query.dataUpdatedAt < 15000;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(
    () => () => {
      audio.current?.dispose();
      audio.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!clock) return;
    const cue = cues.current.observe(clock, now, fresh);
    if (cue) {
      setNotice({ text: cueText(cue, clock), until: now + 6000 });
      if (enabled) audio.current?.play(cue);
    }
    if (enabled && audio.current && !audio.current.active) setEnabled(false);
  }, [clock, now, fresh, enabled]);
  async function enableAudio() {
    try {
      audio.current ??= new DisplayAudio();
      await audio.current.enable(volume);
      audio.current.play("resume");
      setEnabled(true);
      setAudioError("");
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Звук недоступен");
      setEnabled(false);
    }
  }
  function changeVolume(value: number) {
    setVolume(value);
    audio.current?.volume(value);
    try {
      localStorage.setItem("concept-tv-volume", String(value));
    } catch {
      /* optional setting */
    }
  }
  if (query.isPending)
    return (
      <div className="hall-state">
        <ClubBrand />
        <Loading label="Подключение к турниру" />
      </div>
    );
  if (!view)
    return (
      <div className="hall-state">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  if (!clock || !view.state)
    return (
      <div className="hall-state">
        <ClubBrand />
        <h1>{view.title}</h1>
        <p>Структура турнира ещё не задана</p>
      </div>
    );
  const active = view.state.seats.filter((p) => p.state === "playing");
  const average = active.length
    ? Math.round(active.reduce((sum, p) => sum + p.stack, 0) / active.length)
    : 0;
  const levelNumber = view.state.config.levels
    .slice(0, clock.index + 1)
    .filter((l) => !l.break).length;
  const paused = !clock.running && !clock.complete;
  const handCards = view.handOfDay?.match(/(?:10|[2-9TJQKA])[♠♥♦♣]/gi);
  return (
    <main
      ref={screen}
      className={`hall-display ${clock.level.break ? "hall-break" : ""} ${paused ? "hall-paused" : ""}`}
      data-audio={enabled ? "enabled" : "muted"}
    >
      <header className="hall-header">
        <ClubBrand />
        <div className="hall-event">
          <span>ТУРНИР</span>
          <h1>{view.title}</h1>
        </div>
        <div className="hall-status">
          <i className={fresh ? "" : "offline"} />
          {fresh ? "В ЭФИРЕ" : "НЕТ СВЯЗИ"}
        </div>
      </header>
      <div className="hall-body">
        <section className="hall-clock">
          <div className="hall-level">
            <span>
              {clock.complete
                ? "Турнирная структура завершена"
                : clock.level.break
                  ? "Перерыв"
                  : `Уровень ${String(levelNumber).padStart(2, "0")}`}
            </span>
            <span>
              {paused
                ? "ПАУЗА"
                : clock.level.break
                  ? "ДО ПРОДОЛЖЕНИЯ"
                  : "ДО СЛЕДУЮЩЕГО УРОВНЯ"}
            </span>
          </div>
          <div
            className={`hall-digits ${clock.remaining <= 60 && !clock.complete ? "hall-countdown" : ""}`}
            aria-label={`Осталось ${clockText(clock.remaining)}`}
          >
            {clockText(clock.remaining)}
          </div>
          <div className="hall-progress">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (clock.remaining / clock.level.seconds) * 100))}%`,
              }}
            />
          </div>
          {clock.level.break ? (
            <div className="hall-break-title">Перерыв</div>
          ) : (
            <div className="hall-blinds">
              <div>
                <span>Малый блайнд</span>
                <strong>{number(clock.level.small)}</strong>
              </div>
              <div>
                <span>Большой блайнд</span>
                <strong>{number(clock.level.big)}</strong>
              </div>
              <div>
                <span>Анте</span>
                <strong>{number(clock.level.big)}</strong>
              </div>
            </div>
          )}
          <div className="hall-next">
            <div>
              <span>Далее</span>
              <strong>
                {clock.next
                  ? clock.next.break
                    ? `Перерыв · ${clock.next.seconds / 60} мин`
                    : `${number(clock.next.small)} / ${number(clock.next.big)} / ${number(clock.next.big)}`
                  : "Конец структуры"}
              </strong>
            </div>
            <div>
              <span>{clock.level.break ? "Начало игры" : "До перерыва"}</span>
              <strong>
                {clock.level.break
                  ? clockText(clock.remaining)
                  : clock.untilBreak === null
                    ? "-"
                    : clockText(clock.untilBreak)}
              </strong>
            </div>
          </div>
        </section>
        <aside className="hall-sidebar">
          <div className="hall-ranking">
            <div className="hall-section-title">
              <span>Рейтинг сезона</span>
              <span>ТОП {Math.min(8, view.leaderboard.length)}</span>
            </div>
            <ol>
              {view.leaderboard.slice(0, 8).map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{p.name}</strong>
                  <b>{number(p.points)}</b>
                </li>
              ))}
            </ol>
            {!view.leaderboard.length && (
              <p className="hall-empty">Результатов пока нет</p>
            )}
          </div>
          <div className="hall-hand">
            <div>
              <span className="hall-section-title">Рука дня</span>
              {!handCards?.length && (
                <strong>{view.handOfDay || "Не задана"}</strong>
              )}
            </div>
            {!!handCards?.length && (
              <div className="hall-cards">
                {handCards.map((card, i) => (
                  <span key={i} className={/[♥♦]/.test(card) ? "red" : ""}>
                    {card.slice(0, -1)}
                    <b>{card.slice(-1)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
      <footer className="hall-stats">
        <div>
          <span>В игре</span>
          <strong>
            {active.length}
            <small> / {view.state.seats.length}</small>
          </strong>
        </div>
        <div>
          <span>Средний стек</span>
          <strong>{number(average)}</strong>
        </div>
        <div>
          <span>Столов открыто</span>
          <strong>{view.state.tables.filter((t) => t.open).length}</strong>
        </div>
        <div>
          <span>Призовых мест</span>
          <strong>{view.paidPlaces ?? "-"}</strong>
        </div>
      </footer>
      {notice && notice.until > now && (
        <div className="hall-notice" role="status">
          {notice.text}
        </div>
      )}
      <div className="hall-control-toggle">
        <button
          onClick={() => setControls(!controls)}
          aria-expanded={controls}
          aria-label="Настройки экрана"
        >
          {enabled ? "Звук включён" : "Звук выключен"} · Настройки
        </button>
      </div>
      {controls && (
        <section className="hall-controls" aria-label="Настройки экрана">
          <h2>Экран турнира</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (enabled) {
                  setEnabled(false);
                  audio.current?.stop();
                } else void enableAudio();
              }}
            >
              {enabled ? "Выключить звук" : "Включить звук"}
            </Button>
            <Button
              variant="secondary"
              disabled={!enabled}
              onClick={() => audio.current?.play("minute")}
            >
              Проверить
            </Button>
          </div>
          <label>
            Громкость
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
            />
          </label>
          <p>
            За 1 минуту и 10 секунд до смены уровня, при перерыве, паузе и
            продолжении.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void screen.current
                  ?.requestFullscreen()
                  .catch(() => setAudioError("Полноэкранный режим недоступен"));
            }}
          >
            Во весь экран
          </Button>
          {audioError && <p role="alert">{audioError}</p>}
          <button
            className="hall-close"
            onClick={() => setControls(false)}
            aria-label="Закрыть настройки"
          >
            ×
          </button>
        </section>
      )}
    </main>
  );
}
