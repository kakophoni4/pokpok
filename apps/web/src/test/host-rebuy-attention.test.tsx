import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostRebuyAttention } from "../pages/HostRebuyAttention";
import { api } from "../lib/api";

describe("hostess rebuy request", () => {
  it("opens the player without issuing and waits for explicit physical issue confirmation", async () => {
    const post = vi.spyOn(api, "post").mockRejectedValue(new Error("Нет связи"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSelect = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><HostRebuyAttention id="event" orders={[{ id: "request", userId: "player", menuItemId: "rebuy", title: "Ребай", quantity: 2, priceRub: 1000, state: "pending", table: 1, seat: 4, createdAt: new Date().toISOString() }]} name={() => "Роман Е."} onSelect={onSelect} /></QueryClientProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Ожидает ребай ×2");
    expect(screen.getByRole("alert")).toHaveTextContent("2 000 ₽");
    fireEvent.click(screen.getByRole("button", { name: "К игроку" }));
    expect(onSelect).toHaveBeenCalledWith("player");
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Выдано" }));
    expect(post).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Выдано" }));
    await screen.findByText("Нет связи");
    expect(post).toHaveBeenCalledWith("/live/event/orders/request/fulfil");
    expect(screen.getByRole("alert")).toHaveTextContent("Ожидает ребай ×2");
    post.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith("/live/event/orders/request/cancel"));
  });
});
