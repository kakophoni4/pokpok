import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LIVE_CONFIG, LiveConfig } from "@poker/contracts";
import { LiveSetup, replaceBlindLevels } from "../pages/LiveSetup";
import { api } from "../lib/api";

vi.mock("../auth/auth-context",()=>({useAuth:()=>({user:{role:"admin"}})}));
const wrapper=(node:React.ReactNode)=><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>;
describe("blind editor",()=>{
  it("keeps registration/rebuy/addon deadlines on their stages when inserting a break or reordering",()=>{
    const c=DEFAULT_LIVE_CONFIG;
    const rest={title:"Перерыв",small:0,big:0,ante:0,seconds:900,break:true};
    const inserted=replaceBlindLevels(c,[...c.levels.slice(0,3),rest,...c.levels.slice(3)]);
    expect(inserted.registrationClosesLevel).toBe(7);expect(inserted.rebuyClosesLevel).toBe(7);expect(inserted.addonLevel).toBe(8);
    const moved=[...inserted.levels];[moved[6],moved[7]]=[moved[7]!,moved[6]!];expect(replaceBlindLevels(inserted,moved).addonLevel).toBe(7);
    expect(replaceBlindLevels(inserted,inserted.levels.filter(l=>!l.break)).addonLevel).toBe(7);
  });
  it("saves valid rows and reuses the new template id on subsequent saves",async()=>{
    vi.spyOn(api,"get").mockResolvedValue([]);
    const post=vi.spyOn(api,"post").mockResolvedValue([{id:"template",title:"Клубный",config:DEFAULT_LIVE_CONFIG}]);
    render(wrapper(<LiveSetup id="" saved={()=>{}}/>));
    fireEvent.change(screen.getByLabelText("Название шаблона"),{target:{value:"Клубный"}});
    fireEvent.change(screen.getByLabelText("Большой блайнд этапа 1"),{target:{value:"300"}});
    fireEvent.click(screen.getAllByRole("button",{name:"+ Перерыв после"})[2]!);
    fireEvent.click(screen.getByRole("button",{name:"Сохранить шаблон"}));await screen.findByText("Шаблон сохранён");
    const input=post.mock.calls[0]![1] as {config:unknown};const valid=LiveConfig.parse(input.config);expect(valid.levels[0]!.ante).toBe(300);expect(valid.levels[3]).toMatchObject({break:true,seconds:900,small:0,big:0,ante:0});expect(valid.registrationClosesLevel).toBe(7);
    fireEvent.click(screen.getByRole("button",{name:"Сохранить шаблон"}));await waitFor(()=>expect(post).toHaveBeenLastCalledWith("/live/templates",expect.objectContaining({id:"template"})));
    expect(screen.queryByText("Количество столов")).not.toBeInTheDocument();
  });
  it("does not apply tournament settings without confirmation, and rejects invalid duration",async()=>{
    vi.spyOn(api,"get").mockResolvedValue([]);const post=vi.spyOn(api,"post").mockResolvedValue({});const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
    render(wrapper(<LiveSetup id="event" saved={()=>{}}/>));fireEvent.click(screen.getByRole("button",{name:"Применить к турниру"}));expect(confirm).toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Минуты этапа 1"),{target:{value:"0"}});expect(screen.getByRole("button",{name:"Применить к турниру"})).toBeDisabled();
  });
});
