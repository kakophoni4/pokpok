import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp, stubApi } from "./harness";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";

const floor = { id: "floor", nickname: "Флор", role: "floor", status: "active", identities: [], displayName: null, avatarUrl: null, createdAt: new Date().toISOString() };
describe("standalone floor workspace", () => {
  it("shows password login on the legacy staff route without player terms", async () => {
    localStorage.removeItem("poker-club-rules-accepted");
    const log = stubApi([
      { match: "POST /auth/refresh", status: 401 },
      { match: "POST /auth/floor/login", status: 401, body: { message: "Неверный логин или пароль" } },
    ]);
    renderApp("/staff");
    await screen.findByRole("heading", { name: "Вход для флора" });
    expect(screen.queryByText("Перед тем как продолжить")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "Флор" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");
    expect(log.find(r => r.path === "/auth/floor/login")?.body).toEqual({ nickname: "Флор", password: "wrong-password" });
  });

  it("logs in and restores a floor session from the cookie", async () => {
    stubApi([
      { match: "POST /auth/refresh", status: 401 },
      { match: "POST /auth/floor/login", body: { accessToken: "access", expiresIn: 900, user: floor } },
      { match: "GET /tournaments", body: [] },
    ]);
    const view = renderApp("/floor");
    await screen.findByLabelText("Пароль");
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "Флор" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "test-password" } });
    fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
    await screen.findByText("Нет текущих турниров");
    expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument();
    view.unmount();
    stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "access", expiresIn: 900 } },
      { match: "GET /auth/me", body: floor },
      { match: "GET /tournaments", body: [] },
    ]);
    renderApp("/floor");
    await screen.findByText("Нет текущих турниров");
    expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument();
  });

  it("keeps players and hostess outside the floor workspace", async () => {
    stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "access", expiresIn: 900 } },
      { match: "GET /auth/me", body: { ...floor, role: "hostess" } },
    ]);
    renderApp("/floor");
    await screen.findByRole("heading", { name: "Вход для флора" });
    expect(screen.queryByText("Управление турниром")).not.toBeInTheDocument();
  });

  it("checks clock state, confirms level changes and requests rebuy without issuing it", async () => {
    const now = new Date().toISOString();
    const event = { id: "event", title: "Турнир клуба", status: "running", startsAt: now, paidPlaces: 3 };
    const state = { config: DEFAULT_LIVE_CONFIG, clock: { running: false, elapsedSeconds: 10 }, tables: [{ number: 1, open: true, dealerId: "dealer" }, { number: 2, open: true, dealerId: "dealer2" }], seats: [{ userId: "player", table: 1, seat: 1, state: "playing", stack: 40000 }, { userId: "other", table: 2, seat: 1, state: "playing", stack: 40000 }], orders: [], alerts: [], bounties: [] };
    const log = stubApi([
      { match: "POST /auth/refresh", body: { accessToken: "access", expiresIn: 900 } },
      { match: "GET /auth/me", body: floor },
      { match: "GET /tournaments", body: [event] },
      { match: "GET /live/event/achievements", body: [] },
      { match: "GET /live/event", body: { ...event, serverTime: now, state, players: [{ id: "player", name: "Игрок А." }], balances: [], clock: { level: DEFAULT_LIVE_CONFIG.levels[0], index: 0, remaining: 1190 }, displayCode: "123456", displayToken: "test" } },
      { match: "GET /live/staff", body: [{ id: "dealer", name: "Дилер", role: "dealer" }] },
      { match: "GET /club/menu-public", body: [{ id: "rebuy", title: "Ребай", kind: "rebuy", isFixed: true, priceRub: 1000 }] },
      { match: "POST /live/event/actions", body: { ok: true } },
      { match: "POST /live/orders", body: { ok: true } },
      { match: "GET /achievements", body: [] },
    ]);
    renderApp("/floor");
    expect(await screen.findByRole("button", { name: "Пауза" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Следующий уровень" }));
    expect(log.some(r => r.path === "/live/event/actions")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Следующий уровень" }));
    await vi.waitFor(() => expect(log.find(r => r.path === "/live/event/actions")?.body).toEqual({ type: "clock", command: "next" }));
    fireEvent.click(screen.getByRole("button", { name: /Игрок А./ }));
    expect(screen.queryByLabelText("Стек")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обменять места" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Игрок для обмена местами"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Обменять места" }));
    await vi.waitFor(() => expect(log.some(r => JSON.stringify(r.body) === JSON.stringify({ type: "move", userId: "player", targetTable: 2, swapUserId: "other" }))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Ребай x2" }));
    await vi.waitFor(() => expect(log.find(r => r.path === "/live/orders")?.body).toMatchObject({ userId: "player", quantity: 2 }));
    expect(log.some(r => r.path.endsWith("/fulfil"))).toBe(false);
    expect(screen.queryByText("Приём игроков")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выдано" })).not.toBeInTheDocument();
    confirm.mockRestore();
  });
});
