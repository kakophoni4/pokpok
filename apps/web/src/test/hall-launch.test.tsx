import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DEFAULT_LIVE_CONFIG, type LiveView } from "@poker/contracts";
import { describe, expect, it, vi } from "vitest";
import { HallDisplayPage } from "../pages/HallDisplay";

const audio = vi.hoisted(() => ({ enable: vi.fn().mockResolvedValue(undefined), play: vi.fn() }));
vi.mock("../lib/display-audio", () => ({ DisplayAudio: class {
  active = true;
  enable = audio.enable;
  play = audio.play;
  stop() {}
  dispose() {}
} }));
function show() {
  const level = DEFAULT_LIVE_CONFIG.levels[0]!;
  const view: LiveView = {
    id:"test", title:"Тестовый турнир", status:"running", serverTime:new Date().toISOString(),
    state:{config:DEFAULT_LIVE_CONFIG, clock:{running:false,elapsedSeconds:0,startedAt:null},tables:[],seats:[],orders:[],bounties:[],alerts:[]},
    clock:{index:0,remaining:level.seconds,elapsed:0,level,next:null,complete:false},players:[],balances:[],leaderboard:[],
  };
  const client = new QueryClient({defaultOptions:{queries:{enabled:false}}});
  client.setQueryData(["display","test",""],view);
  render(<MemoryRouter initialEntries={["/display/test"]}><QueryClientProvider client={client}><Routes><Route path="/display/:id" element={<HallDisplayPage/>}/></Routes></QueryClientProvider></MemoryRouter>);
}
describe("TV launch", () => {
  it("waits for a user gesture to enable sound and does not start the game clock", async () => {
    show();
    expect(audio.enable).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Начать показ со звуком"}));
    await waitFor(() => expect(screen.queryByRole("region",{name:"Запуск телевизора"})).not.toBeInTheDocument());
    expect(audio.enable).toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveAttribute("data-audio","enabled");
    expect(screen.getByText("ПАУЗА")).toBeInTheDocument();
  });
  it("allows viewing without sound", () => {
    show();
    fireEvent.click(screen.getByRole("button",{name:"Показать без звука"}));
    expect(screen.queryByRole("region",{name:"Запуск телевизора"})).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-audio","muted");
  });
});
