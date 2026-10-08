import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, stubApi } from "./harness";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";

const host = { id: "host", nickname: "Anna", role: "hostess", status: "active", identities: [], displayName: null, avatarUrl: null, createdAt: new Date().toISOString() };
describe("standalone host login", () => {
  it("shows password login without player terms and reports failed login", async () => {
    localStorage.removeItem("poker-club-rules-accepted");
    const log = stubApi([
      { match: "POST /auth/refresh", status: 401 },
      { match: "POST /auth/host/login", status: 401, body: { message: "Неверный логин или пароль" } },
    ]);
    renderApp("/host");
    await screen.findByRole("heading", { name: "Вход для хостес" });
    expect(screen.queryByText("Перед тем как продолжить")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");
    expect(log.find(r => r.path === "/auth/host/login")?.body).toEqual({ nickname: "Anna", password: "wrong-password" });
  });

  it("opens the reception workspace after login and restores it from the cookie", async () => {
    localStorage.removeItem("poker-club-rules-accepted");
    stubApi([
      { match: "POST /auth/refresh", status: 401 },
      { match: "POST /auth/host/login", body: { accessToken: "access", expiresIn: 900, user: host, isNewUser: false } },
      { match: "GET /tournaments", body: [] },
    ]);
    const view = renderApp("/host");
    await screen.findByRole("heading", { name: "Вход для хостес" });
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "test-password" } });
    fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
    await screen.findByText("Сейчас нет турнира для приёма игроков.");
    expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument();
    expect(screen.queryByText("Перед тем как продолжить")).not.toBeInTheDocument();
    view.unmount();
    stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "new-access", expiresIn: 900, user: host } },
      { match: "GET /auth/me", body: host },
      { match: "GET /tournaments", body: [] },
    ]);
    renderApp("/host");
    await screen.findByText("Сейчас нет турнира для приёма игроков.");
    expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument();
  });

  it("does not show the hostess desk to an authenticated player", async () => {
    stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "player-access", expiresIn: 900 } },
      { match: "GET /auth/me", body: { ...host, role: "player" } },
    ]);
    renderApp("/host");
    await screen.findByRole("heading", { name: "Вход для хостес" });
    expect(screen.queryByText("Приём игроков")).not.toBeInTheDocument();
  });

  it("selects a debtor, separates account from issue, and preserves floor controls outside the desk", async () => {
    const now = new Date().toISOString();
    const event = { id: "event", title: "Турнир клуба", startsAt: now, status: "reg_open", capacity: 18, registeredCount: 1, paidPlaces: 3 };
    const player = { ...host, id: "player", nickname: "Игрок А.", role: "player" };
    const log = stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "access", expiresIn: 900 } },
      { match: "GET /auth/me", body: host },
      { match: "GET /tournaments/event", body: { ...event, registrations: [], players: [{ user: player, place: null }] } },
      { match: "GET /tournaments", body: [event] },
      { match: "GET /live/event", body: { ...event, players: [{ id: "player", name: "Игрок А." }], balances: [{ userId: "player", dueRub: 250 }], state: { config: DEFAULT_LIVE_CONFIG, seats: [{ userId: "player", table: 1, seat: 2, state: "playing" }], orders: [] } } },
      { match: "GET /club/menu-public", body: [{ id: "coffee", title: "Кофе", kind: "other", priceRub: 250, isActive: true }] },
      { match: "GET /live/account/player", body: { debtRub: 250, creditRub: 0, accounts: [] } },
      { match: "GET /prizes/user/player", body: { total: 0, lines: [], active: [] } },
    ]);
    renderApp("/host");
    fireEvent.click(await screen.findByRole("button", { name: /Игрок А.*250 ₽/ }));
    await screen.findByRole("heading", { name: "Счёт · 250 ₽" });
    expect(screen.getByRole("tab", { name: "Счёт" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("Поиск по меню")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Выдача и призы" }));
    await screen.findByRole("button", { name: /Кофе\s*250 ₽/ });
    expect(screen.queryByLabelText("Сумма оплаты")).not.toBeInTheDocument();
    expect(screen.queryByText("Завершить вечер")).not.toBeInTheDocument();
    expect(screen.queryByText("Запустить таймер")).not.toBeInTheDocument();
    expect(log.filter(r => r.method !== "GET").map(r => r.path)).toEqual(["/auth/refresh"]);
  });
});

