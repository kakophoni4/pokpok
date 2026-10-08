import {describe,expect,it,vi} from 'vitest';
import {DEFAULT_LIVE_CONFIG} from '@poker/contracts';
import {LiveService} from './live.service';
import {initialState} from './live-engine';
describe('dealer stack permissions',()=>{
 it('rejects manual stack changes from a dealer even on their assigned tournament',async()=>{
  const service=new LiveService({} as never,{} as never,{} as never,{} as never);
  const state=initialState(DEFAULT_LIVE_CONFIG);
  const tx={tournament:{findUniqueOrThrow:vi.fn().mockResolvedValue({status:'running'})}};
  vi.spyOn(service,'locked').mockImplementation(async(_id,work)=>work(tx as never,state));
  await expect(service.action('event',{id:'dealer',role:'dealer',nickname:'Dealer',audience:'web',dealerTournamentId:'event',dealerShiftId:'shift',dealerTable:1},{type:'stack',userId:'player',stack:100000})).rejects.toMatchObject({status:403});
  expect(state.seats).toEqual([]);
 });
});
