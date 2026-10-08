import { describe, expect, it, vi } from "vitest";
import { LiveService } from "./live.service";
describe('TV connection codes',()=>{
 it('returns only the existing display credential without changing game state',async()=>{
  const findUnique=vi.fn().mockResolvedValue({tournamentId:'event',displayToken:'readonly',tournament:{status:'running'}});
  const service=new LiveService({liveTournament:{findUnique}} as never,{} as never,{} as never,{} as never);
  expect(await service.connectDisplay('123456')).toEqual({id:'event',token:'readonly'});
  expect(findUnique).toHaveBeenCalledWith({where:{displayCode:'123456'},select:{tournamentId:true,displayToken:true,tournament:{select:{status:true}}}});
 });
 it.each([null,{tournamentId:'event',displayToken:'readonly',tournament:{status:'draft'}},{tournamentId:'event',displayToken:'readonly',tournament:{status:'cancelled'}}])('rejects unknown or unpublished tournaments',async(row)=>{
  const service=new LiveService({liveTournament:{findUnique:vi.fn().mockResolvedValue(row)}} as never,{} as never,{} as never,{} as never);
  await expect(service.connectDisplay('123456')).rejects.toMatchObject({status:404});
 });
});
