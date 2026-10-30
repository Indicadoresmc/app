import React,{useEffect,useMemo,useState}from'react';
import{Clock3,CalendarDays}from'lucide-react';
import{supabase}from'./supabase';

// Horas: cada persona ve solo su detalle de consolidación (saldo de francos, horas pagadas, capacitación, reuniones).
const fechaAR=v=>{const[y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'—'};
const horas=n=>n==null?'—':`${Number(n).toLocaleString('es-AR',{maximumFractionDigits:2})} h`;
const CONCEPTOS={
 884:{titulo:'SALDO DE FRANCOS',sub:n=>n>=0?'Horas a tu favor para francos compensatorios':'Horas que te quedan por compensar',color:n=>n>=0?'#00b050':'#ff0000',orden:1},
 477:{titulo:'HORAS COMPENSATORIAS PAGADAS',sub:()=>'Se pagaron en este período',color:()=>'#7030a0',orden:2},
 890:{titulo:'HORAS DE CAPACITACIÓN',sub:()=>'Capacitaciones del período',color:()=>'#ffc000',orden:3},
 549:{titulo:'HORAS DE REUNIÓN',sub:()=>'Reuniones del período',color:()=>'#2f6fb3',orden:4}
};
function Kpi({titulo,valor,sub,accent}){return <div className="auto-kpi" style={{borderTopColor:accent}}><span>{titulo}</span><b>{valor}</b>{sub&&<small>{sub}</small>}</div>}

export default function HorasPersonal({profile}){
 const empleadoId=profile?.empleado_id||profile?.empleados?.id;
 const[rows,setRows]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[periodo,setPeriodo]=useState('');
 useEffect(()=>{let activo=true;(async()=>{if(!empleadoId){setBusy(false);return}setBusy(true);setError('');
  const{data,error}=await supabase.from('horas_personal').select('*').eq('empleado_id',empleadoId).order('periodo_hasta',{ascending:false});
  if(!activo)return;if(error)setError(error.message);else{setRows(data||[]);if(data?.[0])setPeriodo(data[0].periodo_hasta)}setBusy(false)})();return()=>{activo=false}},[empleadoId]);
 const periodos=useMemo(()=>{const m=new Map;rows.forEach(r=>{if(!m.has(r.periodo_hasta))m.set(r.periodo_hasta,{desde:r.periodo_desde,hasta:r.periodo_hasta})});return[...m.values()].sort((a,b)=>b.hasta.localeCompare(a.hasta))},[rows]);
 if(busy)return <div className="center"><b>Cargando tus horas...</b></div>;
 if(error)return <div className="error">No se pudieron cargar tus horas: {error}</div>;
 if(!rows.length)return <div className="empty"><Clock3/><h3>Todavía no hay horas cargadas para vos.</h3></div>;
 const del=rows.filter(r=>r.periodo_hasta===periodo).sort((a,b)=>(CONCEPTOS[a.concepto]?.orden||9)-(CONCEPTOS[b.concepto]?.orden||9));
 const p=periodos.find(x=>x.hasta===periodo)||periodos[0];
 const saldos=periodos.map(x=>({...x,saldo:rows.find(r=>r.periodo_hasta===x.hasta&&r.concepto===884)?.cantidad})).filter(x=>x.saldo!=null).reverse();
 const maxAbs=Math.max(1,...saldos.map(x=>Math.abs(x.saldo)));
 return <>
  <div className="module-head errors-head"><div><h2>Horas</h2><p>{profile.empleados?.apellido_nombre} · período del {fechaAR(p?.desde)} al {fechaAR(p?.hasta)}</p></div></div>
  {periodos.length>1&&<div className="horas-periodo"><CalendarDays/><label>Período<select value={periodo} onChange={e=>setPeriodo(e.target.value)}>{periodos.map(x=><option key={x.hasta} value={x.hasta}>{fechaAR(x.desde)} al {fechaAR(x.hasta)}</option>)}</select></label></div>}
  <div className="auto-kpi-grid cap-kpis">{del.map(r=>{const c=CONCEPTOS[r.concepto];return <Kpi key={r.id} titulo={c?.titulo||String(r.descripcion||'').toUpperCase()} valor={horas(r.cantidad)} sub={c?c.sub(r.cantidad):undefined} accent={c?c.color(r.cantidad):'#6b7280'}/>})}</div>
  {saldos.length>1&&<section className="panel auto-panel"><h3>Evolución del saldo de francos</h3>
   <div className="horas-evol">{saldos.map(x=><div key={x.hasta} className="horas-evol-fila"><span>{fechaAR(x.hasta).slice(3)}</span><div className="horas-evol-barra"><i style={{width:`${Math.abs(x.saldo)/maxAbs*50}%`,[x.saldo>=0?'left':'right']:'50%',background:x.saldo>=0?'#00b050':'#ff0000'}}/></div><b style={{color:x.saldo>=0?'#00b050':'#ff0000'}}>{horas(x.saldo)}</b></div>)}</div></section>}
  <section className="panel auto-panel"><h3>Detalle del período</h3>
   <div className="auto-scroll"><table className="auto-table"><thead><tr><th>Concepto</th><th>Descripción</th><th>Cantidad</th></tr></thead>
   <tbody>{del.map(r=><tr key={r.id}><td>{r.concepto}</td><td>{r.descripcion}</td><td><b style={{color:r.cantidad<0?'#ff0000':undefined}}>{horas(r.cantidad)}</b></td></tr>)}</tbody></table></div>
   <p className="detail-sub">Datos del detalle de consolidación del período. Si algo no coincide con lo que tenés registrado, consultalo con tu supervisor.</p></section>
 </>;
}
