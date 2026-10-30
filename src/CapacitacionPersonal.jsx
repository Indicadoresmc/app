import React,{useEffect,useMemo,useState}from'react';
import{GraduationCap,ClipboardList,Award,CheckCircle2,AlertTriangle,Ban}from'lucide-react';
import{supabase}from'./supabase';
import{TAREAS,IMAGEN_TAREA,puntajeSkap}from'./capacitacion';

// Habilidades/SKAP: cada persona ve su SKAP, su plan de acción y sus tareas habilitadas.
const pct=v=>v==null?'—':`${Math.round(v*100)}%`;
const fechaAR=v=>{const[y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'—'};
const colorPct=v=>v==null?'#9ca3af':v>=.9?'#00b050':v>=.7?'#ffc000':'#ff0000';
const sinTildes=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
function Kpi({titulo,valor,sub,accent}){return <div className="auto-kpi" style={{borderTopColor:accent}}><span>{titulo}</span><b>{valor}</b>{sub&&<small>{sub}</small>}</div>}
function Barra({titulo,valor,peso}){return <div className="cap-barra"><div className="cap-barra-top"><b>{titulo}</b><span>{peso}</span><strong style={{color:colorPct(valor)}}>{pct(valor)}</strong></div><div className="cap-track"><i style={{width:`${Math.min(100,(valor||0)*100)}%`,background:colorPct(valor)}}/></div></div>}

function MiSkap({skap}){
 if(!skap.length)return <div className="empty"><Award/><h3>Todavía no hay una evaluación SKAP cargada para vos.</h3></div>;
 return skap.map(s=>{const p=puntajeSkap(s);return <section className="panel auto-panel" key={s.id}>
  <h3>SKAP · {s.sector==='AE'?'Autoelevadores':s.sector} · Turno {s.turno}</h3>
  <div className="auto-kpi-grid cap-kpis"><Kpi titulo="PUNTAJE SKAP" valor={pct(p)} sub="Tu resultado general" accent={colorPct(p)}/><Kpi titulo="BÁSICO" valor={pct(s.basico)} sub="Pesa 50%" accent={colorPct(s.basico)}/><Kpi titulo="PROACTIVO" valor={pct(s.proactivo)} sub="Pesa 30%" accent={colorPct(s.proactivo)}/><Kpi titulo="EMPODERAMIENTO" valor={pct(s.empoderamiento)} sub="Pesa 20%" accent={colorPct(s.empoderamiento)}/></div>
  <Barra titulo="Habilidades básicas" peso="50%" valor={s.basico}/><Barra titulo="Proactivo" peso="30%" valor={s.proactivo}/><Barra titulo="Empoderamiento" peso="20%" valor={s.empoderamiento}/>
  <p className="detail-sub">El puntaje SKAP se calcula con las tres habilidades: básico vale 50%, proactivo 30% y empoderamiento 20%.</p>
 </section>});
}

function PlanAccion({plan}){
 const[verOk,setVerOk]=useState(false);
 const nok=plan.filter(x=>x.estado==='NOK'),ok=plan.filter(x=>x.estado==='OK');
 if(!plan.length)return <div className="empty"><ClipboardList/><h3>Todavía no hay un plan de acción cargado para vos.</h3></div>;
 const grupos={};(verOk?ok:nok).forEach(x=>{(grupos[x.habilidad||'Otros']=grupos[x.habilidad||'Otros']||[]).push(x)});
 const avance=plan.length?ok.length/plan.length:0,hoy=new Date().toISOString().slice(0,10);
 const fechas=[...new Set(nok.map(x=>x.fecha_objetivo).filter(Boolean))].sort();
 return <>
  <div className="auto-kpi-grid cap-kpis"><Kpi titulo="PENDIENTES" valor={nok.length} sub="Entrenamientos por completar" accent={nok.length?'#ff0000':'#00b050'}/><Kpi titulo="APROBADOS" valor={ok.length} sub={`de ${plan.length} entrenamientos`} accent="#00b050"/><Kpi titulo="AVANCE" valor={pct(avance)} accent={colorPct(avance)}/>{fechas.length>0&&<Kpi titulo="FECHA OBJETIVO" valor={fechaAR(fechas[0])} sub={fechas[0]<hoy?'Vencida':'Para completar los pendientes'} accent={fechas[0]<hoy?'#ff0000':'#ffc000'}/>}</div>
  <div className="cap-switch"><button className={!verOk?'sel':''} onClick={()=>setVerOk(false)}>Pendientes ({nok.length})</button><button className={verOk?'sel':''} onClick={()=>setVerOk(true)}>Aprobados ({ok.length})</button></div>
  {!verOk&&!nok.length?<div className="empty"><CheckCircle2/><h3>¡Estás al día! No tenés entrenamientos pendientes.</h3></div>:
  Object.entries(grupos).map(([h,items])=><section className="panel auto-panel" key={h}><h3>{h} <small className="cap-count">{items.length}</small></h3>
   <ul className="cap-lista">{items.map(x=><li key={x.id}><span className={'cap-dot '+(x.estado==='OK'?'ok':'nok')}/><div><b>{x.entrenamiento}</b>{x.estado==='NOK'&&x.fecha_objetivo&&<small>Fecha objetivo: {fechaAR(x.fecha_objetivo)}</small>}</div><span className="auto-status" style={{background:x.estado==='OK'?'#00b050':'#ff0000',color:'#fff'}}>{x.estado==='OK'?'OK':'Pendiente'}</span></li>)}</ul></section>)}
 </>;
}

function MisTareas({tareas}){
 if(!tareas.length)return <div className="empty"><GraduationCap/><h3>Todavía no están cargadas tus tareas en la matriz de habilidades.</h3></div>;
 const porTarea=new Map(tareas.map(t=>[sinTildes(t.tarea),t]));
 const lista=[...TAREAS.map(t=>porTarea.get(sinTildes(t))||{tarea:t,apto:false,sabe:false,falta:true}),...tareas.filter(t=>!TAREAS.some(x=>sinTildes(x)===sinTildes(t.tarea)))];
 const estado=t=>t.apto&&t.sabe?'sabe':t.apto?'capacitar':'no';
 const n=k=>lista.filter(t=>estado(t)===k).length;
 const ET={sabe:['Sabe y está apto','#00b050',CheckCircle2],capacitar:['Para capacitar','#ffc000',AlertTriangle],no:['No habilitado','#9ca3af',Ban]};
 return <>
  <div className="auto-kpi-grid cap-kpis"><Kpi titulo="SABE Y ESTÁ APTO" valor={n('sabe')} sub={`de ${lista.length} tareas`} accent="#00b050"/><Kpi titulo="PARA CAPACITAR" valor={n('capacitar')} sub="Apto, falta aprender" accent="#ffc000"/><Kpi titulo="NO HABILITADO" valor={n('no')} sub="No corresponde por ahora" accent="#9ca3af"/></div>
  <div className="cap-tareas">{lista.map(t=>{const e=estado(t),[txt,color,Icono]=ET[e],img=IMAGEN_TAREA[sinTildes(t.tarea)];return <div className={'cap-tarea '+e} key={t.tarea} style={{borderColor:color}}>
   {img&&<img src={img} alt="" loading="lazy" onError={ev=>{ev.currentTarget.style.display='none'}}/>}
   <b>{t.tarea}</b><span className="cap-estado" style={{color:e==='capacitar'?'#7a5c00':color}}><Icono/>{txt}</span>{e==='sabe'&&t.fecha_inicio&&<small>Desde {fechaAR(t.fecha_inicio).slice(3)}</small>}</div>})}</div>
 </>;
}

export default function CapacitacionPersonal({profile}){
 const empleadoId=profile?.empleado_id||profile?.empleados?.id;
 const[vista,setVista]=useState('tareas'),[data,setData]=useState({skap:[],plan:[],tareas:[]}),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let activo=true;(async()=>{if(!empleadoId){setBusy(false);return}setBusy(true);setError('');
  const[s,p,t]=await Promise.all([supabase.from('capacitacion_skap').select('*').eq('empleado_id',empleadoId),supabase.from('capacitacion_plan').select('*').eq('empleado_id',empleadoId).order('habilidad'),supabase.from('capacitacion_tareas').select('*').eq('empleado_id',empleadoId).order('orden')]);
  if(!activo)return;const err=s.error||p.error||t.error;if(err)setError(err.message);else setData({skap:s.data||[],plan:p.data||[],tareas:t.data||[]});setBusy(false)})();return()=>{activo=false}},[empleadoId]);
 const pendientes=useMemo(()=>data.plan.filter(x=>x.estado==='NOK').length,[data.plan]);
 if(busy)return <div className="center"><b>Cargando tus habilidades y SKAP...</b></div>;
 if(error)return <div className="error">No se pudieron cargar tus habilidades y SKAP: {error}</div>;
 const actualizado=[...data.skap,...data.plan,...data.tareas].map(x=>x.created_at).filter(Boolean).sort().pop();
 return <><div className="module-head errors-head"><div><h2>Habilidades/SKAP</h2><p>{profile.empleados?.apellido_nombre}{actualizado?` · actualizado el ${fechaAR(actualizado)}`:''}</p></div></div>
  <div className="cap-switch cap-main"><button className={vista==='tareas'?'sel':''} onClick={()=>setVista('tareas')}><GraduationCap/>Mis tareas</button><button className={vista==='skap'?'sel':''} onClick={()=>setVista('skap')}><Award/>Mi SKAP</button><button className={vista==='plan'?'sel':''} onClick={()=>setVista('plan')}><ClipboardList/>Plan de acción{pendientes>0&&<span className="menu-badge">{pendientes}</span>}</button></div>
  {vista==='tareas'?<MisTareas tareas={data.tareas}/>:vista==='skap'?<MiSkap skap={data.skap}/>:<PlanAccion plan={data.plan}/>}
 </>;
}
