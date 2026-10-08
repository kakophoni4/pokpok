import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { HostAttention } from "../pages/HostAttention";
import { api } from "../lib/api";

describe("host dealer notifications", () => {
  it("keeps signals visible until acknowledged and opens the correct player without acknowledging", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSelect = vi.fn();
    const post = vi.spyOn(api, "post").mockRejectedValue(new Error("Нет связи"));
    const first = { id: "one", kind: "bust" as const, userId: "p1", table: 2, seat: 4, text: "Без стека. К оплате 500 ₽", acknowledgedBy: null, createdAt: new Date().toISOString() };
    const second = { ...first, id: "two", userId: "p2", kind: undefined, text: "Завершил игру. К оплате 250 ₽" };
    const ui = (alerts: any[]) => <QueryClientProvider client={client}><HostAttention id="event" alerts={alerts} name={uid => uid === "p1" ? "Игрок А." : "Игрок Б."} onSelect={onSelect} /></QueryClientProvider>;
    const view = render(ui([]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    view.rerender(ui([first, second]));
    expect(screen.getByRole("alert")).toHaveTextContent("Игрок А.");
    expect(screen.getByRole("alert")).toHaveTextContent("Стол 2 · место 4");
    expect(screen.getByRole("alert")).toHaveTextContent("Ещё 1");
    fireEvent.click(screen.getByRole("button", { name: "К игроку" }));
    expect(onSelect).toHaveBeenCalledWith("p1", false);
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Принято" }));
    await screen.findByText("Нет связи");
    expect(post).toHaveBeenCalledWith("/live/event/actions", { type: "ack", alertId: "one" });
    expect(screen.getByRole("alert")).toHaveTextContent("Игрок А.");
    view.rerender(ui([{ ...first, acknowledgedBy: "host" }, second]));
    expect(screen.getByRole("alert")).toHaveTextContent("Игрок Б.");
    fireEvent.click(screen.getByRole("button", { name: "К игроку" }));
    expect(onSelect).toHaveBeenLastCalledWith("p2", true);
    view.rerender(ui([{ ...first, acknowledgedBy: "host" }, { ...second, acknowledgedBy: "host" }]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
