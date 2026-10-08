import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { HostPlayerControls } from "../pages/LiveHostControls";
import { api } from "../lib/api";

describe("hostess issue after reaching credit limit",()=>{
  it("fulfils the existing pending request with payment instead of creating a second rebuy",async()=>{
    vi.spyOn(api,"get").mockImplementation(async(path:string)=>path.startsWith("/prizes")?{total:0,active:[],lines:[]}:path.startsWith("/live/credit")?{debtRub:3000,limitRub:3000,remainingRub:0}:{players:[]} as never);
    const post=vi.spyOn(api,"post").mockResolvedValue({});vi.spyOn(window,"confirm").mockReturnValue(true);
    const menu=[{id:"rebuy",title:"Ребай",kind:"rebuy" as const,priceRub:1000,chips:40000,isActive:true,isPromo:false,isFixed:true,sortOrder:1,bundle:[]}];
    const client=new QueryClient();
    const view=render(<QueryClientProvider client={client}><HostPlayerControls id="event" userId="player" menu={menu}/></QueryClientProvider>);
    fireEvent.click(screen.getByText("Ребай",{exact:true}));
    view.rerender(<QueryClientProvider client={client}><HostPlayerControls id="event" userId="player" menu={menu} pendingOrders={[{id:"pending",userId:"player",menuItemId:"rebuy",title:"Ребай",priceRub:1000,quantity:1,state:"pending",createdAt:new Date().toISOString()}]}/></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Оплата при выдаче"),{target:{value:"cash"}});fireEvent.click(screen.getByRole("button",{name:"Выдать и записать"}));
    await waitFor(()=>expect(post).toHaveBeenCalledWith("/live/event/orders/pending/fulfil",{method:"cash"}));expect(post).toHaveBeenCalledTimes(1);
  });
});
