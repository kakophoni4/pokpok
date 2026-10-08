import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TVConnectPage } from "../pages/TVConnectPage";
import { api } from "../lib/api";
vi.mock('../pages/HallDisplay',()=>({HallDisplayPage:({connection,onDisconnect}:any)=><div>{connection.id}<button onClick={onDisconnect}>Сменить турнир</button></div>}));
describe('TV pairing',()=>{
 it('rejects a missing code then remembers a valid connection through reload and allows switching',async()=>{
  const post=vi.spyOn(api,'post').mockRejectedValueOnce(new Error('Код турнира не найден')).mockResolvedValueOnce({id:'event',token:'readonly'});
  const view=render(<TVConnectPage/>);
  expect(screen.getByRole('button',{name:'Подключить телевизор'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Код турнира'),{target:{value:'123456'}});
  fireEvent.submit(screen.getByLabelText('Код турнира').closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Код турнира не найден');
  fireEvent.submit(screen.getByLabelText('Код турнира').closest('form')!);
  await screen.findByText('event');
  expect(post).toHaveBeenLastCalledWith('/live/display/connect',{code:'123456'});
  expect(JSON.parse(localStorage.getItem('concept-tv-connection')!)).toEqual({id:'event',token:'readonly'});
  view.unmount(); render(<TVConnectPage/>);
  expect(screen.getByText('event')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Сменить турнир'}));
  expect(localStorage.getItem('concept-tv-connection')).toBeNull();
  expect(screen.getByLabelText('Код турнира')).toHaveValue('');
 });
});
