import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEFAULT_LIVE_CONFIG, LiveConfig, type BlindLevel } from "@poker/contracts";
import { useAuth } from "../auth/auth-context";
import { api } from "../lib/api";
import { Button, ErrorState } from "../components/ui";
import "./blind-editor.css";

type Template = { id: string; title: string; config: LiveConfig };
const deadlines = ["registrationClosesLevel", "rebuyClosesLevel", "addonLevel"] as const;
export function replaceBlindLevels(config: LiveConfig, levels: BlindLevel[]): LiveConfig {
  const next = { ...config, levels };
  for (const key of deadlines) {
    const target = config.levels[config[key] - 1];
    const index = target ? levels.indexOf(target) : -1;
    next[key] = index >= 0 ? index + 1 : Math.min(config[key], levels.length);
  }
  return next;
}
const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};
const countLabel = (n:number, forms:[string,string,string]) => `${n} ${forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`;

export function LiveSetup({ id, saved, initialConfig }: { id: string; saved: ()=>void; initialConfig?: LiveConfig }) {
  const { user } = useAuth();
  const [config,setConfig] = useState<LiveConfig>(initialConfig ?? DEFAULT_LIVE_CONFIG);
  const [templateId,setTemplateId] = useState("");
  const [title,setTitle] = useState("");
  const [minutes,setMinutes] = useState(20);
  const [dirty,setDirty] = useState(false);
  const [notice,setNotice] = useState("");
  const templates = useQuery({ queryKey:["blind-templates"],queryFn:()=>api.get<Template[]>("/live/templates") });
  const change = (next: LiveConfig) => { setConfig(next);setDirty(true);setNotice(""); };
  const parsed = LiveConfig.safeParse(config);
  const valid = parsed.success && config.levels.some(l=>!l.break);
  const errors = !parsed.success ? "Проверьте значения: длительность 1–240 минут, не больше 100 этапов, количество мест 2–10." : !valid ? "Добавьте хотя бы один игровой уровень." : "";
  const store = useMutation({ mutationFn:()=>api.post<Template[]>("/live/templates",{id:templateId||undefined,title:title.trim(),config:parsed.success?parsed.data:config}), onSuccess:async rows=>{
    const item=templateId?rows.find(t=>t.id===templateId):rows.at(-1);
    if(item) setTemplateId(item.id);
    setDirty(false);setNotice("Шаблон сохранён");await templates.refetch();
  } });
  const remove = useMutation({ mutationFn:()=>api.delete(`/live/templates/${templateId}`), onSuccess:async()=>{setTemplateId("");setTitle("");setNotice("Шаблон удалён");await templates.refetch();} });
  const apply = useMutation({ mutationFn:()=>api.post(`/live/${id}/actions`,{type:"configure",config:parsed.success?parsed.data:config}),onSuccess:saved });
  const busy=store.isPending||remove.isPending||apply.isPending;
  const select = (value:string) => {
    if(dirty && !confirm("Открыть другой шаблон? Несохранённые изменения будут сброшены.")) return;
    const t=templates.data?.find(t=>t.id===value);
    setTemplateId(value);setTitle(t?.title ?? "");setDirty(false);setNotice("");store.reset();
    if(t) setConfig(id?{...config,levels:t.config.levels,registrationClosesLevel:t.config.registrationClosesLevel,rebuyClosesLevel:t.config.rebuyClosesLevel,addonLevel:t.config.addonLevel}:t.config);
    else setConfig(id?{...config,levels:DEFAULT_LIVE_CONFIG.levels,registrationClosesLevel:DEFAULT_LIVE_CONFIG.registrationClosesLevel,rebuyClosesLevel:DEFAULT_LIVE_CONFIG.rebuyClosesLevel,addonLevel:DEFAULT_LIVE_CONFIG.addonLevel}:DEFAULT_LIVE_CONFIG);
  };
  const patch = (index:number, patch:Partial<BlindLevel>) => change({...config,levels:config.levels.map((l,i)=>i===index?{...l,...patch}:l)});
  const add = (after:number, rest:boolean) => {
    const preceding = config.levels.slice(0,after+1).filter(l=>!l.break).at(-1);
    const small=preceding ? preceding.big : 100;
    const l:BlindLevel={title:rest?"Перерыв":`Уровень ${config.levels.filter(l=>!l.break).length+1}`,small:rest?0:small,big:rest?0:small*2,ante:rest?0:small*2,seconds:rest?900:minutes*60,break:rest};
    const levels=[...config.levels];levels.splice(after+1,0,l);change(replaceBlindLevels(config,levels));
  };
  const move = (index:number,delta:number) => {const levels=[...config.levels];[levels[index],levels[index+delta]]=[levels[index+delta]!,levels[index]!];change(replaceBlindLevels(config,levels));};
  const numeric = (key:"maxTables"|"seatsPerTable"|"bountyPoints",label:string,max:number,min=1) => <label>{label}<input className="field" type="number" min={min} max={max} step="1" value={config[key]} onChange={e=>change({...config,[key]:Number(e.target.value)})}/></label>;
  return <div className="blind-editor">
    <section className="blind-panel blind-template"><div className="blind-heading"><h2>{id?"Подготовка турнира":"Шаблоны блайндов"}</h2><span>{dirty?"Есть изменения":""}</span></div>
      <div className="blind-template-fields"><label>Сохранённый шаблон<select className="field" aria-label="Сохранённый шаблон" value={templateId} onChange={e=>select(e.target.value)} disabled={busy||templates.isPending}><option value="">Новый шаблон</option>{templates.data?.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      {user?.role==="admin"&&<label>Название шаблона<input className="field" placeholder="Например, клубный · 20 минут" maxLength={80} value={title} onChange={e=>{setTitle(e.target.value);setDirty(true);setNotice("");}}/></label>}
      {user?.role==="admin"&&<div className="blind-template-actions"><Button loading={store.isPending} disabled={busy||!valid||!title.trim()} onClick={()=>store.mutate()}>Сохранить шаблон</Button>{templateId&&<Button variant="ghost" disabled={busy} onClick={()=>{if(confirm(`Удалить шаблон «${title}»? Настройки турниров сохранятся.`))remove.mutate();}}>Удалить</Button>}</div>}</div>
      {notice&&<p role="status" className="blind-notice">{notice}</p>}{(templates.error||store.error||remove.error)&&<ErrorState error={templates.error||store.error||remove.error}/ >}
    </section>
    {id&&<section className="blind-panel"><h2>Столы и формат игры</h2><div className="blind-settings">{numeric("maxTables","Количество столов",30)}{numeric("seatsPerTable","Мест за столом",10,2)}<label>Баунти<select className="field" value={config.bountyMode} onChange={e=>change({...config,bountyMode:e.target.value as LiveConfig["bountyMode"]})}><option value="none">Без баунти</option><option value="rating">Очки за выбивание</option><option value="lottery">Лототрон</option></select></label>{config.bountyMode==="rating"&&numeric("bountyPoints","Очков за выбивание",100000,0)}</div></section>}
    <section className="blind-panel"><div className="blind-heading"><div><h2>Блайнды и перерывы</h2><p>Малый и большой блайнды, время каждого уровня и перерывы между ними.</p></div><div className="blind-duration"><strong>{duration(config.levels.reduce((n,l)=>n+l.seconds,0))}</strong><span>{countLabel(config.levels.filter(l=>!l.break).length,["уровень","уровня","уровней"])} · {countLabel(config.levels.filter(l=>l.break).length,["перерыв","перерыва","перерывов"])}</span></div></div>
      <div className="blind-bulk"><label>Длительность уровней, мин<input className="field" type="number" min="1" max="240" step="1" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><Button variant="secondary" disabled={!Number.isInteger(minutes)||minutes<1||minutes>240} onClick={()=>change({...config,levels:config.levels.map(l=>l.break?l:{...l,seconds:minutes*60})})}>Для всех уровней</Button><span>Анте равно большому блайнду</span></div>
      <div className="blind-table"><div className="blind-table-head"><span>Этап</span><span>Малый блайнд</span><span>Большой блайнд</span><span>Анте</span><span>Минуты</span><span>Порядок</span></div>
      {config.levels.map((l,i)=><div className={`blind-table-row ${l.break?"blind-break":""}`} key={i}>
        <div className="blind-stage"><span className="blind-number">{String(i+1).padStart(2,"0")}</span><input className="field" aria-label={`Название этапа ${i+1}`} value={l.title} maxLength={80} onChange={e=>patch(i,{title:e.target.value})}/></div>
        {l.break?<div className="blind-break-caption">Перерыв</div>:<><label><span>Малый блайнд</span><input className="field" type="number" min="0" step="1" aria-label={`Малый блайнд этапа ${i+1}`} value={l.small} onChange={e=>patch(i,{small:Number(e.target.value)})}/></label><label><span>Большой блайнд</span><input className="field" type="number" min="0" step="1" aria-label={`Большой блайнд этапа ${i+1}`} value={l.big} onChange={e=>patch(i,{big:Number(e.target.value),ante:Number(e.target.value)})}/></label><div className="blind-ante"><span>Анте</span><strong>{l.big.toLocaleString("ru-RU")}</strong></div></>}
        <label className="blind-minutes"><span>Минуты</span><input className="field" type="number" min="1" max="240" step="1" aria-label={`Минуты этапа ${i+1}`} value={l.seconds/60} onChange={e=>patch(i,{seconds:Number(e.target.value)*60})}/></label>
        <div className="blind-row-actions"><button type="button" aria-label={`Поднять этап ${i+1}`} disabled={!i||busy} onClick={()=>move(i,-1)}>↑</button><button type="button" aria-label={`Опустить этап ${i+1}`} disabled={i===config.levels.length-1||busy} onClick={()=>move(i,1)}>↓</button><button type="button" aria-label={`Удалить этап ${i+1}`} disabled={config.levels.length<=1||busy} onClick={()=>change(replaceBlindLevels(config,config.levels.filter((_,n)=>n!==i)))}>×</button></div>
        <button type="button" className="blind-insert-break" disabled={config.levels.length>=100||l.break||config.levels[i+1]?.break} onClick={()=>add(i,true)}>+ Перерыв после</button>
      </div>)}</div>
      <div className="blind-add-actions"><Button variant="secondary" disabled={config.levels.length>=100} onClick={()=>add(config.levels.length-1,false)}>+ Уровень</Button><Button variant="ghost" disabled={config.levels.length>=100} onClick={()=>add(config.levels.length-1,true)}>+ Перерыв</Button></div>
    </section>
    <section className="blind-panel"><h2>Регистрация и покупки фишек</h2><div className="blind-settings">{deadlines.map(key=><label key={key}>{({registrationClosesLevel:"Регистрация до конца",rebuyClosesLevel:"Ребаи до конца",addonLevel:"Когда выдавать адон"})[key]}<select className="field" value={config[key]} onChange={e=>change({...config,[key]:Number(e.target.value)})}>{config.levels.map((l,i)=><option key={i} value={i+1}>{i+1}. {l.title}</option>)}</select></label>)}</div></section>
    {errors&&<p role="alert" className="text-chip-red">{errors}</p>}{apply.error&&<ErrorState error={apply.error}/ >}
    {id&&<div className="blind-apply"><Button loading={apply.isPending} disabled={busy||!valid} onClick={()=>{if(confirm("Применить блайнды и настройки к этому турниру?"))apply.mutate();}}>Применить к турниру</Button></div>}
  </div>;
}
