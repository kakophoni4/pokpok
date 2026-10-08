import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, stubApi } from "./harness";
const admin={id:"admin",nickname:"Owner",role:"admin",status:"active",identities:[],displayName:null,avatarUrl:null,createdAt:new Date().toISOString()};
describe("admin password login and staff creation",()=>{
 it("shows only login and password without player terms or Telegram",async()=>{
  localStorage.removeItem("poker-club-rules-accepted");
  const log=stubApi([{match:"POST /auth/refresh",status:401},{match:"POST /auth/admin/login",status:401,body:{message:"Неверный логин или пароль"}}]);
  renderApp("/admin");await screen.findByRole("heading",{name:"Вход для администратора"});
  expect(screen.queryByText("Перед тем как продолжить")).not.toBeInTheDocument();expect(screen.queryByText(/Войти через Telegram/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Логин"),{target:{value:"Owner"}});fireEvent.change(screen.getByLabelText("Пароль"),{target:{value:"wrong-password"}});fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Неверный логин или пароль");expect(log.find(r=>r.path==="/auth/admin/login")?.body).toEqual({nickname:"Owner",password:"wrong-password"});
 });
 it("logs in, creates a password account and restores the admin cookie",async()=>{
  const responses=[{match:"GET /tournaments",body:[]},{match:"GET /auth/staff",body:[]},{match:"POST /auth/staff",body:{ok:true}}];
  const log=stubApi([{match:"POST /auth/refresh",status:401},{match:"POST /auth/admin/login",body:{accessToken:"access",expiresIn:900,user:admin}},...responses]);
  const view=renderApp("/admin");await screen.findByLabelText("Пароль");fireEvent.change(screen.getByLabelText("Логин"),{target:{value:"Owner"}});fireEvent.change(screen.getByLabelText("Пароль"),{target:{value:"test-password"}});fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
  await screen.findByRole("heading",{name:"Управление клубом"});fireEvent.click(screen.getByRole("tab",{name:"Персонал"}));await screen.findByRole("heading",{name:"Создать сотрудника"});
  fireEvent.change(screen.getByLabelText("Логин"),{target:{value:"Dealer_1"}});fireEvent.change(screen.getByLabelText("Пароль"),{target:{value:"staff-password"}});fireEvent.change(screen.getByLabelText("Роль"),{target:{value:"dealer"}});fireEvent.click(screen.getByRole("button",{name:/^Создать$/}));
  await waitFor(()=>expect(log.find(r=>r.path==="/auth/staff"&&r.method==="POST")?.body).toEqual({nickname:"Dealer_1",password:"staff-password",role:"dealer"}));await screen.findByText("Сотрудник создан.");
  expect(screen.getByLabelText("Пароль")).toHaveValue("");view.unmount();
  stubApi([{match:"POST /auth/refresh",body:{accessToken:"access",expiresIn:900}},{match:"GET /auth/me",body:admin},...responses]);renderApp("/admin");await screen.findByRole("heading",{name:"Управление клубом"});
 });
 it("does not expose the admin workspace to a hostess",async()=>{stubApi([{match:"POST /auth/refresh",body:{accessToken:"access",expiresIn:900}},{match:"GET /auth/me",body:{...admin,role:"hostess"}}]);renderApp("/admin");await screen.findByRole("heading",{name:"Вход для администратора"});expect(screen.queryByRole("tab",{name:"Персонал"})).not.toBeInTheDocument();});
});

