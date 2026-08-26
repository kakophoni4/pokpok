import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { platform } from "../platform/platform";
import { InstallHint } from "./InstallHint";
import { Avatar, Button, cx } from "./ui";

type NavItem = { to: string; label: string; icon: string; staffOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Расписание", icon: "🗓" },
  { to: "/rating", label: "Рейтинг", icon: "📊" },
  { to: "/achievements", label: "Ачивки", icon: "🏅" },
  { to: "/me", label: "Кабинет", icon: "👤" },
  { to: "/admin", label: "Админ", icon: "⚙️", staffOnly: true },
];

export function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((item) => !item.staffOnly || can("admin"));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-felt-800 bg-felt-900/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-left"
          aria-label="На главную"
        >
          <span aria-hidden className="text-xl">
            ♠️
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Клуб спортивного покера</span>
            <span className="block text-[11px] text-stone-500">игра без денежных ставок</span>
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

      {/* Bottom bar: thumb-reachable on a phone, which is where most sign-ups happen. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-felt-800 bg-felt-900/95 backdrop-blur"
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
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition",
                  isActive ? "text-gold-400" : "text-stone-500 hover:text-stone-300",
                )
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {user && (
        <button
          onClick={() => void logout()}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-felt-700 focus:px-3 focus:py-1"
        >
          Выйти
        </button>
      )}
    </div>
  );
}
