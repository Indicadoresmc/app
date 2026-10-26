import React,{useEffect,useState}from'react';
import{AlertTriangle,LogIn}from'lucide-react';
import{supabase}from'./supabase';
import{minutosOcupada}from'./logueoAE';

// Control de logueo en autoelevador: cada persona ve su propio ingreso día por día.
const MESES=['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fechaAR=v=>{const[y,m,d]=String(v||'').split('-');return y&&m&&d?`${d}/${m}/${y}`:v};
const hhmm=v=>v?String(v).slice(0,5):'—';
export const colorSemaforo=s=>/^verde/i.test(s||'')?'#00b050':/^amarillo/i.test(s||'')?'#ffc000':/^rojo/i.test(s||'')?'#ff0000':'#9ca3af';
export const textoSemaforo=s=>/^verde/i.test(s||'')?'A horario':/^amarillo/i.test(s||'')?'Tolerancia':/^rojo/i.test(s||'')?'Demorado':(s||'Sin dato');
export function Ocupada({ultimo,esperada}){const d=minutosOcupada(ultimo,esperada);if(d==null)return '—';return d>0?<b style={{color:'#c62828'}}>Ocupada hasta {hhmm(ultimo)} (+{d}′)</b>:<span>Libre desde {hhmm(ultimo)}</span>}
function Kpi({titulo,valor,sub,accent='#00b050'}){return <div className="auto-kpi" style={{borderTopColor:accent}}><span>{titulo}</span><b>{valor}</b>{sub&&<small>{sub}</small>}</div>}

export default function LogueoPersonal({periodo,profile}){
 const empleadoId=profile?.empleado_id||profile?.empleados?.id,[data,setData]=useState({dias:[],mensual:null}),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let activo=true;(async()=>{if(!periodo||!empleadoId){setBusy(false);return}setBusy(true);setError('');const mm=String(periodo.mes).padStart(2,'0'),fin=new Date(periodo.anio,periodo.mes,0).getDate();
  const[d,m]=await Promise.all([supabase.from('autoelevador_logueo').select('*').eq('empleado_id',empleadoId).gte('fecha',`${periodo.anio}-${mm}-01`).lte('fecha',`${periodo.anio}-${mm}-${fin}`).order('fecha',{ascending:false}),supabase.from('autoelevador_logueo_mensual').select('*').eq('empleado_id',empleadoId).eq('anio',periodo.anio).eq('mes',periodo.mes).maybeSingle()]);
  if(!activo)return;if(d.error||m.error)setError((d.error||m.error).message);else setData({dias:d.data||[],mensual:m.data});setBusy(false)})();return()=>{activo=false}},[periodo?.id,empleadoId]);
 if(busy)return <div className="center"><b>Cargando logueo...</b></div>;
 if(error)return <div className="error">No se pudo cargar el logueo: {error}</div>;
 if(!data.dias.length)return <div className="empty"><LogIn/><h3>Sin registros de logueo en autoelevador para este período.</h3></div>;
 const dias=data.dias,cuenta=re=>dias.filter(x=>re.test(x.semaforo||'')).length,verde=cuenta(/^verde/i),amarillo=cuenta(/^amarillo/i),rojo=cuenta(/^rojo/i),pctVerde=dias.length?verde/dias.length*100:0,m=data.mensual;
 return <><div className="module-head errors-head"><div><h2>Logueo en autoelevador</h2><p>{profile.empleados?.apellido_nombre} · {MESES[periodo.mes]} {periodo.anio}</p></div></div>
  <div className="auto-kpi-grid"><Kpi titulo="JORNADAS" valor={dias.length} accent="#d1a33c"/><Kpi titulo="A HORARIO" valor={verde} sub="Verde" accent="#00b050"/><Kpi titulo="TOLERANCIA" valor={amarillo} sub="Amarillo · cuenta como demorado" accent="#ffc000"/><Kpi titulo="DEMORADO" valor={rojo} sub="Rojo" accent="#ff0000"/><Kpi titulo="% A HORARIO" valor={`${pctVerde.toFixed(1).replace('.',',')}%`} sub={m?.resultado?`Premiación: ${m.resultado}`:undefined} accent={pctVerde>=85?'#00b050':pctVerde>=75?'#ffc000':'#ff0000'}/></div>
  <section className="panel auto-panel"><h3>Día por día</h3><p className="detail-sub"><b>Máquina (turno anterior)</b>: a qué hora el turno anterior dejó de usar la máquina con la que empezaste. Si la dejó después de tu horario, figura como <b>ocupada</b>. El Excel lo informa en los ingresos demorados.</p>
   <div className="auto-scroll"><table className="auto-table" style={{minWidth:900}}><thead><tr>{['Fecha','Turno','Horario','Tu logueo','Diferencia','Estado','Máquina','Máquina (turno anterior)','Hora final'].map(h=><th key={h}>{h}</th>)}</tr></thead>
   <tbody>{dias.map(x=><tr key={x.id}><td><b>{fechaAR(x.fecha)}</b></td><td>{x.turno}</td><td>{hhmm(x.hora_esperada)}</td><td><b>{hhmm(x.primer_logueo)}</b></td><td>{x.minutos_diferencia==null?'—':`${x.minutos_diferencia>0?'+':''}${x.minutos_diferencia} min`}</td><td><span className="auto-status" style={{background:colorSemaforo(x.semaforo),color:/^amarillo/i.test(x.semaforo||'')?'#332800':'#fff'}}>{textoSemaforo(x.semaforo)}</span></td><td>{x.ae_inicial||'—'}</td><td><Ocupada ultimo={x.ultimo_uso} esperada={x.hora_esperada}/></td><td>{hhmm(x.hora_final)}</td></tr>)}</tbody></table></div>
   {!dias.some(x=>x.ultimo_uso)&&<div className="auto-no-data"><AlertTriangle/>No hay ingresos demorados con último uso informado en este período.</div>}
  </section></>;
}
