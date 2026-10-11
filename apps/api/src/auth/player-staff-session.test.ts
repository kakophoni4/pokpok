import {describe,it,expect,vi} from "vitest";
import {AuthService} from "./auth.service";
import {TokenService} from "./token.service";
import {JwtAuthGuard} from "../common/auth/jwt-auth.guard";
import {RolesGuard} from "../common/auth/roles.guard";
import {AuthController} from "./auth.controller";

const user={id:"owner",nickname:"Owner",role:"admin",status:"active",identities:[],displayName:null,avatarUrl:null,createdAt:new Date()};
const profile={provider:"telegram" as const,providerUserId:"123",username:"owner",firstName:"Owner",lastName:null,photoUrl:null,raw:{}};
describe("player access is independent of stored staff role",()=>{
 it.each(["admin","floor","hostess","dealer"])("allows %s to enter through Telegram with player permissions",async role=>{
  const actual={...user,role};
  const db={identity:{findUnique:vi.fn().mockResolvedValue({id:"identity",user:actual}),update:vi.fn()},user:{update:vi.fn().mockResolvedValue(actual)}};
  const tokens={issue:vi.fn().mockResolvedValue({accessToken:"access",refreshToken:"refresh",expiresIn:900})};
  const auth=new AuthService(db as never,{} as never,tokens as never,{} as never,{} as never);
  const result=await auth.loginWithProvider(profile,"miniapp");
  expect(result.user).toMatchObject({id:user.id,role:"player"});
  expect(tokens.issue).toHaveBeenCalledWith({id:user.id,role:"player",nickname:user.nickname},"miniapp",{},false);
 });
 it.each([false,true])("refresh retains the session context, staffPassword=%s",async staffPassword=>{
  const session={id:"session",user,staffPassword,audience:"web",expiresAt:new Date(Date.now()+60000),revokedAt:null};
  const tx={session:{update:vi.fn(),create:vi.fn()}};
  const db={session:{findUnique:vi.fn().mockResolvedValue(session)},$transaction:vi.fn(async fn=>fn(tx))};
  const jwt={signAsync:vi.fn().mockResolvedValue("access")};
  const tokens=new TokenService(db as never,jwt as never,{get:vi.fn(key=>key==="ACCESS_TOKEN_TTL"?900:86400)} as never);
  const result=await tokens.rotate("refresh");
  expect(result.user.role).toBe(staffPassword?"admin":"player");
  expect(jwt.signAsync.mock.calls[0]![0]).toMatchObject({sub:user.id,role:staffPassword?"admin":"player"});
  expect(tx.session.create.mock.calls[0]![0].data.staffPassword).toBe(staffPassword);
 });
 it.each([false,true])("authorizes only the effective role, staffPassword=%s",async staffPassword=>{
  const request={headers:{authorization:"Bearer access"}} as any;
  const context={getHandler:()=>0,getClass:()=>0,switchToHttp:()=>({getRequest:()=>request})};
  const guard=new JwtAuthGuard({getAllAndOverride:()=>false} as never,{verifyAsync:async()=>({sub:user.id,role:"admin",aud:"web",staffPassword})} as never,{user:{findUnique:async()=>user}} as never,{} as never);
  expect(await guard.canActivate(context as never)).toBe(true);
  expect(request.user.role).toBe(staffPassword?"admin":"player");
  const roles=new RolesGuard({getAllAndOverride:()=>["admin"]} as never);
  if(staffPassword)expect(roles.canActivate(context as never)).toBe(true);
  else expect(()=>roles.canActivate(context as never)).toThrow();
 });
 it("does not restore staff privileges in /auth/me",async()=>{
  const controller=new AuthController({} as never,{} as never,{} as never,{getMe:async()=>user} as never,{} as never);
  const me=await controller.me({id:user.id,role:"player",nickname:user.nickname,audience:"miniapp"});
  expect(me.role).toBe("player");expect(me.id).toBe(user.id);
 });
 it("still rejects a blocked Telegram account",async()=>{
  const auth=new AuthService({identity:{findUnique:async()=>({id:"identity",user:{...user,status:"blocked"}})}} as never,{} as never,{} as never,{} as never,{} as never);
  await expect(auth.loginWithProvider(profile,"miniapp")).rejects.toThrow();
 });
});
