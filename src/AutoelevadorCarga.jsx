import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

const MESES = {'ENERO':1,'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,'JULIO':7,'AGOSTO':8,'SETIEMBRE':9,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12};
const normal = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,' ').trim().toUpperCase();
const seconds = value => { if (value == null || value === '') return 0; if (typeof value === 'number') return Math.round(value < 2 ? value * 86400 : value); if (value instanceof Date) return value.getHours()*3600+value.getMinutes()*60+value.getSeconds(); const m=String(value).match(/(-?)(\d+):([0-5]?\d)(?::([0-5]?\d))?/); return m?(m[1]? -1:1)*(Number(m[2])*3600+Number(m[3])*60+Number(m[4]||0)):0; };
const isoDate = value => { if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; if (typeof value === 'number'){const d=XLSX.SSF.parse_date_code(value);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null;} const m=String(value||'').match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null; };
const clock = value => { if (value instanceof Date) return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}:${String(value.getSeconds()).padStart(2,'0')}`; if (typeof value === 'number') return XLSX.SSF.format('hh:mm:ss',value); return String(value||'').slice(0,8); };
const batch = async (table, rows) => { for(let i=0;i<rows.length;i+=300){const {error}=await supabase.from(table).insert(rows.slice(i,i+300));if(error)throw error;} };

export default function AutoelevadorCarga({ profile }) {
  const [file,setFile]=useState(null),[year,setYear]=useState(2026),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');

  async function inspect(){
    if(!file)return setMsg('Seleccioná el Excel de Autoelevador.');setBusy(true);setMsg('Leyendo todas las hojas del archivo...');setReview(null);
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,raw:true});
      const dailySheet=wb.Sheets['Detalle Diario']; const monthlySheet=wb.Sheets['Resumen Mensual']; const hourlySheet=wb.Sheets['Tiempo muerto horario'];
      if(!dailySheet||!monthlySheet||!hourlySheet)throw new Error('El archivo no contiene Detalle Diario, Resumen Mensual y Tiempo muerto horario.');
      const daily=XLSX.utils.sheet_to_json(dailySheet,{header:1,defval:null,raw:true});
      const monthly=XLSX.utils.sheet_to_json(monthlySheet,{header:1,defval:null,raw:true});
      const hourly=XLSX.utils.sheet_to_json(hourlySheet,{header:1,defval:null,raw:true});
      const hasShift=daily[0].map(normal).includes('TURNO'); const defaultShift=hasShift?'':'Noche';
      const {data:emps,error}=await supabase.from('empleados').select('id,apellido_nombre,nombre_normalizado');if(error)throw error;
      const {data:vars,error:ve}=await supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa');if(ve)throw ve;
      const byName=new Map((emps||[]).map(e=>[normal(e.nombre_normalizado||e.apellido_nombre),e])); const byId=new Map((emps||[]).map(e=>[e.id,e]));
      (vars||[]).filter(x=>x.activa).forEach(x=>{const e=byId.get(x.empleado_id);if(e)byName.set(normal(x.variante_normalizada),e)});
      const unknown=new Map();
      const match=name=>{const e=byName.get(normal(name));if(!e&&name)unknown.set(normal(name),String(name));return e};
      const periodKeys=new Set(); const monthlyRows=[],dailyRows=[],pauseRows=[],hourlyRows=[];

      const mh=monthly[0].map(normal), mi=n=>mh.indexOf(normal(n));
      for(const r of monthly.slice(1)){
        const name=r[mi('Operador')], mesTxt=String(r[mi('Mes')]||''), mes=MESES[normal(mesTxt)], emp=match(name); if(!emp||!mes)continue;
        const turno=hasShift?String(r[mi('Turno')]||''):defaultShift; periodKeys.add(`${year}-${mes}`);
        monthlyRows.push({empleado_id:emp.id,anio:year,mes,mes_texto:mesTxt,turno,dias_trabajados:Number(r[mi('Días trabajados')]||0),tiempo_efectivo_segundos:seconds(r[mi('Tiempo efectivo en operaciones')]),tiempo_muerto_segundos:seconds(r[mi('Tiempo muerto')]),tiempo_ralenti_segundos:seconds(r[mi('Tiempo ralentí')]),horas_netas_segundos:seconds(r[mi('Horas netas')]),objetivo_segundos:seconds(r[mi('Objetivo')]),rendimiento:Number(r[mi('Rendimiento')]||0)*100});
      }

      const dh=daily[0].map(normal), di=n=>dh.indexOf(normal(n));
      for(const r of daily.slice(1)){
        const name=r[di('Operador')], fecha=isoDate(r[di('Fecha turno')]), emp=match(name);if(!emp||!fecha)continue;const mes=Number(fecha.slice(5,7));periodKeys.add(`${year}-${mes}`);
        const net=seconds(r[di('Horas netas')]), obj=seconds(r[di('Objetivo')]), rend=Number(r[di('Rendimiento')]||0)*100;
        dailyRows.push({empleado_id:emp.id,anio:year,mes,fecha,turno:hasShift?String(r[di('Turno')]||''):defaultShift,tiempo_efectivo_segundos:seconds(r[di('Operación')]),tiempo_muerto_segundos:seconds(r[di('Tiempo muerto')]),tiempo_ralenti_segundos:seconds(r[di('Tiempo ralentí')]),horas_netas_segundos:net,objetivo_segundos:obj,rendimiento:rend,diferencia_segundos:net-obj,estado:rend<70?'Bajo':rend<80?'Cerca':'Cumple'});
      }

      const hh=hourly[0].map(x=>String(x||'')), hn=hh.map(normal), hi=n=>hn.indexOf(normal(n)); const baseLabels=hh.slice(hasShift?5:4);
      for(const r of hourly.slice(1)){
        const name=r[hi('Operador')], fecha=isoDate(r[hasShift?hi('Fecha'):hi('Fecha turno')]), emp=match(name);if(!emp||!fecha)continue;const mes=Number(fecha.slice(5,7));periodKeys.add(`${year}-${mes}`);
        const turno=hasShift?String(r[hi('Turno')]||''):defaultShift; const etiquetas=hasShift?(normal(turno)==='TARDE'?['13','14','15','16','17','18','19','20']:['7','8','9','10','11','12','13','14']):baseLabels; hourlyRows.push({empleado_id:emp.id,anio:year,mes,fecha,turno,etiquetas,valores_segundos:r.slice(hasShift?5:4).map(seconds)});
      }

      const pauseName=wb.SheetNames.includes('Detalle de Pausas')?'Detalle de Pausas':'Tiempos de Pausa'; const pm=XLSX.utils.sheet_to_json(wb.Sheets[pauseName],{header:1,defval:null,raw:true});
      for(const r of pm){
        const fecha=isoDate(r[13]),turno=String(r[14]||''),name=r[15],emp=match(name),mesTxt=String(r[22]||''),mes=MESES[normal(mesTxt)];if(!emp||!fecha||!mes)continue;periodKeys.add(`${year}-${mes}`);
        pauseRows.push({empleado_id:emp.id,anio:year,mes,fecha,turno:turno||defaultShift,inicio:clock(r[16]),fin:clock(r[17]),duracion_segundos:seconds(r[18]),duracion_minutos:Number(r[19]||0),tipo:String(r[20]||''),clasificacion:String(r[21]||''),mes_texto:mesTxt});
      }

      const dash=XLSX.utils.sheet_to_json(wb.Sheets['Dashboard Evolución'],{header:1,defval:null,raw:true}); const headerIndex=dash.findIndex(r=>r.map(normal).includes('OPERADOR')&&r.map(normal).includes('PROMEDIO PONDERADO'));
      const evolution=new Map();
      if(headerIndex>=0){const hdr=dash[headerIndex].map(normal), ix=n=>hdr.indexOf(normal(n)); const desdeIndex=hdr.findIndex(x=>x.startsWith('VAR DESDE')); const turnoIndex=ix('Turno'); for(const r of dash.slice(headerIndex+1)){const name=r[ix('Operador')];if(!name)continue;const emp=byName.get(normal(name));if(!emp)continue;const turno=turnoIndex>=0?String(r[turnoIndex]||defaultShift):defaultShift;evolution.set(`${emp.id}|${turno}`,{variacion_ultimo_mes:Number(r[ix('Var. último mes')]||0)*100,variacion_desde_inicio:Number(desdeIndex>=0?r[desdeIndex]:0)*100,promedio_ponderado:Number(r[ix('Promedio ponderado')]||0)*100,mejor_mes:String(r[ix('Mejor mes')]||''),tendencia:String(r[ix('Tendencia')]||'')});}}
      monthlyRows.forEach(r=>Object.assign(r,evolution.get(`${r.empleado_id}|${r.turno}`)||{}));
      setReview({monthlyRows,dailyRows,pauseRows,hourlyRows,periodKeys:[...periodKeys],unknown:[...unknown.values()],turnos:[...new Set(monthlyRows.map(x=>x.turno))],source:file.name});
      setMsg('Vista previa lista. Se conservarán todos los campos del Excel.');
    }catch(e){setMsg(`No se pudo revisar: ${e.message}`)}finally{setBusy(false)}
  }

  async function publish(){if(!review)return;setBusy(true);setMsg('Publicando Autoelevador y reemplazando solamente los mismos períodos y turnos...');
    try{
      const periods=new Map();for(const key of review.periodKeys){const [anio,mes]=key.split('-').map(Number);let {data,error}=await supabase.from('periodos').select('*').eq('anio',anio).eq('mes',mes).maybeSingle();if(error)throw error;if(!data){const created=await supabase.from('periodos').insert({anio,mes,publicado:false}).select().single();if(created.error)throw created.error;data=created.data;}periods.set(key,data.id);}
      const addPeriod=rows=>rows.map(({anio,mes,...r})=>({...r,periodo_id:periods.get(`${anio}-${mes}`)})); const turnos=review.turnos;
      for(const key of review.periodKeys){const periodId=periods.get(key);for(const table of ['autoelevador_mensual','autoelevador_diario','autoelevador_pausas','autoelevador_horario']){const del=await supabase.from(table).delete().eq('periodo_id',periodId).in('turno',turnos);if(del.error)throw del.error;}}
      await batch('autoelevador_mensual',addPeriod(review.monthlyRows));await batch('autoelevador_diario',addPeriod(review.dailyRows));await batch('autoelevador_pausas',addPeriod(review.pauseRows));await batch('autoelevador_horario',addPeriod(review.hourlyRows));
      for(const periodId of periods.values()){const up=await supabase.from('periodos').update({publicado:true,publicado_en:new Date().toISOString(),publicado_por:profile.id}).eq('id',periodId);if(up.error)throw up.error;}
      setMsg(`Publicado correctamente: ${review.monthlyRows.length} resúmenes, ${review.dailyRows.length} jornadas, ${review.pauseRows.length} pausas y ${review.hourlyRows.length} registros horarios.`);setReview(null);setFile(null);
    }catch(e){setMsg(`No se publicó: ${e.message}`)}finally{setBusy(false)}
  }

  return <section className="panel admin auto-upload"><div className="users-title"><div><small>AUTOELEVADOR</small><h2>Carga de productividad</h2><p>Admite el archivo Mañana/Tarde y el archivo Noche. Reemplaza únicamente el mismo año, mes y turno.</p></div></div><div className="twocol"><div><label>Año del archivo</label><input type="number" value={year} onChange={e=>setYear(+e.target.value)}/></div><div><label>Excel</label><label className="upload"><Upload/>Seleccionar archivo<input type="file" accept=".xlsx,.xls" onChange={e=>{setFile(e.target.files[0]);setReview(null);setMsg('')}}/></label></div></div>{file&&<p><b>{file.name}</b></p>}<button className="primary" onClick={inspect} disabled={busy}>{busy?'Procesando...':'Revisar archivo'}</button>{review&&<div className="notice auto-review"><CheckCircle2/><div><b>Vista previa Autoelevador</b><p>Turnos: {review.turnos.join(', ')}</p><p>Resúmenes mensuales: {review.monthlyRows.length}</p><p>Registros diarios: {review.dailyRows.length}</p><p>Pausas: {review.pauseRows.length}</p><p>Registros horarios: {review.hourlyRows.length}</p><p>Operadores no vinculados: {review.unknown.length}</p>{review.unknown.length>0&&<p className="note">Pendientes: {review.unknown.slice(0,12).join(', ')}</p>}<button className="primary" onClick={publish} disabled={busy}>Reemplazar y publicar Autoelevador</button></div></div>}{msg&&<div className="notice"><AlertTriangle/>{msg}</div>}</section>;
}
