import type { ClubMenuItem, CreateClubMenuItemInput, PaymentKind } from "@poker/contracts";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Loading } from "../../components/ui";
import {
  useClubSettings,
  useCreateMenuItem,
  useDeleteMenuItem,
  useUpdateClubSettings,
  useUpdateMenuItem,
} from "../../lib/queries";

export function AdminSettings() {
  const settings = useClubSettings(true);
  const save = useUpdateClubSettings();
  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const removeItem = useDeleteMenuItem();

  const [infoText, setInfoText] = useState("");
  const [adding, setAdding] = useState<"extra" | "promo" | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setInfoText(settings.data.infoText);
  }, [settings.data]);

  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} />;
  if (!settings.data) return null;

  const items = settings.data.menuItems ?? [];
  const fixed = items.filter((item) => item.isFixed);
  const extras = items.filter((item) => !item.isFixed && !item.isPromo);
  const promos = items.filter((item) => item.isPromo);

  return (
    <div className="space-y-4">
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
            placeholder="Адрес, как войти, когда играем…"
          />
        </div>

        {save.isError && <p className="text-sm text-chip-red">{(save.error as Error).message}</p>}
        {save.isSuccess && <p className="text-sm text-emerald-400">Сохранено.</p>}

        <Button loading={save.isPending} onClick={() => save.mutate({ infoText })}>
          Сохранить текст
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Касса</h2>
        <CashierTable
          items={fixed}
          onSave={(id, input) => updateItem.mutate({ id, input })}
          busy={updateItem.isPending}
        />
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Меню</h2>
          <Button size="sm" variant="secondary" onClick={() => setAdding("extra")}>
            + Позиция
          </Button>
        </div>
        {adding === "extra" && (
          <NewItemForm
            promo={false}
            busy={createItem.isPending}
            error={createItem.error}
            onCancel={() => setAdding(null)}
            onCreate={(input) => createItem.mutate(input, { onSuccess: () => setAdding(null) })}
          />
        )}
        {extras.length === 0 && adding !== "extra" && (
          <p className="text-sm text-stone-500">Пока только вход, адон и ребай.</p>
        )}
        <ul className="space-y-2">
          {extras.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              onSave={(input) => updateItem.mutate({ id: item.id, input })}
              onDelete={() => removeItem.mutate(item.id)}
              busy={updateItem.isPending || removeItem.isPending}
            />
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Акции</h2>
          <Button size="sm" variant="secondary" onClick={() => setAdding("promo")}>
            + Акция
          </Button>
        </div>
        {adding === "promo" && (
          <NewItemForm
            promo
            busy={createItem.isPending}
            error={createItem.error}
            onCancel={() => setAdding(null)}
            onCreate={(input) => createItem.mutate(input, { onSuccess: () => setAdding(null) })}
          />
        )}
        {promos.length === 0 && adding !== "promo" && (
          <p className="text-sm text-stone-500">Например: бесплатный адон или ребай.</p>
        )}
        <ul className="space-y-2">
          {promos.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              onSave={(input) => updateItem.mutate({ id: item.id, input })}
              onDelete={() => removeItem.mutate(item.id)}
              busy={updateItem.isPending || removeItem.isPending}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function CashierTable({
  items,
  onSave,
  busy,
}: {
  items: ClubMenuItem[];
  onSave: (id: string, input: { priceRub?: number; chips?: number }) => void;
  busy: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[22rem] grid-cols-[6.5rem_5.5rem_5.5rem_auto] items-center gap-x-3 gap-y-2">
        <div />
        <p className="text-xs font-medium text-stone-400">Цена, ₽</p>
        <p className="text-xs font-medium text-stone-400">Фишки</p>
        <div />
        {items.map((item) => (
          <CashierRow key={item.id} item={item} onSave={onSave} busy={busy} />
        ))}
      </div>
    </div>
  );
}

function CashierRow({
  item,
  onSave,
  busy,
}: {
  item: ClubMenuItem;
  onSave: (id: string, input: { priceRub?: number; chips?: number }) => void;
  busy: boolean;
}) {
  const [price, setPrice] = useState(String(item.priceRub));
  const [chips, setChips] = useState(String(item.chips));

  useEffect(() => {
    setPrice(String(item.priceRub));
    setChips(String(item.chips));
  }, [item.priceRub, item.chips]);

  const dirty = Number(price) !== item.priceRub || Number(chips) !== item.chips;

  return (
    <>
      <p className="text-sm font-medium text-stone-100">{item.title}</p>
      <input
        type="number"
        min={0}
        aria-label={`${item.title}, цена`}
        className="field nums"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
      />
      <input
        type="number"
        min={0}
        aria-label={`${item.title}, фишки`}
        className="field nums"
        value={chips}
        onChange={(event) => setChips(event.target.value)}
      />
      <div className="h-8">
        {dirty ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onSave(item.id, { priceRub: Number(price), chips: Number(chips) })}
          >
            Ок
          </Button>
        ) : null}
      </div>
    </>
  );
}

function MenuRow({
  item,
  onSave,
  onDelete,
  busy,
}: {
  item: ClubMenuItem;
  onSave: (input: { title?: string; priceRub?: number; chips?: number }) => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(String(item.priceRub));
  const [chips, setChips] = useState(String(item.chips));

  useEffect(() => {
    setTitle(item.title);
    setPrice(String(item.priceRub));
    setChips(String(item.chips));
  }, [item.title, item.priceRub, item.chips]);

  const dirty =
    title.trim() !== item.title || Number(price) !== item.priceRub || Number(chips) !== item.chips;

  return (
    <li className="grid grid-cols-[minmax(8rem,1fr)_5.5rem_5.5rem_auto] items-end gap-x-3 gap-y-2 rounded-xl border border-felt-700/60 p-3 max-sm:grid-cols-2">
      <div className="min-w-0 max-sm:col-span-2">
        <label className="label">Название</label>
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div>
        <label className="label">Цена, ₽</label>
        <input
          type="number"
          min={0}
          className="field nums"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </div>
      <div>
        <label className="label">Фишки</label>
        <input
          type="number"
          min={0}
          className="field nums"
          value={chips}
          onChange={(event) => setChips(event.target.value)}
        />
      </div>
      <div className="flex h-8 items-center gap-1 self-end max-sm:col-span-2">
        {dirty && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onSave({
                title: title.trim(),
                priceRub: Number(price),
                chips: Number(chips),
              })
            }
          >
            Ок
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete}>
            Убрать
          </Button>
        )}
      </div>
    </li>
  );
}

