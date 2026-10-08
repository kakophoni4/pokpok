import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {DEFAULT_LIVE_CONFIG,type LiveView} from '@poker/contracts';
import {describe,expect,it,vi} from 'vitest';
import {LiveDesk} from '../pages/LivePages';
import {api} from '../lib/api';
vi.mock('../auth/auth-context',()=>({useAuth:()=>({user:null,can:()=>false})}));
function show(){
 const client=new QueryClient({defaultOptions:{queries:{enabled:false}}});
 const now=new Date().toISOString();
 const view:LiveView={id:'event',title:'Турнир',status:'running',serverTime:now,state:{config:{...DEFAULT_LIVE_CONFIG,seatsPerTable:10},tables:[{number:1,dealerId:'dealer',open:true,breakRequested:false}],seats:[{userId:'p1',table:1,seat:1,state:'playing',stack:40000,measuredAt:now,arrivedAt:now,wantsMove:false},{userId:'p2',table:1,seat:2,state:'playing',stack:80000,measuredAt:now,arrivedAt:now,wantsMove:false}],orders:[],bounties:[],alerts:[],clock:{running:false,elapsedSeconds:0,startedAt:null}},clock:null,players:[{id:'p1',name:'Игрок один'},{id:'p2',name:'Игрок два'}],balances:[],leaderboard:[]};
 client.setQueryData(['live','event'],view);client.setQueryData(['live-menu'],[{id:'rebuy',kind:'rebuy',isFixed:true,title:'Ребай',priceRub:1000}]);client.setQueryData(['live-awards'],[{id:'royal',title:'Роял-флеш',category:'game'}]);
 render(<MemoryRouter><QueryClientProvider client={client}><LiveDesk id='event' actorId='dealer' dealer/></QueryClientProvider></MemoryRouter>);
 return {client,view};
}
describe('dealer tablet selection',()=>{
 it('requests a rebuy without fulfilling it and disables duplicate requests while hostess issues it',async()=>{
  const post=vi.spyOn(api,'post').mockResolvedValue({ok:true});
  const {client,view}=show();
  fireEvent.click(screen.getByRole('button',{name:'Бокс 1, Игрок один'}),{detail:0});
  fireEvent.click(screen.getByRole('button',{name:'Ребай x2'}));
  await waitFor(()=>expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0]?.[0]).toBe('/live/orders');
  expect(post.mock.calls[0]?.[1]).toMatchObject({userId:'p1',quantity:2,tournamentId:'event'});
  const order={id:'request',userId:'p1',menuItemId:'rebuy',title:'Ребай',quantity:2,priceRub:1000,state:'pending' as const,createdAt:new Date().toISOString()};
  await act(async()=>client.setQueryData(['live','event'],{...view,state:{...view.state!,orders:[order]}}));
  expect(await screen.findByRole('status')).toHaveTextContent('Ребай ×2 · ожидает выдачи хостес');
  expect(screen.getByRole('button',{name:'Ребай x1'})).toBeDisabled();
  expect(screen.queryByRole('button',{name:'Выдано'})).not.toBeInTheDocument();
 });
 it('uses the configured seat count and allows player selection without asking the dealer to measure stacks',()=>{
  show();
  expect(screen.getByText('Выберите игрока')).toBeInTheDocument();
  expect(document.querySelectorAll('.dealer-seat')).toHaveLength(10);
  fireEvent.click(screen.getByRole('button',{name:'Бокс 1, Игрок один'}),{detail:0});
  expect(screen.getByRole('heading',{name:'Игрок один'})).toBeInTheDocument();
  expect(screen.queryByLabelText('Стек')).not.toBeInTheDocument();
  expect(screen.queryByText('40 000')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Бокс 2, Игрок два'}),{detail:0});
  expect(screen.getByRole('heading',{name:'Игрок два'})).toBeInTheDocument();
  expect(screen.queryByLabelText('Стек')).not.toBeInTheDocument();
  expect(screen.getByText('Роял-флеш')).not.toBeVisible();
  expect(screen.queryByText('Открыть экран зала')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Закрыть'}));
  expect(screen.getByText('Выберите игрока')).toBeInTheDocument();
 });
});
