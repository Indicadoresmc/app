import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Gauge, TimerReset, Truck } from 'lucide-react';
import { supabase } from './supabase';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const colorRendimiento = value => Number(value) < 70 ? '#FF0000' : Number(value) < 80 ? '#FFC000' : '#00B050';
const estadoRendimiento = value => Number(value) < 70 ? 'Bajo' : Number(value) < 80 ? 'Cerca' : 'Cumple';
const fechaAR = value => { const [y,m,d] = String(value || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : value; };
const secToHms = value => { const total = Math.max(0, Math.round(Number(value || 0))); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
const signedSecToHms = value => { const n = Number(value || 0); return `${n < 0 ? '-' : ''}${secToHms(Math.abs(n))}`; };
const pct = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

function Kpi({ title, value, sub, accent = '#00B050' }) {
  return <div className="auto-kpi" style={{ borderTopColor: accent }}><span>{title}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

function DataTable({ headers, children, minWidth = 900 }) {
  return <div className="auto-scroll"><table className="auto-table" style={{minWidth}}><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export default function AutoelevadorPersonal({ periodo, profile }) {
  const empleadoId = profile?.empleados?.id;
  const [tab, setTab] = useState('resumen');
  const [vista, setVista] = useState('mes');
  const [data, setData] = useState({ mensual: null, diario: [], pausas: [], horarios: [], evolucion: [] });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!periodo || !empleadoId) return;
      setBusy(true); setError(''); setVista('mes');
      const [m,d,p,h,e] = await Promise.all([
        supabase.from('autoelevador_mensual').select('*').eq('periodo_id', periodo).eq('empleado_id', empleadoId).maybeSingle(),
        supabase.from('autoelevador_diario').select('*').eq('periodo_id', periodo).eq('empleado_id', empleadoId).order('fecha'),
        supabase.from('autoelevador_pausas').select('*').eq('periodo_id', periodo).eq('empleado_id', empleadoId).order('fecha').order('inicio'),
        supabase.from('autoelevador_horario').select('*').eq('periodo_id', periodo).eq('empleado_id', empleadoId).order('fecha'),
        supabase.from('autoelevador_mensual').select('*,periodos(anio,mes)').eq('empleado_id', empleadoId),
      ]);
      const issue = m.error || d.error || p.error || h.error || e.error;
      if (!active) return;
      if (issue) setError(issue.message);
      else setData({ mensual:m.data, diario:d.data||[], pausas:p.data||[], horarios:h.data||[], evolucion:(e.data||[]).sort((a,b)=>(a.periodos?.anio||0)-(b.periodos?.anio||0)||(a.periodos?.mes||0)-(b.periodos?.mes||0)) });
      setBusy(false);
    }
    load(); return () => { active = false; };
  }, [periodo, empleadoId]);

  const fechas = useMemo(() => data.diario.map(x => x.fecha), [data.diario]);
  const diarioVisible = vista === 'mes' ? data.diario : data.diario.filter(x => x.fecha === vista);
  const pausasVisibles = vista === 'mes' ? data.pausas : data.pausas.filter(x => x.fecha === vista);
  const horarioDelDia = data.horarios.find(x => x.fecha === vista);
  const resumen = vista === 'mes' ? data.mensual : diarioVisible[0];

  const pausaStats = useMemo(() => {
    const items = pausasVisibles;
    const total = items.reduce((a,r)=>a+Number(r.duracion_segundos||0),0);
    return { cantidad:items.length, total, promedio:items.length?total/items.length:0, maxima:items.length?Math.max(...items.map(x=>Number(x.duracion_segundos||0))):0 };
  }, [pausasVisibles]);

  const promedioFranjas = useMemo(() => {
    if (!data.horarios.length) return [];
    const max = Math.max(...data.horarios.map(x => (x.valores_segundos||[]).length), 0);
    return Array.from({length:max},(_,i)=>data.horarios.reduce((a,r)=>a+Number((r.valores_segundos||[])[i]||0),0)/data.horarios.length);
  }, [data.horarios]);

  const labels = horarioDelDia?.etiquetas || data.horarios[0]?.etiquetas || [];
  const franjas = vista === 'mes' ? promedioFranjas : (horarioDelDia?.valores_segundos || []);
  const rendimiento = Number(resumen?.rendimiento || 0);

  if (busy) return <div className="center"><b>Cargando Autoelevador...</b></div>;
  if (error) return <div className="error">No se pudo cargar Autoelevador: {error}</div>;
  if (!data.mensual && !data.diario.length) return <div className="empty"><Truck/><h3>Sin actividad de Autoelevador registrada en este período.</h3></div>;

  return <>
    <div className="module-head errors-head"><div><h2>Autoelevador</h2><p>{profile.empleados?.apellido_nombre} · Turno {data.mensual?.turno || data.diario[0]?.turno || 'Sin dato'}</p></div><label className="day-filter"><span>VISTA</span><select value={vista} onChange={e=>setVista(e.target.value)}><option value="mes">Todo el mes</option>{fechas.map(f=><option key={f} value={f}>{fechaAR(f)}</option>)}</select></label></div>

    <div className="auto-kpi-grid">
      <Kpi title={vista==='mes'?'DÍAS TRABAJADOS':'JORNADA'} value={vista==='mes'?Number(resumen?.dias_trabajados||0):fechaAR(vista)} sub={vista==='mes'?'Fechas registradas':'Fecha seleccionada'} accent="#D1A33C"/>
      <Kpi title="TIEMPO EFECTIVO" value={secToHms(resumen?.tiempo_efectivo_segundos)} sub="Operación" accent="#5B9BD5"/>
      <Kpi title="TIEMPO MUERTO" value={secToHms(resumen?.tiempo_muerto_segundos)} sub="Valor del archivo" accent="#EF1B24"/>
      <Kpi title="TIEMPO RALENTÍ" value={secToHms(resumen?.tiempo_ralenti_segundos)} sub="Valor del archivo" accent="#FFC000"/>
      <Kpi title="RENDIMIENTO" value={pct(rendimiento)} sub={estadoRendimiento(rendimiento)} accent={colorRendimiento(rendimiento)}/>
    </div>

    <div className="auto-nav">{[['resumen','Resumen'],['diario','Día por día'],['evolucion','Evolución'],['pausas','Pausas'],['muerto','Tiempo muerto']].map(([id,t])=><button key={id} className={tab===id?'sel':''} onClick={()=>setTab(id)}>{t}</button>)}</div>

    {tab==='resumen' && <section className="panel auto-panel"><h3>Análisis individual</h3><div className="auto-identity"><div><span>OPERADOR</span><b>{profile.empleados?.apellido_nombre}</b></div><div><span>PERÍODO</span><b>{vista==='mes'?(data.mensual?.mes_texto || 'Mes seleccionado'):fechaAR(vista)}</b></div><div><span>TURNO</span><b>{data.mensual?.turno || data.diario[0]?.turno}</b></div></div><div className="auto-summary">{[['Tiempo efectivo',secToHms(resumen?.tiempo_efectivo_segundos)],['Tiempo muerto',secToHms(resumen?.tiempo_muerto_segundos)],['Tiempo ralentí',secToHms(resumen?.tiempo_ralenti_segundos)],['Horas netas',secToHms(resumen?.horas_netas_segundos)],['Objetivo',secToHms(resumen?.objetivo_segundos)],['Rendimiento',pct(rendimiento)]].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div></section>}

    {tab==='diario' && <section className="panel auto-panel"><h3>Detalle diario del mes y turno seleccionados</h3><DataTable headers={['Fecha','Operación','Tiempo muerto','Tiempo ralentí','Horas netas','Objetivo','Rendimiento','Diferencia','Estado']} minWidth={1050}>{diarioVisible.map(r=>{const c=colorRendimiento(r.rendimiento);return <tr key={r.id}><td><b>{fechaAR(r.fecha)}</b></td><td>{secToHms(r.tiempo_efectivo_segundos)}</td><td>{secToHms(r.tiempo_muerto_segundos)}</td><td>{secToHms(r.tiempo_ralenti_segundos)}</td><td>{secToHms(r.horas_netas_segundos)}</td><td>{secToHms(r.objetivo_segundos)}</td><td><span className="auto-status" style={{background:c,color:Number(r.rendimiento)>=70&&Number(r.rendimiento)<80?'#332800':'#fff'}}>{pct(r.rendimiento)}</span></td><td>{signedSecToHms(r.diferencia_segundos)}</td><td><b>{r.estado || estadoRendimiento(r.rendimiento)}</b></td></tr>})}</DataTable></section>}

    {tab==='evolucion' && <section className="panel auto-panel"><h3>Evolución de productividad</h3><p className="detail-sub">Los valores, variaciones, ponderado, mejor mes y tendencia provienen del Dashboard Evolución del Excel.</p><div className="auto-evolution">{data.evolucion.map(r=>{const c=colorRendimiento(r.rendimiento);return <div key={r.id}><span>{MESES[r.periodos?.mes] || r.mes_texto}</span><b style={{background:c,color:Number(r.rendimiento)>=70&&Number(r.rendimiento)<80?'#332800':'#fff'}}>{pct(r.rendimiento)}</b></div>})}</div>{data.evolucion.length>0&&<div className="auto-kpi-grid evolution-kpis"><Kpi title="VAR. ÚLTIMO MES" value={pct(data.evolucion.at(-1)?.variacion_ultimo_mes)}/><Kpi title="VAR. DESDE INICIO" value={pct(data.evolucion.at(-1)?.variacion_desde_inicio)}/><Kpi title="PROMEDIO PONDERADO" value={pct(data.evolucion.at(-1)?.promedio_ponderado)} accent={colorRendimiento(data.evolucion.at(-1)?.promedio_ponderado)}/><Kpi title="MEJOR MES" value={data.evolucion.at(-1)?.mejor_mes || 'Sin datos'} accent="#5B9BD5"/><Kpi title="TENDENCIA" value={data.evolucion.at(-1)?.tendencia || 'Sin datos'} accent="#00B050"/></div>}</section>}

    {tab==='pausas' && <section className="panel auto-panel"><h3>Análisis detallado de pausas</h3><p className="detail-sub">{vista==='mes'?'Resumen y detalle completo del período.':`Detalle correspondiente al ${fechaAR(vista)}.`}</p><div className="auto-kpi-grid pause-kpis"><Kpi title="CANTIDAD DE PAUSAS" value={pausaStats.cantidad}/><Kpi title="TIEMPO TOTAL" value={secToHms(pausaStats.total)} accent="#5B9BD5"/><Kpi title="PAUSA PROMEDIO" value={secToHms(pausaStats.promedio)} accent="#FFC000"/><Kpi title="PAUSA MÁXIMA" value={secToHms(pausaStats.maxima)} accent="#EF1B24"/></div><DataTable headers={['Fecha','Inicio','Fin','Duración','Duración (min)','Tipo','Clasificación']} minWidth={900}>{pausasVisibles.map(r=><tr key={r.id}><td><b>{fechaAR(r.fecha)}</b></td><td>{r.inicio}</td><td>{r.fin}</td><td><b>{secToHms(r.duracion_segundos)}</b></td><td>{Number(r.duracion_minutos||0).toFixed(1).replace('.',',')}</td><td>{r.tipo}</td><td>{r.clasificacion}</td></tr>)}</DataTable>{!pausasVisibles.length&&<div className="auto-no-data"><AlertTriangle/>Sin pausas registradas para la vista seleccionada.</div>}</section>}

    {tab==='muerto' && <section className="panel auto-panel"><h3>Tiempo muerto por franja horaria</h3><p className="detail-sub">{vista==='mes'?'Promedio mensual del operador.':`Valores del ${fechaAR(vista)}.`}</p><DataTable headers={['Vista',...labels]} minWidth={900}><tr><td><b>{vista==='mes'?'Promedio mensual':fechaAR(vista)}</b></td>{franjas.map((v,i)=><td key={i}><b>{secToHms(v)}</b></td>)}</tr></DataTable><div className="auto-bars">{franjas.map((v,i)=><div key={i}><span>{secToHms(v)}</span><em style={{height:`${Math.max(5,Math.min(190,Number(v||0)/12))}px`}}/><b>{labels[i] || `Franja ${i+1}`}</b></div>)}</div></section>}
  </>;
}