function NewItemForm({
  promo,
  busy,
  error,
  onCreate,
  onCancel,
}: {
  promo: boolean;
  busy: boolean;
  error: unknown;
  onCreate: (input: CreateClubMenuItemInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(promo ? "Бесплатный адон" : "");
  const [price, setPrice] = useState(promo ? "0" : "200");
  const [chips, setChips] = useState("0");
  const [kind, setKind] = useState<PaymentKind>(promo ? "addon" : "other");

  return (
    <div className="space-y-2 rounded-xl border border-gold-500/20 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label">Название</label>
          <input
            className="field"
            value={title}
            placeholder={promo ? "Бесплатный ребай" : "Пиво, кальян…"}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div>
          <label className="label">Цена, ₽</label>
          <input
            type="number"
            min={0}
            className="field nums"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
        <div>
          <label className="label">Фишки</label>
          <input
            type="number"
            min={0}
            className="field nums"
            value={chips}
            onChange={(event) => setChips(event.target.value)}
          />
        </div>
      </div>
      {promo && (
        <div>
          <label className="label">Что даёт</label>
          <select
            className="field"
            value={kind}
            onChange={(event) => setKind(event.target.value as PaymentKind)}
          >
            <option value="addon">Адон</option>
            <option value="rebuy">Ребай</option>
          </select>
        </div>
      )}
      {error instanceof Error && <p className="text-xs text-chip-red">{error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={title.trim().length < 2}
          onClick={() =>
            onCreate({
              title: title.trim(),
              kind,
              priceRub: Number(price),
              chips: Number(chips),
              isPromo: promo,
              isActive: true,
            })
          }
        >
          Добавить
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
