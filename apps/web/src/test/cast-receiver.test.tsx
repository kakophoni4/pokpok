import { fireEvent, render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CastReceiverPage } from "../pages/CastReceiverPage";
import { CAST_NAMESPACE } from "../lib/google-cast";
vi.mock("../pages/HallDisplay", () => ({ HallDisplayPage: ({ connection, receiverMode }: any) => <div>Турнир {connection.id} · {String(receiverMode)}</div> }));
describe("Cast receiver", () => {
  it("renders the hall directly on a valid message and switches to the new tournament", async () => {
    let listener: (event: { data: unknown }) => void = () => {};
    const receiver = { start: vi.fn(), stop: vi.fn(), addCustomMessageListener: vi.fn((namespace, callback) => { expect(namespace).toBe(CAST_NAMESPACE); listener = callback; }) };
    vi.stubGlobal("cast", { framework: { CastReceiverContext: { getInstance: () => receiver } } });
    const view = render(<CastReceiverPage />);
    fireEvent.load(document.querySelector('script[src*="caf_receiver"]')!);
    expect(receiver.start).toHaveBeenCalledWith({ disableIdleTimeout: true });
    act(() => listener({ data: { id: "https://evil.test", token: "test" } }));
    expect(screen.getByText("Ожидание турнира с телефона флора")).toBeInTheDocument();
    act(() => listener({ data: { id: "event1", token: "53267fb7-c614-4d93-a7d7-f8dfa12a79d5" } }));
    expect(screen.getByText("Турнир event1 · true")).toBeInTheDocument();
    act(() => listener({ data: { id: "event2", token: "53267fb7-c614-4d93-a7d7-f8dfa12a79d5" } }));
    expect(screen.getByText("Турнир event2 · true")).toBeInTheDocument();
    view.unmount(); expect(receiver.stop).toHaveBeenCalledOnce();
  });
});
