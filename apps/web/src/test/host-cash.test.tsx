import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostCash } from "../pages/HostCash";
import { api } from "../lib/api";

describe("host cash summary", () => {
  it("shows received money separately from issued purchases and prize units", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ date: "2026-10-08", cashRub: 1000, terminalRub: 2500, unspecifiedRub: 500, paidRub: 4000, items: [{ kind: "rebuy", title: "Ребай", quantity: 3, prizeQuantity: 1, chargedRub: 3000 }] });
    render(<QueryClientProvider client={new QueryClient()}><HostCash /></QueryClientProvider>);
    await screen.findByText(/4.*000 ₽/);
    const details = screen.getByText("Касса за сегодня").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Касса за сегодня"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/Способ оплаты не указан/)).toHaveTextContent("500 ₽");
    expect(screen.getByText("Ребай").parentElement).toHaveTextContent("Ребай313 000 ₽");
    expect(api.get).toHaveBeenCalledWith("/live/cash/today");
  });
});
