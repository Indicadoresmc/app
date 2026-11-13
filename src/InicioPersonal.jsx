import React,{useEffect,useMemo,useState}from'react';
import{CheckCircle2,AlertTriangle}from'lucide-react';
import{supabase}from'./supabase';
import{puntajeSkap}from'./capacitacion';

// Inicio del panel personal: el mes de un vistazo, un calendario con el color de cada día
// y el detalle de todo lo que hizo la persona el día elegido.
const n=v=>Number(v||0);
const fmt=v=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(n(v));
const pct1=v=>`${n(v).toFixed(1).replace('.',',')}%`;
const hm=s=>{const m=Math.round(n(s)/60);return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`};
const hhmm=v=>v?String(v).slice(0,5):'—';
const DIAS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// Mismos cortes que el resto de la app: 95% o más cumple, 85–95 atención, menos de 85 debajo.
export const nivel=c=>c==null?'sin':c>=95?'ok':c>=85?'cerca':'bajo';
const TXT={ok:'Cumplió el objetivo',cerca:'Cerca del objetivo',bajo:'Debajo del objetivo',sin:'Sin picking',franco:'Sin actividad'};
const esErrorVoice=r=>n(r.total_errores)>0;
const estadoLogueo=s=>/^verde/i.test(s||'')?['A horario','ok']:/^amarillo/i.test(s||'')?['Tolerancia','cerca']:/^rojo/i.test(s||'')?['Demorado','bajo']:[s||'Sin dato','sin'];

function prodDe(rows){let packs=0,seg=0,tp=0;rows.forEach(r=>{packs+=n(r.packs);seg+=n(r.duracion_segundos);tp+=n(r.target)*n(r.duracion_segundos)});const prod=seg?packs/(seg/3600):0,target=seg?tp/seg:0;return{packs,seg,prod,target,cum:target?prod/target*100:null}}

export default function InicioPersonal({periodo,profile,dia,setDia,irA}){
 const empleadoId=profile?.empleado_id||profile?.empleados?.id;
 const[datos,setDatos]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let vivo=true;if(!periodo||!empleadoId)return;setDatos(null);setError('');
  const mm=String(periodo.mes).padStart(2,'0'),fin=new Date(periodo.anio,periodo.mes,0).getDate(),desde=`${periodo.anio}-${mm}-01`,hasta=`${periodo.anio}-${mm}-${fin}`;
  const porPeriodo=t=>supabase.from(t).select('*').eq('periodo_id',periodo.id).eq('empleado_id',empleadoId);
  Promise.all([porPeriodo('picking'),porPeriodo('clasificacion_manual'),porPeriodo('errores_gatera'),porPeriodo('errores_voice'),porPeriodo('autoelevador_diario'),
   supabase.from('autoelevador_logueo').select('*').eq('empleado_id',empleadoId).gte('fecha',desde).lte('fecha',hasta),
   supabase.from('capacitacion_skap').select('*').eq('empleado_id',empleadoId),supabase.from('capacitacion_plan').select('estado').eq('empleado_id',empleadoId)])
  .then(r=>{if(!vivo)return;const[p,c,g,v,a,l,s,pl]=r.map(x=>x.error?[]:(x.data||[]));setDatos({picking:p,clasif:c,gatera:g,voice:v,ae:a,logueo:l,skap:s,plan:pl})})
  .catch(e=>vivo&&setError(e.message||'No se pudieron cargar los datos.'));
  return()=>{vivo=false}},[periodo?.id,empleadoId]);

 const calc=useMemo(()=>{if(!datos||!periodo)return null;const{picking,clasif,gatera,voice,ae,logueo,skap,plan}=datos;
  const porFecha=(rows)=>{const m=new Map();rows.forEach(r=>{const f=String(r.fecha||'').slice(0,10);if(!f)return;if(!m.has(f))m.set(f,[]);m.get(f).push(r)});return m};
  const P=porFecha(picking),C=porFecha(clasif),G=porFecha(gatera),V=porFecha(voice.filter(esErrorVoice)),A=porFecha(ae),L=porFecha(logueo);
  const mes=prodDe(picking),paletas=picking.reduce((s,r)=>s+n(r.pallets),0),errores=gatera.length+voice.filter(esErrorVoice).length;
  const objC=clasif.reduce((s,r)=>s+n(r.objetivo),0),realC=clasif.reduce((s,r)=>s+n(r.real),0);
  const rendAE=ae.length?ae.reduce((s,r)=>s+n(r.rendimiento),0)/ae.length:null,verdes=logueo.filter(x=>/^verde/i.test(x.semaforo||'')).length;
  const sk=skap.length?Math.max(...skap.map(puntajeSkap)):null,pend=plan.filter(x=>x.estado==='NOK').length;
  const tarjetas=[
   picking.length&&{titulo:'PICKING',valor:`${fmt(mes.prod)} b/h`,sub:mes.cum!=null?`${Math.round(mes.cum)}% del target ${fmt(mes.target)}`:'Sin target',nivel:nivel(mes.cum),tab:'picking'},
   picking.length&&{titulo:'PALETAS ARMADAS',valor:fmt(paletas),sub:`${P.size} ${P.size===1?'día':'días'} de picking`,nivel:'neutro',tab:'picking'},
   (picking.length||errores)&&{titulo:'ERRORES SOBRE PALETAS',valor:paletas?pct1(errores/paletas*100):'—',sub:`${errores} ${errores===1?'error':'errores'} ÷ ${fmt(paletas)} paletas`,nivel:errores?'cerca':'ok',tab:'errores'},
   clasif.length&&{titulo:'CLASIFICACIÓN',valor:objC?`${Math.round(realC/objC*100)}%`:'—',sub:`${C.size} días registrados`,nivel:objC?nivel(realC/objC*100):'sin',tab:'manual'},
   ae.length&&{titulo:'AUTOELEVADOR',valor:pct1(rendAE),sub:`Rendimiento · ${A.size} días`,nivel:rendAE>=80?'ok':rendAE>=70?'cerca':'bajo',tab:'autoelevador'},
   logueo.length&&{titulo:'LOGUEO AE',valor:pct1(verdes/logueo.length*100),sub:`${verdes} de ${logueo.length} a horario`,nivel:verdes/logueo.length>=.85?'ok':verdes/logueo.length>=.75?'cerca':'bajo',tab:'logueo'},
   sk!=null&&{titulo:'SKAP',valor:`${Math.round(sk*100)}%`,sub:pend?`${pend} entrenamiento${pend===1?'':'s'} pendiente${pend===1?'':'s'}`:'Plan de acción al día',nivel:sk>=.9?'ok':sk>=.7?'cerca':'bajo',tab:'capacitacion'}
  ].filter(Boolean);
  const dias=new Map();const fechas=new Set([...P.keys(),...C.keys(),...G.keys(),...V.keys(),...A.keys(),...L.keys()]);
  fechas.forEach(f=>{const pk=P.get(f)||[],pr=prodDe(pk);dias.set(f,{fecha:f,picking:pk,prod:pr,paletas:pk.reduce((s,r)=>s+n(r.pallets),0),clasif:C.get(f)||[],gatera:G.get(f)||[],voice:V.get(f)||[],ae:A.get(f)||[],logueo:L.get(f)||[],nivel:pk.length?nivel(pr.cum):'otra'})});
  return{tarjetas,dias}},[datos,periodo]);

 if(error)return <div className="error">No se pudo cargar el inicio: {error}</div>;
 if(!calc)return <div className="center"><b>Cargando tu mes...</b></div>;
 const{anio,mes}=periodo,mm=String(mes).padStart(2,'0'),total=new Date(anio,mes,0).getDate(),blancos=(new Date(anio,mes-1,1).getDay()+6)%7;
 const fechaSel=dia&&dia.startsWith(`${anio}-${mm}-`)?dia:[...calc.dias.keys()].sort().pop()||`${anio}-${mm}-01`;
 const d=calc.dias.get(fechaSel),nd=+fechaSel.slice(8),titulo=`${DIAS[new Date(anio,mes-1,nd).getDay()]} ${nd} de ${MESES[mes]}`;
 const errDia=d?[...d.gatera.map(e=>({tipo:e.motivo||'Error',origen:'Gatera',det:[e.cancha,e.sku&&`SKU ${e.sku}`,e.cantidad&&`${e.cantidad} u.`,e.paleta&&`paleta ${e.paleta}`].filter(Boolean).join(' · ')})),...d.voice.map(e=>({tipo:e.motivo||'Error',origen:'Voice Picking',det:[e.cancha,e.numero_paleta&&`paleta ${e.numero_paleta}`,e.datos_originales?.verificador&&`verificó ${e.datos_originales.verificador}`].filter(Boolean).join(' · ')}))]:[];
 const niv=d?(d.picking.length?d.nivel:'otra'):'franco';
 return <>
  {calc.tarjetas.length>0&&<section className="ini-resumen" aria-label="Tu mes de un vistazo">{calc.tarjetas.map(t=><button type="button" key={t.titulo} className={'ini-card n-'+t.nivel} onClick={()=>irA(t.tab)}><span>{t.titulo}</span><b>{t.valor}</b><small>{t.sub}</small><em>Ver detalle →</em></button>)}</section>}
  <section className="ini-grid">
   <div className="ini-cal panel">
    <div className="ini-cal-head"><h2>{MESES[mes][0].toUpperCase()+MESES[mes].slice(1)} {anio}</h2><small>Tocá un día</small></div>
    <div className="ini-semana">{['LU','MA','MI','JU','VI','SÁ','DO'].map(x=><span key={x}>{x}</span>)}</div>
    <div className="ini-dias">{Array.from({length:blancos},(_,i)=><span key={'b'+i}/>)}{Array.from({length:total},(_,i)=>{const f=`${anio}-${mm}-${String(i+1).padStart(2,'0')}`,x=calc.dias.get(f),err=x&&(x.gatera.length+x.voice.length);
     return <button type="button" key={f} className={'ini-dia n-'+(x?x.nivel:'vacio')+(f===fechaSel?' sel':'')} onClick={()=>setDia(f)} aria-label={`${i+1} de ${MESES[mes]}`}><b>{i+1}</b><small>{x?(err?'● ':'')+(x.prod.cum!=null&&x.picking.length?`${Math.round(x.prod.cum)}%`:'✓'):''}</small></button>})}</div>
    <div className="ini-ley"><span><i className="n-ok"/>Cumplió (95%+)</span><span><i className="n-cerca"/>Cerca (85–94%)</span><span><i className="n-bajo"/>Debajo</span><span><i className="n-otra"/>Otra tarea</span><span>● Hubo error</span></div>
   </div>
   <div className="ini-detalle">
    <div className="panel">
     <div className="ini-dia-head"><div><small>TU DÍA</small><h2>{titulo}</h2></div><span className={'ini-chip n-'+niv}>{d?(d.picking.length?TXT[d.nivel]:'Otra tarea'):TXT.franco}</span></div>
     <div className="ini-mini"><div><span>PRODUCTIVIDAD</span><b>{d?.picking.length?`${fmt(d.prod.prod)} b/h`:'—'}</b></div><div><span>CUMPLIMIENTO</span><b>{d?.prod.cum!=null&&d.picking.length?`${Math.round(d.prod.cum)}%`:'—'}</b></div><div><span>PALETAS</span><b>{d?.picking.length?fmt(d.paletas):'—'}</b></div><div><span>ERRORES</span><b>{d?errDia.length:'—'}</b></div></div>
    </div>
    <div className="panel">
     <h3 className="ini-h3">Qué hiciste ese día</h3>
     {!d&&<p className="ini-vacio">No tenés actividad registrada este día.</p>}
     {d?.picking.map((r,i)=>{const c=r.target?n(r.productividad)/n(r.target)*100:null;return <div className="ini-act" key={'p'+i}><span className="court">{r.cancha}</span><div><div className="ini-act-top"><span>Picking · {hhmm(r.inicio)}–{hhmm(r.fin)} · {fmt(r.packs)} bultos · {fmt(r.pallets)} paletas</span><b>{fmt(r.productividad)} b/h{r.target?` · target ${fmt(r.target)}`:''}</b></div><div className="ini-barra"><i className={'n-'+nivel(c)} style={{width:`${Math.min(100,(c||0)*.8)}%`}}/><em/></div></div></div>})}
     {d?.clasif.map((r,i)=>{const c=n(r.objetivo)?n(r.real)/n(r.objetivo)*100:null;return <div className="ini-otra" key={'c'+i}><span className="ini-tag">Clasificación</span><span>Objetivo {fmt(r.objetivo)} · real {fmt(r.real)}</span><span className={'ini-chip n-'+nivel(c)}>{c!=null?`${Math.round(c)}%`:'—'}</span></div>})}
     {d?.ae.map((r,i)=><div className="ini-otra" key={'a'+i}><span className="ini-tag">Autoelevador</span><span>Efectivo {hm(r.tiempo_efectivo_segundos)} · muerto {hm(r.tiempo_muerto_segundos)}</span><span className={'ini-chip n-'+(n(r.rendimiento)>=80?'ok':n(r.rendimiento)>=70?'cerca':'bajo')}>{pct1(r.rendimiento)}</span></div>)}
     {d?.logueo.map((r,i)=>{const[t,k]=estadoLogueo(r.semaforo);return <div className="ini-otra" key={'l'+i}><span className="ini-tag">Logueo AE</span><span>Entró {hhmm(r.primer_logueo)} (horario {hhmm(r.hora_esperada)}){r.ae_inicial?` · máquina ${r.ae_inicial}`:''}</span><span className={'ini-chip n-'+k}>{t}</span></div>})}
    </div>
    <div className="panel">
     <h3 className="ini-h3">Errores del día</h3>
     {d&&!errDia.length&&<p className="ini-ok"><CheckCircle2/>Sin errores este día.</p>}
     {!d&&<p className="ini-vacio">—</p>}
     {errDia.map((e,i)=><div className="ini-err" key={i}><span className="ini-chip n-bajo"><AlertTriangle/>{e.tipo}</span><span className="ini-tag">{e.origen}</span><span>{e.det}</span></div>)}
    </div>
   </div>
  </section>
 </>;
}
