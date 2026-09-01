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
  const items = NAV_ITEMS.filter((item) => !item.staffOnly || can("hostess"));

  return (
    <div className="flex min-h-dvh flex-col">
      <LegalNotice />
      <header
        className="sticky top-0 z-20 border-b border-gold-500/20 bg-felt-950"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 text-left"
            aria-label="На главную"
          >
            <img
              src="/images/chip-mark.jpg"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full object-cover ring-1 ring-gold-500/40"
            />
            <span className="font-display text-lg leading-tight font-semibold text-gold-400 sm:text-xl">
              Клуб спортивного покера
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28">
        <InstallHint />
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-24 text-center text-sm text-stone-400">
        <NavLink to="/rules" className="hover:text-gold-400">
          Правила клуба
        </NavLink>
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gold-500/20 bg-felt-950/95 backdrop-blur-md"
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
                  "flex flex-1 flex-col items-center gap-0.5 py-3 text-sm font-medium transition",
                  isActive ? "text-gold-400" : "text-stone-400 hover:text-stone-200",
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
