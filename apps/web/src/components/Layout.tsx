import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { platform } from "../platform/platform";
import { InstallHint } from "./InstallHint";
import { LegalNotice } from "./LegalNotice";
import { Avatar, Button, cx } from "./ui";
import { playerLabel } from "../lib/format";
import { ClubBrand } from "./ClubBrand";

type NavItem = {
  to: string;
  label: string;
  staffOnly?: boolean;
  dealerOnly?: boolean;
  floorOnly?: boolean;
  authenticatedOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Расписание" },
  { to: "/rating", label: "Рейтинг" },
  { to: "/achievements", label: "Награды" },
  { to: "/me", label: "Профиль", authenticatedOnly: true },
  { to: "/account", label: "Мой счёт", authenticatedOnly: true },
  { to: "/dealer", label: "Стол", dealerOnly: true },
  { to: "/staff", label: "Вечер", floorOnly: true },
  { to: "/admin", label: "Админ", staffOnly: true },
];

export function Layout() {
  const { user, status, signingIn, can } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const publicItems = NAV_ITEMS.filter(
    (item) =>
      !item.staffOnly &&
      !item.floorOnly &&
      !item.dealerOnly &&
      (!item.authenticatedOnly || status === "authenticated") &&
      (!item.staffOnly || can("hostess")) &&
      (!item.dealerOnly || user?.role === "dealer" || can("hostess")) &&
      (!item.floorOnly || can("floor")),
  );
  const workspace = /^\/(staff|admin|dealer)/.test(pathname);
  const shell = workspace ? "workspace-shell" : "public-shell";
  const items = workspace
    ? [
        { to: "/", label: "Клуб" },
        ...(can("floor") ? [{ to: "/staff", label: "Вечер" }] : []),
        ...(can("hostess") ? [{ to: "/admin", label: "Управление" }] : []),
      ]
    : publicItems;

  return (
    <div
      className={cx(
        "club-app flex min-h-dvh flex-col",
        workspace && "workspace-app",
        pathname === "/login" && "login-app",
      )}
    >
      <LegalNotice />
      <header
        className="club-header sticky top-0 z-20 border-b border-gold-500/20"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div
          className={cx(
            "mx-auto flex items-center justify-between gap-3 px-4 pb-3",
            shell,
          )}
        >
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 text-left"
            aria-label="На главную"
          >
            <ClubBrand />
          </button>

          <nav className="desktop-nav" aria-label="Разделы клуба">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-account flex items-center gap-3">
            {!workspace && can("floor") && (
              <NavLink to="/staff" className="text-sm text-stone-300">
                Вечер
              </NavLink>
            )}
            {!workspace && can("hostess") && (
              <NavLink to="/admin" className="text-sm text-stone-300">
                Админ
              </NavLink>
            )}
            {user ? (
              <button
                aria-label="Личный кабинет"
                onClick={() => navigate("/me")}
                className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition hover:bg-felt-800"
              >
                <Avatar
                  nickname={playerLabel(user)}
                  url={user.avatarUrl}
                  size={28}
                />
                <span className="hidden text-sm sm:inline">
                  {playerLabel(user)}
                </span>
              </button>
            ) : status === "loading" || signingIn ? (
              <span className="size-7" aria-hidden />
            ) : (
              <Button size="sm" onClick={() => navigate("/login")}>
                Войти
              </Button>
            )}
          </div>
        </div>
      </header>

      <main
        className={cx("club-main mx-auto w-full flex-1 px-4 pt-5 pb-28", shell)}
      >
        <InstallHint />
        <Outlet />
      </main>

      <footer
        className={cx(
          "club-footer mx-auto w-full px-4 pb-24 text-center text-sm text-stone-400",
          shell,
        )}
      >
        <NavLink to="/rules">
          Правила клуба
        </NavLink>
      </footer>

      <nav
        className="mobile-navigation fixed inset-x-0 bottom-0 z-20"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className={cx("club-bottom-nav flex", shell)}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              end={item.to === "/"}
              onClick={() => platform.haptic("tap")}
              className={({ isActive }: { isActive: boolean }) =>
                cx(
                  "club-nav-item min-w-0",
                  isActive
                    ? "nav-active"
                    : "text-stone-400 hover:text-stone-200",
                )
              }
            >
              <NavIcon to={item.to} />
              <span className="club-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function NavIcon({ to }: { to: string }) {
  const paths: Record<string, string> = {
    "/": "M5 3v4m14-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
    "/rating":
      "M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 0v6m-4 3h8m-7-3h6",
    "/achievements":
      "M12 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-4-1-1 9 5-3 5 3-1-9",
    "/me": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9v-2a8 8 0 0 1 16 0v2",
    "/account": "M3 6h17v15H3V6Zm0 0V3h15v3m-3 6h6v5h-6v-5Z",
    "/staff": "M3 5h18v14H3V5Zm5 0v14m8-14v14M3 12h18",
    "/admin": "M4 7h16M4 17h16M8 4v6m8 4v6",
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[to] ?? paths["/me"]} />
    </svg>
  );
}
