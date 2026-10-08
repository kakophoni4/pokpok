import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AdminOverview } from "../pages/admin/AdminOverview";
import { api } from "../lib/api";

const overview={at:new Date().toISOString(),defaultCreditLimitRub:3000,cash:{date:"2026-10-08",cashRub:500,terminalRub:1000,paidRub:1500,unspecifiedRub:0,items:[]},players:20,staff:4,debtRub:3000,debtors:Array.from({length:12},(_,i)=>({userId:String(i),name:`Игрок ${i}`,debtRub:250,limitRub:3000,individual:false})),events:[],requests:[]};
describe("club overview",()=>{
  it("shows received money and paginates debtors without hiding search results",async()=>{
    vi.spyOn(api,"get").mockResolvedValue(overview);const navigate=vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><AdminOverview navigate={navigate}/></QueryClientProvider>);
    await screen.findByText("1 500 ₽",{exact:true});expect(screen.queryByText("Игрок 11",{exact:true})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Далее"}));expect(screen.getByText("Игрок 11",{exact:true})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Найти должника"),{target:{value:"Игрок 0"}});expect(screen.getByText("Игрок 0",{exact:true})).toBeInTheDocument();expect(screen.queryByText("Игрок 11",{exact:true})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Открыть игроков →"}));expect(navigate).toHaveBeenCalledWith("players");
  });
  it("saves zero as a real limit rather than restoring the default",async()=>{
    vi.spyOn(api,"get").mockResolvedValue(overview);const patch=vi.spyOn(api,"patch").mockResolvedValue({});
    render(<QueryClientProvider client={new QueryClient()}><AdminOverview navigate={()=>{}}/></QueryClientProvider>);
    await screen.findByLabelText("Общий для игроков, ₽");fireEvent.change(screen.getByLabelText("Общий для игроков, ₽"),{target:{value:"0"}});fireEvent.click(screen.getByRole("button",{name:"Сохранить"}));await waitFor(()=>expect(patch).toHaveBeenCalledWith("/club/settings",{defaultCreditLimitRub:0}));
  });
});
