import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Loading } from "../../components/ui";
import { useClubSettings, useUpdateClubSettings } from "../../lib/queries";

/**
 * Club settings: the text behind the bot's «как нас найти» button, the prices the
 * cash desk offers as buttons, and the timezone every date is rendered in.
 */
export function AdminSettings() {
  const settings = useClubSettings(true);
  const save = useUpdateClubSettings();

  const [infoText, setInfoText] = useState("");
  const [entryPriceRub, setEntry] = useState(500);
  const [rebuyPriceRub, setRebuy] = useState(500);
  const [addonPriceRub, setAddon] = useState(500);
  const [drinkPriceRub, setDrink] = useState(200);
  const [timezone, setTimezone] = useState("Europe/Samara");

  // Loaded once into local state so typing is not fighting a refetch.
  useEffect(() => {
    if (!settings.data) return;
    setInfoText(settings.data.infoText);
    setEntry(settings.data.entryPriceRub);
    setRebuy(settings.data.rebuyPriceRub);
    setAddon(settings.data.addonPriceRub);
    setDrink(settings.data.drinkPriceRub);
    setTimezone(settings.data.timezone);
  }, [settings.data]);

  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} />;

  return (
    <Card className="space-y-4">
      <div>
        <label className="label" htmlFor="club-info">
          Как нас найти
        </label>
        <textarea
          id="club-info"
          className="field min-h-40"
          value={infoText}
          onChange={(event) => setInfoText(event.target.value)}
          placeholder="Адрес, как войти, когда играем, сколько стоит вход…"
        />
        <p className="mt-1 text-xs text-stone-500">
          Этот текст игроки видят в боте по кнопке «Как нас найти».
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Price label="Вход, ₽" value={entryPriceRub} onChange={setEntry} />
        <Price label="Ребай, ₽" value={rebuyPriceRub} onChange={setRebuy} />
        <Price label="Адон, ₽" value={addonPriceRub} onChange={setAddon} />
        <Price label="Напиток, ₽" value={drinkPriceRub} onChange={setDrink} />
        <div>
          <label className="label" htmlFor="club-tz">
            Часовой пояс
          </label>
          <input
            id="club-tz"
            className="field"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Цены — это значения кнопок на кассе, сумму всегда можно изменить вручную. Часовой пояс задаёт
        время, в котором показываются все даты на сайте и в боте.
      </p>

      {save.isError && <p className="text-sm text-chip-red">{(save.error as Error).message}</p>}
      {save.isSuccess && <p className="text-sm text-emerald-400">Сохранено.</p>}

      <Button
        loading={save.isPending}
        onClick={() =>
          save.mutate({ infoText, entryPriceRub, rebuyPriceRub, addonPriceRub, drinkPriceRub, timezone })
        }
      >
        Сохранить
      </Button>
    </Card>
  );
}

function Price({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = `price-${label}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        className="field nums"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
