import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { HandAwards } from "../pages/LivePages";
import { stubApi } from "./harness";

describe("hand award confirmation and correction", () => {
  it("confirms both operations and refetches history after cancelling a grant", async () => {
    let active = true;
    const log = stubApi([
      { match: "GET /achievements", body: [{ id: "four", title: "Каре", category: "game" }] },
      { match: "GET /live/event/achievements", body: () => active ? [{ id: "grant", title: "Каре", points: 100, grantedAt: new Date().toISOString(), grantedBy: "Дилер", canRevoke: true }] : [] },
      { match: "POST /live/event/achievements/grant/revoke", body: () => { active = false; return { ok: true }; } },
      { match: "POST /live/event/achievement", body: { ok: true } },
    ]);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HandAwards id="event" userId="player" name="Игрок А." /></QueryClientProvider>);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(await screen.findByRole("button", { name: "Каре" }));
    expect(log.filter(r => r.method === "POST")).toHaveLength(0);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Каре" }));
    await screen.findByRole("status");
    expect(log.find(r => r.path === "/live/event/achievement")?.body).toEqual({ userId: "player", achievementId: "four" });
    confirm.mockReturnValue(false);
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись" }));
    expect(log.some(r => r.path.endsWith("/revoke"))).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Отменить запись" }));
    await screen.findByText("Пока нет записей");
    expect(log.some(r => r.path.endsWith("/revoke"))).toBe(true);
    confirm.mockRestore();
  });
});
