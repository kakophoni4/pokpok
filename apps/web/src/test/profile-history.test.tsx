import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PlayerStats } from "@poker/contracts";
import { PlayerProfile } from "../components/PlayerProfile";
vi.mock("../components/RatingChart", () => ({ RatingChart: () => null }));
const stats: PlayerStats = {user:{id:"player",nickname:"Игрок",displayName:null,avatarUrl:null,role:"player"},seasonId:"season",points:0,rank:null,gamesPlayed:23,wins:0,top3:0,itm:0,bestPlace:null,avgPlace:null,progression:[],history:Array.from({length:23},(_,i)=>({id:`e${i}`,createdAt:"2026-10-08T12:00:00Z",points:i,place:null,comment:`Запись ${i+1}`,tournament:null,achievement:null,sourceType:"manual_adjustment"}))};
describe("profile history pages",()=>{
 it("keeps ten rows visible, reaches the final three and resets for another player",()=>{
  const show=(value:PlayerStats)=><MemoryRouter><PlayerProfile stats={value} achievements={[]}/></MemoryRouter>;
  const view=render(show(stats));
  expect(document.querySelectorAll('.profile-history-list > li')).toHaveLength(10);
  expect(screen.getByRole('button',{name:'Назад'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Далее'}));
  expect(screen.queryByText('Запись 1')).not.toBeInTheDocument();
  expect(screen.getByText('Запись 11')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Далее'}));
  expect(document.querySelectorAll('.profile-history-list > li')).toHaveLength(3);
  expect(screen.getByText('Запись 23')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Далее'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Назад'}));
  expect(screen.getByText('Запись 11')).toBeInTheDocument();
  view.rerender(show({...stats,user:{...stats.user,id:'other'}}));
  expect(screen.getByText('Запись 1')).toBeInTheDocument();
 });
});
