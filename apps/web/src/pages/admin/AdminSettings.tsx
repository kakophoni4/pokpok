import type {
  ClubMenuItem,
  CreateClubMenuItemInput,
  PaymentKind,
  PromoGrant,
  UpdateClubMenuItemInput,
} from "@poker/contracts";
import { promoBundleLabel, promoKindFromBundle } from "@poker/contracts";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, Loading } from "../../components/ui";
import {
  useClubSettings,
  useCreateMenuItem,
  useDeleteMenuItem,
  useUpdateClubSettings,
  useUpdateMenuItem,
} from "../../lib/queries";

type GrantOption = {
  value: string;
  title: string;
  kind: PaymentKind;
  menuItemId?: string;
};

function grantCatalog(extras: ClubMenuItem[]): GrantOption[] {
  return [
    { value: "kind:addon", title: "Адон", kind: "addon" },
    { value: "kind:rebuy", title: "Ребай", kind: "rebuy" },
    ...extras
      .filter((item) => item.isActive)
      .map((item) => ({
        value: item.id,
        title: item.title,
        kind: item.kind,
        menuItemId: item.id,
      })),
  ];
}

/** Collapse repeated catalog picks into {kind, qty, ...} for the API. */
function toBundle(picks: { option: string; quantity: number }[], catalog: GrantOption[]): PromoGrant[] {
  const grants: PromoGrant[] = [];
  for (const pick of picks) {
    const option = catalog.find((row) => row.value === pick.option);
    if (!option || pick.quantity < 1) continue;
    grants.push({
      kind: option.kind,
      quantity: pick.quantity,
      ...(option.menuItemId ? { menuItemId: option.menuItemId } : {}),
      title: option.title,
    });
  }
  return grants;
}

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
  const catalog = grantCatalog(extras);

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
            catalog={catalog}
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
              catalog={catalog}
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
            catalog={catalog}
            busy={createItem.isPending}
            error={createItem.error}
            onCancel={() => setAdding(null)}
            onCreate={(input) => createItem.mutate(input, { onSuccess: () => setAdding(null) })}
          />
        )}
        {promos.length === 0 && adding !== "promo" && (
          <p className="text-sm text-stone-500">Адон, кальян, два кальяна, адон + кальян — что угодно.</p>
        )}
        <ul className="space-y-2">
          {promos.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              catalog={catalog}
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
  catalog,
  onSave,
  onDelete,
  busy,
}: {
  item: ClubMenuItem;
  catalog: GrantOption[];
  onSave: (input: UpdateClubMenuItemInput) => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(String(item.priceRub));
  const [chips, setChips] = useState(String(item.chips));
  const [picks, setPicks] = useState(() => picksFromItem(item, catalog));

  useEffect(() => {
    setTitle(item.title);
    setPrice(String(item.priceRub));
    setChips(String(item.chips));
    setPicks(picksFromItem(item, catalog));
    // Catalog is rebuilt each render; the item itself is what should reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const bundle = item.isPromo ? toBundle(picks, catalog) : undefined;
  const bundleDirty =
    item.isPromo && promoBundleLabel(bundle ?? null, item.kind) !== promoBundleLabel(item.bundle, item.kind);
  const dirty =
    title.trim() !== item.title ||
    Number(price) !== item.priceRub ||
    Number(chips) !== item.chips ||
    bundleDirty;

  return (
    <li className="space-y-2 rounded-xl border border-felt-700/60 p-3">
      <div className="grid grid-cols-[minmax(8rem,1fr)_5.5rem_5.5rem] items-end gap-x-3 gap-y-2 max-sm:grid-cols-2">
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
        {!item.isPromo && (
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
        )}
      </div>
      {item.isPromo && <GrantEditor catalog={catalog} picks={picks} onChange={setPicks} />}
      <div className="flex h-8 items-center gap-1">
        {dirty && (
          <Button
            size="sm"
            disabled={busy || (item.isPromo && (bundle?.length ?? 0) < 1)}
            onClick={() =>
              onSave({
                title: title.trim(),
                priceRub: Number(price),
                ...(item.isPromo
                  ? { chips: 0, kind: promoKindFromBundle(bundle ?? []), bundle: bundle ?? [] }
                  : { chips: Number(chips) }),
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
  catalog,
  busy,
  error,
  onCreate,
  onCancel,
}: {
  promo: boolean;
  catalog: GrantOption[];
  busy: boolean;
  error: unknown;
  onCreate: (input: CreateClubMenuItemInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(promo ? "Бесплатный адон" : "");
  const [price, setPrice] = useState(promo ? "0" : "200");
  const [chips, setChips] = useState("0");
  const [picks, setPicks] = useState<{ option: string; quantity: number }[]>(() => [
    { option: catalog[0]?.value ?? "kind:addon", quantity: 1 },
  ]);

  const bundle = promo ? toBundle(picks, catalog) : [];

  return (
    <div className="space-y-2 rounded-xl border border-gold-500/20 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label">Название</label>
          <input
            className="field"
            value={title}
            placeholder={promo ? "Адон + кальян" : "Пиво, кальян…"}
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
        {!promo && (
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
        )}
      </div>
      {promo && <GrantEditor catalog={catalog} picks={picks} onChange={setPicks} />}
      {error instanceof Error && <p className="text-xs text-chip-red">{error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={title.trim().length < 2 || (promo && bundle.length < 1)}
          onClick={() =>
            onCreate({
              title: title.trim(),
              kind: promo ? promoKindFromBundle(bundle) : "other",
              priceRub: Number(price),
              chips: promo ? 0 : Number(chips),
              isPromo: promo,
              isActive: true,
              ...(promo ? { bundle } : {}),
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

function GrantEditor({
  catalog,
  picks,
  onChange,
}: {
  catalog: GrantOption[];
  picks: { option: string; quantity: number }[];
  onChange: (picks: { option: string; quantity: number }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="label">Что даёт</p>
      {picks.map((pick, index) => (
        <div key={`${pick.option}-${index}`} className="flex gap-2">
          <select
            className="field min-w-0 flex-1"
            value={pick.option}
            onChange={(event) =>
              onChange(
                picks.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, option: event.target.value } : row,
                ),
              )
            }
          >
            {catalog.map((option) => (
              <option key={option.value} value={option.value}>
                {option.title}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={20}
            className="field nums w-16 shrink-0"
            aria-label="Количество"
            value={pick.quantity}
            onChange={(event) =>
              onChange(
                picks.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row,
                ),
              )
            }
          />
          {picks.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(picks.filter((_, rowIndex) => rowIndex !== index))}
            >
              −
            </Button>
          )}
        </div>
      ))}
      {picks.length < 8 && catalog.length > 0 && (
        <button
          type="button"
          className="text-xs text-gold-400 underline decoration-dotted"
          onClick={() =>
            onChange([...picks, { option: catalog[0]!.value, quantity: 1 }])
          }
        >
          + ещё позицию
        </button>
      )}
    </div>
  );
}

function picksFromItem(
  item: ClubMenuItem,
  catalog: GrantOption[],
): { option: string; quantity: number }[] {
  const bundle = item.bundle ?? [];
  if (bundle.length === 0) {
    const fallback = catalog.find((option) => option.kind === item.kind && !option.menuItemId) ?? catalog[0];
    return [{ option: fallback?.value ?? "kind:addon", quantity: 1 }];
  }
  return bundle.map((grant) => {
    const match =
      (grant.menuItemId ? catalog.find((option) => option.menuItemId === grant.menuItemId) : undefined) ??
      catalog.find((option) => option.kind === grant.kind && !option.menuItemId);
    return { option: match?.value ?? "kind:addon", quantity: grant.quantity };
  });
}
