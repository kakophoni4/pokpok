import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gold-500 text-felt-950 hover:bg-gold-400 active:bg-gold-600",
  secondary: "bg-felt-700 text-stone-100 hover:bg-felt-600 active:bg-felt-800",
  ghost: "bg-transparent text-stone-300 hover:bg-felt-800 hover:text-stone-100",
  danger: "bg-chip-red/90 text-white hover:bg-chip-red",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-1.5 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className ?? "size-5",
      )}
    />
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  return <Tag className={cx("card p-4", className)}>{children}</Tag>;
}

const BADGE_TONES = {
  neutral: "bg-felt-700 text-stone-300",
  gold: "bg-gold-500/15 text-gold-400 ring-1 ring-gold-500/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25",
  red: "bg-chip-red/15 text-chip-red ring-1 ring-chip-red/30",
  blue: "bg-chip-blue/15 text-chip-blue ring-1 ring-chip-blue/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  nickname,
  url,
  size = 40,
}: {
  nickname: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={nickname}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-felt-700 font-semibold text-gold-400"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {nickname.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card px-3 py-3 text-center">
      <div className="nums text-xl font-semibold text-gold-400">{value}</div>
      <div className="mt-0.5 text-sm text-stone-400">{label}</div>
      {hint && <div className="mt-0.5 text-sm text-stone-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && (
        <span className="text-4xl" aria-hidden>
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-stone-400">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Что-то пошло не так";
  return (
    <div className="card border-chip-red/40 px-6 py-8 text-center">
      <p className="font-medium text-chip-red">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function Loading({ label = "Загружаем…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-400">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            "rounded-xl border px-3.5 py-2 text-sm font-medium transition",
            option.value === value
              ? "border-gold-500/50 bg-gold-500/15 text-gold-400"
              : "border-gold-500/20 bg-felt-950 text-stone-300 hover:border-gold-500/40 hover:text-stone-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  id,
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="field flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0 truncate">{selected?.label ?? "-"}</span>
        <svg
          viewBox="0 0 12 8"
          aria-hidden
          className={cx(
            "size-3 shrink-0 text-gold-400 transition",
            open && "rotate-180",
          )}
        >
          <path
            d="M1.2 1.4L6 6.2L10.8 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gold-500/25 bg-felt-950 py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cx(
                    "w-full px-3 py-2.5 text-left text-base",
                    active
                      ? "bg-gold-500/15 text-gold-400"
                      : "text-stone-200 hover:bg-felt-800",
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
