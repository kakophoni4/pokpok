import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { platform } from "../platform/platform";
import { InstallHint } from "./InstallHint";
import { LegalNotice } from "./LegalNotice";
import { Avatar, Button, cx } from "./ui";

type NavItem = { to: string; label: string; staffOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Расписание" },
  { to: "/rating", label: "Рейтинг" },
  { to: "/achievements", label: "Ачивки" },
  { to: "/me", label: "Кабинет" },
  { to: "/admin", label: "Админ", staffOnly: true },
];

export function Layout() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((item) => !item.staffOnly || can("admin"));

  return (
    <div className="site-shell mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <LegalNotice />
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gold-500/15 bg-felt-950/80 px-4 py-3 backdrop-blur-md">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 text-left"
          aria-label="На главную"
        >
          <img
            src="/images/chip-mark.jpg"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-full object-cover ring-1 ring-gold-500/40"
          />
          <span className="leading-tight">
            <span className="block font-display text-sm font-semibold tracking-wide text-gold-400">
              Клуб спортивного покера
            </span>
          </span>
        </button>

        {user ? (
          <button
            onClick={() => navigate("/me")}
            className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition hover:bg-felt-800"
          >
            <Avatar nickname={user.nickname} url={user.avatarUrl} size={28} />
            <span className="hidden text-sm sm:inline">{user.nickname}</span>
          </button>
        ) : (
          <Button size="sm" onClick={() => navigate("/login")}>
            Войти
          </Button>
        )}
      </header>

      <main className="flex-1 px-4 pt-5 pb-28">
        <InstallHint />
        <Outlet />
      </main>

      <footer className="px-4 pb-24 text-center text-[11px] text-stone-500">
        <NavLink to="/rules" className="hover:text-gold-400">
          Правила клуба
        </NavLink>
        <span className="px-2">·</span>
        игра не на деньги
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gold-500/15 bg-felt-950/90 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => platform.haptic("tap")}
              className={({ isActive }: { isActive: boolean }) =>
                cx(
                  "flex flex-1 flex-col items-center gap-0.5 py-3 text-[11px] tracking-wide uppercase transition",
                  isActive ? "text-gold-400" : "text-stone-500 hover:text-stone-300",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
