import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { cargarTabla, invalidarDatosAnalisis } from './datosAnalisis';
import { candidatosPausa, clasificar } from './AutoelevadorPersonal';
import { minutosOcupada } from './logueoAE';
import { colorSemaforo, textoSemaforo, Ocupada } from './LogueoPersonal';
import { MIN_DIAS, TARGET_GENERAL, MESES, n, txt, norm, fmt, pct, iso, fechaAR, turnoCanon, nombreTurno, operadorKey, diasUnicos, suma, noEsError, esAdministrativo, resumen, Card, Empty, Pill, TARGETS_ORIGINALES, aplicarTargets } from './analisisUtil';

// Secciones del Análisis que usan datos que ya se cargan desde los Excel y antes no se mostraban.
// Todas reciben `ctx` con los filtros (año, mes, turno, período) y los datos del Análisis.

const hms = v => { const s = Math.max(0, Math.round(n(v))), h = Math.floor(s/3600), m = Math.floor(s%3600/60); return `${h}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
const hhmm = min => { if(min==null||!Number.isFinite(min)) return '—'; const m = ((Math.round(min)%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
const minutosDe = v => { const m = txt(v).match(/^(\d{1,2}):(\d{2})/); return m ? +m[1]*60 + +m[2] : null; };
const nombreDe = (empMap, id, alt) => txt(empMap.get(txt(id))?.apellido_nombre || alt || 'SIN NOMBRE');
const colorRend = v => n(v) < 70 ? '#c62828' : n(v) < 80 ? '#b88a00' : '#17823b';
const estadoClasif = p => p > 130 ? 'Sobresaliente' : p >= 95 ? 'Objetivo' : p >= 85 ? 'Atención' : 'Bajo objetivo';
const delTurno = (rows, turno) => !turno ? rows : rows.filter(r => turnoCanon(r.turno) === turno);
const mesClave = (y, m) => `${y}-${String(m).padStart(2,'0')}-`;
const mesAnterior = (y, m) => m > 1 ? [y, m-1] : [y-1, 12];
const agrupar = (rows, clave) => { const m = new Map(); rows.forEach(r => { const k = clave(r); if(!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };

export async function exportarExcel(nombre, heads, rows){
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([heads, ...rows]), 'Datos');
  XLSX.writeFile(wb, `${nombre}.xlsx`);
}

// Tabla con botón para bajarla a Excel. `cols`: [{t:título, v:fila=>valor, f:formato opcional}]
export function TablaDatos({ titulo, sub, cols, data, archivo, vacio='Sin datos para el período seleccionado.' }){
  return <section className="panel">
    <div className="sec-head"><div><h3>{titulo}</h3>{sub&&<small>{sub}</small>}</div>{data.length>0&&<button className="btn-export" onClick={()=>exportarExcel(archivo||titulo, cols.map(c=>c.t), data.map(r=>cols.map(c=>c.v(r))))}>⬇ Excel</button>}</div>
    {data.length ? <div className="scroll"><table><thead><tr>{cols.map(c=><th key={c.t}>{c.t}</th>)}</tr></thead><tbody>{data.map((r,i)=><tr key={i}>{cols.map(c=><td key={c.t}>{c.f ? c.f(c.v(r), r) : c.v(r)}</td>)}</tr>)}</tbody></table></div> : <Empty>{vacio}</Empty>}
  </section>;
}

function useTablas(tablas, version){
  const [datos, setDatos] = useState(null), [error, setError] = useState('');
  useEffect(() => { let vivo = true; setDatos(null); setError('');
    Promise.all(tablas.map(t => cargarTabla(t))).then(r => vivo && setDatos(Object.fromEntries(tablas.map((t,i) => [t, r[i]])))).catch(e => vivo && setError(e.message || 'No se pudieron cargar los datos.'));
    return () => { vivo = false; }; }, [version]);
  return [datos, error];
}
const Cargando = ({ error }) => <div className="notice">{error ? `No se pudieron cargar los datos: ${error}` : 'Cargando datos...'}</div>;

function Barras({ items, formato = v => v, color = '#f0c400' }){
  const max = Math.max(1, ...items.map(([, v]) => n(v)));
  return <div className="barras">{items.map(([label, v]) => <div key={label} className="barra"><span>{label}</span><i><em style={{ width: `${Math.max(3, n(v)/max*100)}%`, background: color }}/></i><b>{formato(v)}</b></div>)}</div>;
}

/* ===================== Autoelevadores ===================== */
export function Autoelevadores({ ctx }){
  const [datos, error] = useTablas(['autoelevador_mensual','autoelevador_diario','autoelevador_pausas','autoelevador_horario','periodos'], ctx.version);
  const [breaks, setBreaks] = useState({ asignaciones: [], tandas: [] });
  useEffect(() => { Promise.all([supabase.from('autoelevador_break_asignaciones').select('*,autoelevador_break_tandas(*)').eq('activa', true), supabase.from('autoelevador_break_tandas').select('*').eq('activa', true)]).then(([a, t]) => setBreaks({ asignaciones: a.data || [], tandas: t.data || [] })); }, [ctx.version]);
  const { year, month, periodo, turno, enRango, empMap } = ctx;
  const calc = useMemo(() => {
    if(!datos) return null;
    const per = new Map(datos.periodos.map(p => [p.id, p]));
    const diario = delTurno(datos.autoelevador_diario.filter(enRango), turno);
    const horario = delTurno(datos.autoelevador_horario.filter(enRango), turno);
    const pausas = delTurno(datos.autoelevador_pausas.filter(enRango), turno);
    let filas;
    if(periodo === 'mes'){
      filas = delTurno(datos.autoelevador_mensual.filter(r => { const p = per.get(r.periodo_id); return p && +p.anio === +year && +p.mes === +month; }), turno)
        .map(r => ({ id: r.empleado_id, nombre: nombreDe(empMap, r.empleado_id), turno: r.turno, dias: n(r.dias_trabajados), efectivo: n(r.tiempo_efectivo_segundos), muerto: n(r.tiempo_muerto_segundos), ralenti: n(r.tiempo_ralenti_segundos), netas: n(r.horas_netas_segundos), objetivo: n(r.objetivo_segundos), rendimiento: n(r.rendimiento), tendencia: txt(r.tendencia), mejorMes: txt(r.mejor_mes), varMes: r.variacion_ultimo_mes }));
    } else {
      filas = [...agrupar(diario, r => `${r.empleado_id}|${r.turno}`).values()].map(rows => ({ id: rows[0].empleado_id, nombre: nombreDe(empMap, rows[0].empleado_id), turno: rows[0].turno, dias: diasUnicos(rows), efectivo: suma(rows,'tiempo_efectivo_segundos'), muerto: suma(rows,'tiempo_muerto_segundos'), ralenti: suma(rows,'tiempo_ralenti_segundos'), netas: suma(rows,'horas_netas_segundos'), objetivo: suma(rows,'objetivo_segundos'), rendimiento: rows.reduce((s,r) => s + n(r.rendimiento), 0) / rows.length, tendencia: '', mejorMes: '', varMes: null }));
    }
    filas.sort((a, b) => b.rendimiento - a.rendimiento);
    // Tiempo muerto por hora: promedio de cada franja, separado por turno (cada turno tiene sus horas).
    const franjas = [...agrupar(horario, r => nombreTurno(r.turno)).entries()].map(([t, rows]) => {
      const etiquetas = rows[0].etiquetas || [], largo = Math.max(...rows.map(r => (r.valores_segundos || []).length), 0);
      return { turno: t, items: Array.from({ length: largo }, (_, i) => [`${etiquetas[i] ?? i+1} h`, rows.reduce((s, r) => s + n((r.valores_segundos || [])[i]), 0) / rows.length]) };
    });
    // Pausas: misma clasificación que ve cada operador en su perfil.
    const pausasOp = [...agrupar(pausas, r => `${r.empleado_id}|${r.turno}`).values()].map(rows => {
      const id = rows[0].empleado_id, t = rows[0].turno;
      const ids = candidatosPausa(rows, breaks.asignaciones.filter(a => a.empleado_id === id), breaks.tandas, t);
      const cl = rows.map(x => clasificar(x, ids)), reales = cl.filter(x => x.clase === 'Pausa'), inter = cl.filter(x => x.clase !== 'Pausa');
      return { nombre: nombreDe(empMap, id), turno: t, dias: diasUnicos(rows), pausa: suma(reales, 'duracion_segundos'), intervalos: inter.length, tiempoIntervalos: suma(inter, 'duracion_segundos'), maximo: inter.length ? Math.max(...inter.map(x => n(x.duracion_segundos))) : 0 };
    }).sort((a, b) => b.tiempoIntervalos - a.tiempoIntervalos);
    return { filas, franjas, pausasOp };
  }, [datos, breaks, year, month, periodo, turno, ctx.fecha, empMap]);
  if(!calc) return <Cargando error={error}/>;
  const { filas, franjas, pausasOp } = calc;
  const prom = filas.length ? filas.reduce((s, r) => s + r.rendimiento, 0) / filas.length : 0;
  return <section>
    <h2>🚜 Autoelevadores</h2>
    <p className="note">{periodo === 'mes' ? 'Valores del Resumen Mensual del Excel.' : 'Suma de los registros diarios del Excel. El rendimiento es el promedio de los días.'}</p>
    {!filas.length ? <Empty/> : <div className="analysis-kpis">
      <Card title="OPERADORES" value={filas.length} line1={`${filas.filter(r => r.rendimiento < 70).length} por debajo de 70%`}/>
      <Card title="RENDIMIENTO PROMEDIO" value={pct(prom)} line1="Promedio de los operadores"/>
      <Card title="TIEMPO MUERTO" value={hms(suma(filas,'muerto'))} line1={`Ralentí ${hms(suma(filas,'ralenti'))}`}/>
      <Card title="TIEMPO EFECTIVO" value={hms(suma(filas,'efectivo'))} line1={`Horas netas ${hms(suma(filas,'netas'))}`}/>
    </div>}
    <TablaDatos titulo="Ranking de rendimiento" archivo="Autoelevadores_ranking" data={filas} cols={[
      { t:'#', v:r => filas.indexOf(r)+1 }, { t:'Operador', v:r => r.nombre }, { t:'Turno', v:r => r.turno }, { t:'Días', v:r => r.dias },
      { t:'Efectivo', v:r => r.efectivo, f:hms }, { t:'Muerto', v:r => r.muerto, f:hms }, { t:'Ralentí', v:r => r.ralenti, f:hms }, { t:'Horas netas', v:r => r.netas, f:hms }, { t:'Objetivo', v:r => r.objetivo, f:hms },
      { t:'Rendimiento', v:r => +r.rendimiento.toFixed(1), f:v => <b style={{ color: colorRend(v) }}>{pct(v)}</b> },
      ...(periodo === 'mes' ? [{ t:'Var. último mes', v:r => r.varMes==null ? '' : +n(r.varMes).toFixed(1), f:v => v === '' ? '—' : `${v > 0 ? '↑' : v < 0 ? '↓' : '='} ${pct(Math.abs(v))}` }, { t:'Mejor mes', v:r => r.mejorMes || '—' }, { t:'Tendencia', v:r => r.tendencia || '—' }] : [])
    ]}/>
    <section className="panel"><div className="sec-head"><div><h3>Tiempo muerto por hora del día</h3><small>Promedio por jornada, tal como viene en la hoja "Tiempo muerto horario".</small></div></div>
      {franjas.length ? <div className="grid-2">{franjas.map(f => <div key={f.turno}><b>Turno {f.turno}</b><Barras items={f.items} formato={hms} color="#c62828"/></div>)}</div> : <Empty/>}
    </section>
    <TablaDatos titulo="Pausas e intervalos" sub="Pausa = break detectado dentro del horario asignado. Intervalos = el resto de las paradas." archivo="Autoelevadores_pausas" data={pausasOp} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Turno', v:r => r.turno }, { t:'Días', v:r => r.dias }, { t:'Pausa total', v:r => r.pausa, f:hms }, { t:'Cant. intervalos', v:r => r.intervalos }, { t:'Tiempo intervalos', v:r => r.tiempoIntervalos, f:hms }, { t:'Intervalo máximo', v:r => r.maximo, f:hms }
    ]}/>
  </section>;
}

/* ===================== Errores: tipo, verificador, canal, SKU ===================== */
export const tipoError = e => {
  if(e.__origen === 'VOICE'){ if(n(e.faltantes) > 0) return 'Faltante'; if(n(e.sobrantes) > 0) return 'Sobrante'; if(n(e.cambio_sabor) > 0) return 'Cambio de sabor'; return txt(e.motivo) || 'Otro'; }
  const m = norm(e.motivo); if(m.includes('FALT')) return 'Faltante'; if(m.includes('SOBR')) return 'Sobrante'; if(m.includes('SABOR') || m.includes('CAMBIO')) return 'Cambio de sabor'; return txt(e.motivo) || 'Otro';
};
const TIPOS = ['Faltante','Sobrante','Cambio de sabor'];
export function ErroresDetalle({ ctx }){
  const { empMap } = ctx;
  const calc = useMemo(() => {
    const ev = ctx.eFiltrado.filter(e => !noEsError(e)), total = ev.length;
    const porTipo = [...agrupar(ev, tipoError).entries()].map(([tipo, rows]) => ({ tipo, voice: rows.filter(r => r.__origen === 'VOICE').length, gatera: rows.filter(r => r.__origen === 'GATERA').length, total: rows.length })).sort((a, b) => b.total - a.total);
    const porOperador = [...agrupar(ev, e => txt(e.empleado_id) || 'SIN').entries()].map(([id, rows]) => { const t = agrupar(rows, tipoError); return { nombre: nombreDe(empMap, id, rows[0].operador || rows[0].pickero), ...Object.fromEntries(TIPOS.map(x => [x, (t.get(x) || []).length])), otros: rows.filter(r => !TIPOS.includes(tipoError(r))).length, total: rows.length }; }).sort((a, b) => b.total - a.total);
    const verif = e => txt(e.__origen === 'VOICE' ? e.datos_originales?.verificador : e.verificador) || 'Sin verificador';
    const porVerificador = [...agrupar(ev, verif).entries()].map(([v, rows]) => ({ v, voice: rows.filter(r => r.__origen === 'VOICE').length, gatera: rows.filter(r => r.__origen === 'GATERA').length, total: rows.length, operadores: new Set(rows.map(r => txt(r.empleado_id))).size })).sort((a, b) => b.total - a.total);
    const gat = ev.filter(e => e.__origen === 'GATERA');
    const porCanal = [...agrupar(gat, e => txt(e.canal) || 'Sin canal').entries()].map(([canal, rows]) => ({ canal, errores: rows.length, cantidad: suma(rows, 'cantidad') })).sort((a, b) => b.errores - a.errores);
    const porSku = [...agrupar(gat.filter(e => txt(e.sku)), e => txt(e.sku)).entries()].map(([sku, rows]) => ({ sku, desc: txt(rows.find(r => txt(r.descripcion))?.descripcion) || '—', errores: rows.length, cantidad: suma(rows, 'cantidad'), operadores: new Set(rows.map(r => txt(r.empleado_id))).size, tipos: [...new Set(rows.map(tipoError))].join(', ') })).sort((a, b) => b.errores - a.errores);
    return { total, porTipo, porOperador, porVerificador, porCanal, porSku };
  }, [ctx.eFiltrado, empMap]);
  const { total, porTipo } = calc;
  return <section>
    <h2>🔎 Errores en detalle</h2>
    <p className="note">Errores reales de Voice y Gatera del período y turno elegidos ({total} en total). Se cuenta cada registro de error, igual que en el resto del Análisis.</p>
    {!total ? <Empty/> : <div className="analysis-kpis">{TIPOS.map(t => { const x = porTipo.find(p => p.tipo === t); return <Card key={t} title={t.toUpperCase()} value={x?.total || 0} line1={`${pct((x?.total || 0) / total * 100)} del total`} line2={`Voice ${x?.voice || 0} · Gatera ${x?.gatera || 0}`}/>; })}<Card title="OTROS MOTIVOS" value={total - TIPOS.reduce((s, t) => s + (porTipo.find(p => p.tipo === t)?.total || 0), 0)} line1="Motivos que no son faltante, sobrante ni cambio de sabor"/></div>}
    <TablaDatos titulo="Errores por tipo y operador" archivo="Errores_por_tipo_y_operador" data={calc.porOperador} cols={[{ t:'Operador', v:r => r.nombre }, ...TIPOS.map(t => ({ t, v:r => r[t] })), { t:'Otros', v:r => r.otros }, { t:'Total', v:r => r.total, f:v => <b>{v}</b> }]}/>
    <div className="grid-2">
      <TablaDatos titulo="Errores por tipo" archivo="Errores_por_tipo" data={porTipo} cols={[{ t:'Tipo', v:r => r.tipo }, { t:'Voice', v:r => r.voice }, { t:'Gatera', v:r => r.gatera }, { t:'Total', v:r => r.total }, { t:'%', v:r => +(r.total / Math.max(1, total) * 100).toFixed(1), f:pct }]}/>
      <TablaDatos titulo="Errores detectados por verificador" sub="Cuántos errores registró cada verificador." archivo="Errores_por_verificador" data={calc.porVerificador} cols={[{ t:'Verificador', v:r => r.v }, { t:'Voice', v:r => r.voice }, { t:'Gatera', v:r => r.gatera }, { t:'Total', v:r => r.total }, { t:'Operadores', v:r => r.operadores }]}/>
    </div>
    <div className="grid-2">
      <TablaDatos titulo="Errores de Gatera por canal" archivo="Errores_por_canal" data={calc.porCanal} cols={[{ t:'Canal', v:r => r.canal }, { t:'Errores', v:r => r.errores }, { t:'Cantidad', v:r => r.cantidad, f:fmt }]}/>
      <TablaDatos titulo="SKU con más errores (Gatera)" sub="Voice no trae SKU." archivo="SKU_con_errores" data={calc.porSku} cols={[{ t:'SKU', v:r => r.sku }, { t:'Descripción', v:r => r.desc }, { t:'Errores', v:r => r.errores }, { t:'Cantidad', v:r => r.cantidad, f:fmt }, { t:'Operadores', v:r => r.operadores }, { t:'Tipos', v:r => r.tipos }]}/>
    </div>
  </section>;
}

/* ===================== Picking: tiempos y franja horaria ===================== */
export function PickingTiempos({ ctx }){
  const { empMap } = ctx;
  const calc = useMemo(() => {
    const rows = ctx.pFiltrado;
    const conTiempos = rows.some(r => n(r.tiempo_sin_picking_segundos) > 0 || n(r.tiempo_neto_segundos) > 0);
    const porOperador = [...agrupar(rows, operadorKey).values()].map(rs => { const dur = suma(rs, 'duracion_segundos'), sin = suma(rs, 'tiempo_sin_picking_segundos');
      return { nombre: nombreDe(empMap, rs[0].empleado_id, rs[0].datos_originales?.operador), dias: diasUnicos(rs), tareas: rs.length, duracion: dur, neto: suma(rs, 'tiempo_neto_segundos'), sin, pctSin: dur > 0 ? sin / dur * 100 : 0, sinDia: sin / Math.max(1, diasUnicos(rs)) }; }).sort((a, b) => b.pctSin - a.pctSin);
    const porHora = [...agrupar(rows.filter(r => minutosDe(r.inicio) != null), r => Math.floor(minutosDe(r.inicio) / 60)).entries()].map(([h, rs]) => { const packs = suma(rs, 'packs'), dur = suma(rs, 'duracion_segundos'); return { hora: +h, tareas: rs.length, packs, pallets: suma(rs, 'pallets'), prod: dur > 0 ? packs / (dur / 3600) : 0 }; }).sort((a, b) => a.hora - b.hora);
    // Primera y última tarea de cada día. En turno noche, las horas de madrugada cuentan como del mismo turno.
    const ajustar = (min, t) => min == null ? null : (turnoCanon(t) === 'NOCHE' && min < 720 ? min + 1440 : min);
    const jornada = [...agrupar(rows, operadorKey).values()].map(rs => { const dias = [...agrupar(rs, r => iso(r.fecha)).values()].map(d => ({ ini: Math.min(...d.map(r => ajustar(minutosDe(r.inicio), r.turno) ?? Infinity)), fin: Math.max(...d.map(r => ajustar(minutosDe(r.fin), r.turno) ?? -Infinity)) })).filter(d => Number.isFinite(d.ini) && Number.isFinite(d.fin));
      const prom = k => dias.length ? dias.reduce((s, d) => s + d[k], 0) / dias.length : null;
      return { nombre: nombreDe(empMap, rs[0].empleado_id, rs[0].datos_originales?.operador), turno: nombreTurno(rs[0].turno), dias: dias.length, ini: prom('ini'), fin: prom('fin'), primera: dias.length ? Math.max(...dias.map(d => d.ini)) : null }; }).filter(x => x.dias).sort((a, b) => b.ini - a.ini);
    return { conTiempos, porOperador, porHora, jornada };
  }, [ctx.pFiltrado, empMap]);
  return <section>
    <h2>⏱️ Picking: tiempos y horarios</h2>
    {!calc.conTiempos && ctx.pFiltrado.length > 0 && <div className="notice">El Excel de Picking de este período no trae "Tiempo neto trabajado" ni "Tiempo no piqueando": esas columnas quedan en 0.</div>}
    <TablaDatos titulo="Tiempo sin piquear por operador" sub="% = tiempo no piqueando sobre la duración total de sus tareas." archivo="Picking_tiempo_sin_piquear" data={calc.porOperador} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Días', v:r => r.dias }, { t:'Tareas', v:r => r.tareas }, { t:'Duración total', v:r => r.duracion, f:hms }, { t:'Tiempo neto', v:r => r.neto, f:hms }, { t:'Sin piquear', v:r => r.sin, f:hms }, { t:'% sin piquear', v:r => +r.pctSin.toFixed(1), f:pct }, { t:'Sin piquear por día', v:r => Math.round(r.sinDia), f:hms }
    ]}/>
    <section className="panel"><div className="sec-head"><div><h3>Productividad por hora de inicio</h3><small>Bultos por hora de las tareas que arrancaron en cada franja.</small></div>{calc.porHora.length > 0 && <button className="btn-export" onClick={() => exportarExcel('Picking_por_hora', ['Hora','Tareas','Bultos','Paletas','Bultos/hora'], calc.porHora.map(r => [`${r.hora}:00`, r.tareas, r.packs, r.pallets, +r.prod.toFixed(1)]))}>⬇ Excel</button>}</div>
      {calc.porHora.length ? <Barras items={calc.porHora.map(r => [`${String(r.hora).padStart(2,'0')}:00 · ${r.tareas} tareas`, r.prod])} formato={v => `${fmt(v)} b/h`} color="#118542"/> : <Empty/>}
    </section>
    <TablaDatos titulo="Inicio y fin de jornada" sub="Promedio de la primera y la última tarea de cada día trabajado." archivo="Picking_inicio_fin_jornada" data={calc.jornada} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Turno', v:r => r.turno }, { t:'Días', v:r => r.dias }, { t:'Primera tarea (prom.)', v:r => hhmm(r.ini) }, { t:'Última tarea (prom.)', v:r => hhmm(r.fin) }, { t:'Arranque más tarde', v:r => hhmm(r.primera) }
    ]}/>
  </section>;
}

/* ===================== Clasificación manual ===================== */
const resumenClasif = rows => { const obj = suma(rows, 'objetivo'), real = suma(rows, 'real'); return { dias: diasUnicos(rows), obj, real, cum: obj ? real / obj * 100 : 0, resultado: obj ? 4.6 * real / obj : 0 }; };
export function Clasificacion({ ctx }){
  const [datos, error] = useTablas(['clasificacion_manual'], ctx.version);
  const { enRango, turno, empMap } = ctx;
  const calc = useMemo(() => {
    if(!datos) return null;
    const rows = delTurno(datos.clasificacion_manual.filter(enRango), turno);
    const general = resumenClasif(rows);
    const turnos = [...agrupar(rows, r => nombreTurno(r.turno) || 'Sin turno').entries()].map(([t, rs]) => ({ turno: t, ...resumenClasif(rs) }));
    const personas = [...agrupar(rows, r => txt(r.empleado_id)).entries()].map(([id, rs]) => ({ nombre: nombreDe(empMap, id), turno: [...new Set(rs.map(r => nombreTurno(r.turno)))].join(', '), ...resumenClasif(rs) })).sort((a, b) => b.cum - a.cum);
    return { rows, general, turnos, personas };
  }, [datos, ctx.year, ctx.month, ctx.periodo, ctx.fecha, turno, empMap]);
  if(!calc) return <Cargando error={error}/>;
  const { general } = calc;
  return <section>
    <h2>📦 Clasificación manual</h2>
    <p className="note">Mismo cálculo que ve cada persona en su perfil: cumplimiento = real ÷ objetivo; resultado = 4,6 × real ÷ objetivo.</p>
    {!calc.rows.length ? <Empty/> : <div className="analysis-kpis">
      <Card title="CUMPLIMIENTO" value={pct(general.cum)} line1={estadoClasif(general.cum)}/>
      <Card title="RESULTADO" value={fmt(general.resultado)} line1="Target 4,6 paletas por hora-hombre"/>
      <Card title="REAL / OBJETIVO" value={`${fmt(general.real)} / ${fmt(general.obj)}`}/>
      <Card title="PERSONAS" value={calc.personas.length} line1={`${general.dias} días con registros`}/>
    </div>}
    {calc.turnos.length > 1 && <TablaDatos titulo="Por turno" archivo="Clasificacion_por_turno" data={calc.turnos} cols={[{ t:'Turno', v:r => r.turno }, { t:'Días', v:r => r.dias }, { t:'Objetivo', v:r => r.obj, f:fmt }, { t:'Real', v:r => r.real, f:fmt }, { t:'Cumplimiento', v:r => +r.cum.toFixed(1), f:pct }, { t:'Resultado', v:r => +r.resultado.toFixed(2), f:fmt }]}/>}
    <TablaDatos titulo="Ranking por cumplimiento" archivo="Clasificacion_ranking" data={calc.personas} cols={[
      { t:'#', v:r => calc.personas.indexOf(r) + 1 }, { t:'Operador', v:r => r.nombre }, { t:'Turno', v:r => r.turno }, { t:'Días', v:r => r.dias }, { t:'Objetivo', v:r => r.obj, f:fmt }, { t:'Real', v:r => r.real, f:fmt },
      { t:'Cumplimiento', v:r => +r.cum.toFixed(1), f:pct }, { t:'Resultado', v:r => +r.resultado.toFixed(2), f:fmt }, { t:'Estado', v:r => estadoClasif(r.cum) }
    ]}/>
  </section>;
}

/* ===================== Comparación con el mes anterior ===================== */
export function CompararMesAnterior({ ctx, actual }){
  if(ctx.periodo !== 'mes') return null;
  const [py, pm] = mesAnterior(+ctx.year, +ctx.month), clave = mesClave(py, pm);
  const rows = delTurno(ctx.picking.filter(r => iso(r.fecha).startsWith(clave)), ctx.turno);
  const errs = delTurno(ctx.errors.filter(r => iso(r.fecha).startsWith(clave) && !esAdministrativo(r)), ctx.turno);
  if(!rows.length) return <p className="note">Sin datos de {MESES[pm-1]} {py} para comparar.</p>;
  const prev = resumen(rows, errs, actual.target);
  const item = (label, a, b, fmtv, mejorSiSube = true) => { const d0 = b ? (a - b) / Math.abs(b) * 100 : null, d = d0 != null && Math.abs(d0) < 0.05 ? 0 : d0, bien = d == null || d === 0 ? null : (d > 0) === mejorSiSube;
    return <div key={label}><span>{label}</span><b>{fmtv(a)}</b><small style={{ color: bien == null ? '#666' : bien ? '#17823b' : '#c62828' }}>{d == null ? '—' : `${d > 0 ? '↑' : d < 0 ? '↓' : '='} ${pct(Math.abs(d))}`} vs {fmtv(b)}</small></div>; };
  return <div className="comparar"><b>Comparado con {MESES[pm-1]} {py}</b>{actual.dias !== prev.dias && <small className="note"> · {MESES[ctx.month-1]} tiene {actual.dias} días con datos y {MESES[pm-1]} {prev.dias}: los totales (paletas, bultos, errores) no son comparables hasta que termine el mes.</small>}<div>
    {item('Productividad', actual.productividad, prev.productividad, fmt)}
    {item('Calidad', actual.calidad || 0, prev.calidad || 0, pct)}
    {item('Errores reales', actual.total, prev.total, v => fmt(v), false)}
    {item('Paletas', actual.paletas, prev.paletas, fmt)}
    {item('Bultos', actual.bultos, prev.bultos, fmt)}
  </div></div>;
}

/* ===================== Alertas y calidad vs velocidad ===================== */
// Se usa en la pantalla de Alertas y para el número que aparece al lado de "Alertas" en el menú.
export function calcularAlertas(ctx, operadores){
    // Racha de días trabajados seguidos por debajo del 100% de cumplimiento.
    const rachas = operadores.map(o => { const dias = [...agrupar(o.rows, r => iso(r.fecha)).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, rs]) => ({ f, cum: resumen(rs, [], 0).cumplimiento }));
      let mejor = { largo: 0 }, act = { largo: 0 }; dias.forEach(d => { if(d.cum < 100){ act = act.largo ? { ...act, largo: act.largo + 1, hasta: d.f } : { largo: 1, desde: d.f, hasta: d.f }; if(act.largo > mejor.largo) mejor = act; } else act = { largo: 0 }; });
      return { nombre: o.name, ...mejor, debajo: dias.filter(d => d.cum < 100).length, dias: dias.length }; }).filter(x => x.largo >= 3).sort((a, b) => b.largo - a.largo);
    let suben = [];
    if(ctx.periodo === 'mes'){
      const [py, pm] = mesAnterior(+ctx.year, +ctx.month), clave = mesClave(py, pm);
      const prevP = ctx.picking.filter(r => iso(r.fecha).startsWith(clave)), prevE = ctx.errors.filter(r => iso(r.fecha).startsWith(clave) && !esAdministrativo(r) && !noEsError(r));
      suben = operadores.map(o => { const rs = prevP.filter(r => operadorKey(r) === o.key), es = prevE.filter(e => txt(e.empleado_id) === o.employeeId), prev = resumen(rs, es, 0);
        return { nombre: o.name, ahora: o.total, tasa: o.tasaError, antes: prev.total, tasaAntes: prev.tasaError, paletasAntes: prev.paletas }; })
        .filter(x => x.paletasAntes > 0 && x.ahora >= 3 && x.tasa > x.tasaAntes * 1.5).sort((a, b) => (b.tasa - b.tasaAntes) - (a.tasa - a.tasaAntes));
    }
    const pocos = operadores.filter(o => o.dias > 0 && o.dias < MIN_DIAS).map(o => ({ nombre: o.name, dias: o.dias, paletas: o.paletas })).sort((a, b) => a.dias - b.dias);
    return { rachas, suben, pocos };
}
export function Alertas({ ctx, operadores, calc }){
  return <section>
    <h2>🚨 Alertas</h2>
    <TablaDatos titulo="Días seguidos por debajo del target" sub="Operadores con 3 o más días trabajados seguidos con cumplimiento menor a 100%." archivo="Alertas_debajo_target" vacio="Nadie tuvo 3 días seguidos por debajo del target." data={calc.rachas} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Racha (días)', v:r => r.largo, f:v => <b style={{ color: '#c62828' }}>{v}</b> }, { t:'Desde', v:r => fechaAR(r.desde) }, { t:'Hasta', v:r => fechaAR(r.hasta) }, { t:'Días debajo / trabajados', v:r => `${r.debajo} / ${r.dias}` }
    ]}/>
    {ctx.periodo === 'mes' ? <TablaDatos titulo="Errores en aumento" sub="Tasa de error al menos 50% mayor que el mes anterior y 3 errores o más." archivo="Alertas_errores_en_aumento" vacio="Nadie aumentó fuerte su tasa de error respecto del mes anterior." data={calc.suben} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Errores mes anterior', v:r => r.antes }, { t:'Tasa anterior', v:r => +r.tasaAntes.toFixed(2), f:pct }, { t:'Errores este mes', v:r => r.ahora }, { t:'Tasa actual', v:r => +r.tasa.toFixed(2), f:v => <b style={{ color: '#c62828' }}>{pct(v)}</b> }
    ]}/> : <p className="note">"Errores en aumento" se calcula con el período Mes.</p>}
    <TablaDatos titulo={`Pocos días registrados (menos de ${MIN_DIAS})`} sub="No entran en el ranking. Puede ser ausencia, cambio de tarea o un nombre mal cargado en el Excel." archivo="Alertas_pocos_dias" vacio="Todos tienen suficientes días." data={calc.pocos} cols={[{ t:'Operador', v:r => r.nombre }, { t:'Días', v:r => r.dias }, { t:'Paletas', v:r => r.paletas, f:fmt }]}/>
    <CalidadVelocidad operadores={operadores.filter(o => o.dias >= MIN_DIAS && o.paletas > 0)}/>
  </section>;
}

function CalidadVelocidad({ operadores }){
  const [sel, setSel] = useState(null);
  if(!operadores.length) return null;
  const W = 900, H = 420, pad = 50, xs = operadores.map(o => o.cumplimiento), ys = operadores.map(o => o.calidad ?? 0);
  const x0 = Math.min(80, ...xs) - 5, x1 = Math.max(120, ...xs) + 5, yMin = Math.min(...ys), y0 = Math.max(0, yMin - Math.max(0.3, (100 - yMin) * 0.25)), y1 = 100 + Math.max(0.1, (100 - y0) * 0.05);
  const sx = v => pad + (v - x0) / (x1 - x0) * (W - pad * 2), sy = v => H - pad - (v - y0) / (y1 - y0) * (H - pad * 2);
  const calProm = ys.reduce((s, v) => s + v, 0) / ys.length;
  const cuadrante = o => o.cumplimiento >= 100 ? (o.calidad >= calProm ? 'Rápido y prolijo' : 'Rápido con errores') : (o.calidad >= calProm ? 'Prolijo pero lento' : 'Lento y con errores');
  return <section className="panel"><div className="sec-head"><div><h3>Calidad vs. velocidad</h3><small>Cada punto es un operador con {MIN_DIAS} días o más. Línea vertical: 100% de cumplimiento. Línea horizontal: calidad promedio ({pct(calProm)}).</small></div>
    <button className="btn-export" onClick={() => exportarExcel('Calidad_vs_velocidad', ['Operador','Cumplimiento %','Calidad %','Errores','Paletas','Grupo'], operadores.map(o => [o.name, +o.cumplimiento.toFixed(1), +(o.calidad ?? 0).toFixed(2), o.total, o.paletas, cuadrante(o)]))}>⬇ Excel</button></div>
    <div style={{ overflowX: 'auto' }}><svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 640 }}>
      <rect x={sx(100)} y={pad} width={W - pad - sx(100)} height={sy(calProm) - pad} fill="#e8f5e9"/><rect x={pad} y={sy(calProm)} width={sx(100) - pad} height={H - pad - sy(calProm)} fill="#fdecea"/>
      <line x1={sx(100)} x2={sx(100)} y1={pad} y2={H - pad} stroke="#999" strokeDasharray="5 4"/><line x1={pad} x2={W - pad} y1={sy(calProm)} y2={sy(calProm)} stroke="#999" strokeDasharray="5 4"/>
      <text x={W - pad} y={pad + 16} textAnchor="end" fontSize="13" fill="#17823b">Rápido y prolijo</text><text x={pad + 6} y={H - pad - 8} fontSize="13" fill="#c62828">Lento y con errores</text>
      <text x={W - pad} y={H - pad - 8} textAnchor="end" fontSize="13" fill="#b88a00">Rápido con errores</text><text x={pad + 6} y={pad + 16} fontSize="13" fill="#555">Prolijo pero lento</text>
      {[x0, 100, x1].map(v => <text key={'x'+v} x={sx(v)} y={H - pad + 16} textAnchor="middle" fontSize="11" fill="#666">{Math.round(v)}%</text>)}{[y0, calProm, 100].map(v => <text key={'y'+v} x={pad - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="#666">{v.toFixed(1)}%</text>)}<text x={W / 2} y={H - 12} textAnchor="middle" fontSize="12">Cumplimiento de productividad (%)</text><text x={14} y={H / 2} fontSize="12" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">Calidad de armado (%)</text>
      {operadores.map(o => <g key={o.key} onClick={() => setSel(o)} style={{ cursor: 'pointer' }}><circle cx={sx(o.cumplimiento)} cy={sy(o.calidad ?? 0)} r={sel?.key === o.key ? 9 : 6} fill={sel?.key === o.key ? '#111' : '#f0c400'} stroke="#111"/><text x={sx(o.cumplimiento) + 9} y={sy(o.calidad ?? 0) - 7} fontSize="11" fill="#333">{o.name.split(' ')[0]}</text><title>{`${o.name}: cumplimiento ${pct(o.cumplimiento)} · calidad ${pct(o.calidad)}`}</title></g>)}
    </svg></div>
    {sel && <p><b>{sel.name}</b>: cumplimiento {pct(sel.cumplimiento)} · calidad {pct(sel.calidad)} · {sel.total} errores en {fmt(sel.paletas)} paletas · <b>{cuadrante(sel)}</b></p>}
  </section>;
}

/* ===================== Ficha 360°: otros módulos del operador ===================== */
export function FichaExtra({ ctx, ficha }){
  const [datos, error] = useTablas(['clasificacion_manual','autoelevador_diario'], ctx.version);
  const id = ficha.employeeId, [logueo, setLogueo] = useState([]);
  useEffect(() => { cargarTabla('autoelevador_logueo').then(setLogueo).catch(() => setLogueo([])); }, [ctx.version]);
  const tipos = useMemo(() => [...agrupar(ficha.errors.filter(e => !noEsError(e)), tipoError).entries()].map(([t, rs]) => [t, rs.length]).sort((a, b) => b[1] - a[1]), [ficha]);
  if(!datos) return <Cargando error={error}/>;
  const clasif = delTurno(datos.clasificacion_manual.filter(r => txt(r.empleado_id) === id && ctx.enRango(r)), ctx.turno), c = resumenClasif(clasif);
  const auto = delTurno(datos.autoelevador_diario.filter(r => txt(r.empleado_id) === id && ctx.enRango(r)), ctx.turno);
  const log = delTurno(logueo.filter(r => txt(r.empleado_id) === id && ctx.enRango(r)), ctx.turno), verdes = log.filter(r => /^verde/i.test(r.semaforo || '')).length;
  return <section className="panel"><h3>🧩 Otros módulos de {ficha.name}</h3>
    <div className="analysis-kpis">
      <Card title="ERRORES POR TIPO" value={tipos.length ? tipos.map(([t, v]) => `${v} ${t.toLowerCase()}`).join(' · ') : 'Sin errores'}/>
      <Card title="CLASIFICACIÓN" value={clasif.length ? pct(c.cum) : 'Sin datos'} line1={clasif.length ? `${c.dias} días · resultado ${fmt(c.resultado)}` : 'No registra clasificación en el período'}/>
      <Card title="AUTOELEVADOR" value={auto.length ? pct(auto.reduce((s, r) => s + n(r.rendimiento), 0) / auto.length) : 'Sin datos'} line1={auto.length ? `${diasUnicos(auto)} días · muerto ${hms(suma(auto, 'tiempo_muerto_segundos'))}` : 'No registra autoelevador en el período'}/>
      <Card title="LOGUEO AE" value={log.length ? pct(verdes / log.length * 100) : 'Sin datos'} line1={log.length ? `${verdes} de ${log.length} jornadas a horario` : 'No registra logueo en el período'} line2={log.length ? `Ocupada por el turno anterior: ${log.filter(r => (minutosOcupada(r.ultimo_uso, r.hora_esperada) ?? 0) > 0).length}` : undefined}/>
    </div>
  </section>;
}

/* ===================== Auditoría: registros especiales de Gatera ===================== */
export function EspecialesGatera({ ctx }){
  const [datos, error] = useTablas(['errores_gatera_especiales'], ctx.version);
  if(!datos) return <Cargando error={error}/>;
  const rows = delTurno(datos.errores_gatera_especiales.filter(ctx.enRango), ctx.turno);
  const grupos = [...agrupar(rows, r => `${txt(r.categoria) || 'Sin categoría'}|${txt(r.datos_originales?.pickero) || '—'}`).entries()].map(([k, rs]) => { const [cat, pick] = k.split('|'); return { cat, pick, registros: rs.length, cantidad: suma(rs, 'cantidad') }; }).sort((a, b) => b.registros - a.registros);
  return <TablaDatos titulo="Registros especiales de Gatera" sub="Filas del Excel de Gatera que no son de un pickero (F/voiceP, Carga, Barriles, Layer, etc.). Se guardan aparte y no afectan ranking ni calidad." archivo="Gatera_especiales" vacio="Sin registros especiales en el período." data={grupos} cols={[{ t:'Categoría', v:r => r.cat }, { t:'Pickero en el Excel', v:r => r.pick }, { t:'Registros', v:r => r.registros }, { t:'Cantidad', v:r => r.cantidad, f:fmt }]}/>;
}

/* ===================== Historial de cargas ===================== */
const TIPO_ARCHIVO = { picking: 'Picking', clasificacion_manual: 'Clasificación', errores_voice: 'Errores Voice', errores_gatera: 'Errores Gatera' };
export function HistorialCargas(){
  const [version, setVersion] = useState(0), [datos, error] = useTablas(['importaciones','periodos'], version);
  if(!datos) return <Cargando error={error}/>;
  const per = new Map(datos.periodos.map(p => [p.id, p]));
  const cuando = r => r.publicado_en || r.created_at || '';
  const rows = [...datos.importaciones].sort((a, b) => txt(cuando(b)).localeCompare(txt(cuando(a))));
  const fh = v => v ? new Date(v).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  return <>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><button className="btn-export" onClick={() => { cargarTabla('importaciones', { forzar: true }); cargarTabla('periodos', { forzar: true }); setVersion(v => v + 1); }}>↻ Actualizar</button></div>
    <TablaDatos titulo="Historial de cargas" sub="Cada publicación de Clasificación, Picking, Voice y Gatera. Autoelevador no deja registro en este historial." archivo="Historial_de_cargas" vacio="Todavía no hay cargas registradas." data={rows} cols={[
      { t:'Fecha', v:r => fh(cuando(r)) }, { t:'Tipo', v:r => TIPO_ARCHIVO[r.tipo_archivo] || r.tipo_archivo }, { t:'Período', v:r => { const p = per.get(r.periodo_id); return p ? `${MESES[p.mes-1]} ${p.anio}` : '—'; } }, { t:'Archivo', v:r => r.nombre_archivo }, { t:'Hoja', v:r => r.hoja_origen },
      { t:'Leídos', v:r => r.registros_encontrados }, { t:'Aceptados', v:r => r.registros_aceptados }, { t:'Rechazados', v:r => r.registros_rechazados }, { t:'Duplicados', v:r => r.registros_duplicados }, { t:'Estado', v:r => r.estado }
    ]}/>
  </>;
}


/* ===================== Targets editables ===================== */
export function TargetsEditor(){
  const base = useMemo(() => {
    const o = {}; ['TODOS','TARDE','NOCHE'].forEach(t => o[`GENERAL_${t}`] = TARGETS_ORIGINALES.general[t]);
    ['TARDE','NOCHE'].forEach(t => Object.entries(TARGETS_ORIGINALES.cancha[t]).forEach(([c, v]) => o[`CANCHA_${t}_${c}`] = v)); return o; }, []);
  const [valores, setValores] = useState(base), [estado, setEstado] = useState('cargando'), [msg, setMsg] = useState('');
  useEffect(() => { supabase.from('targets').select('clave,valor').then(({ data, error }) => { if(error){ setEstado('sin-tabla'); return; } setValores(v => ({ ...v, ...Object.fromEntries((data || []).map(r => [r.clave, Number(r.valor)])) })); setEstado('ok'); }); }, []);
  async function guardar(){
    const filas = Object.entries(valores).map(([clave, valor]) => ({ clave, valor: Number(valor), actualizado_en: new Date().toISOString() }));
    if(filas.some(f => !(f.valor > 0))) return setMsg('Todos los targets tienen que ser números mayores a 0.');
    setMsg('Guardando...'); const { error } = await supabase.from('targets').upsert(filas);
    if(error) return setMsg(`No se guardó: ${error.message}`);
    aplicarTargets(filas); invalidarDatosAnalisis(); setMsg('Guardado. El Análisis ya usa los targets nuevos.');
  }
  const campo = (clave, label) => <label key={clave} className="target-campo">{label}<input type="number" min="1" value={valores[clave]} disabled={estado !== 'ok'} onChange={e => setValores(v => ({ ...v, [clave]: e.target.value }))}/><small>Original: {base[clave]}</small></label>;
  return <section className="panel">
    <h2>🎯 Targets de productividad (bultos por hora)</h2>
    {estado === 'sin-tabla' && <div className="notice">Para editar los targets falta crear la tabla en Supabase: abrí el SQL Editor y ejecutá una vez el archivo <b>supabase/targets.sql</b> del repositorio. Mientras tanto la app usa los valores originales.</div>}
    {estado === 'cargando' && <div className="notice">Cargando...</div>}
    <h3>General</h3><div className="target-grid">{campo('GENERAL_TODOS', 'Todos los turnos')}{campo('GENERAL_TARDE', 'Turno tarde')}{campo('GENERAL_NOCHE', 'Turno noche')}</div>
    {['TARDE','NOCHE'].map(t => <div key={t}><h3>Por cancha · turno {nombreTurno(t)}</h3><div className="target-grid">{Object.keys(TARGETS_ORIGINALES.cancha[t]).map(c => campo(`CANCHA_${t}_${c}`, c))}</div></div>)}
    <button className="primary" style={{ width: 'auto', padding: '12px 26px' }} onClick={guardar} disabled={estado !== 'ok'}>Guardar targets</button>
    {msg && <div className="notice">{msg}</div>}
  </section>;
}

/* ===================== Logueo en autoelevadores ===================== */
export function LogueoAdmin({ ctx }){
  const [datos, error] = useTablas(['autoelevador_logueo','autoelevador_logueo_mensual'], ctx.version);
  const [operador, setOperador] = useState('');
  const { enRango, turno, periodo, year, month } = ctx;
  const calc = useMemo(() => {
    if(!datos) return null;
    const rows = delTurno(datos.autoelevador_logueo.filter(enRango), turno).sort((a, b) => b.fecha.localeCompare(a.fecha) || txt(a.operador).localeCompare(txt(b.operador)));
    const color = (r, re) => re.test(r.semaforo || '');
    const premio = new Map(datos.autoelevador_logueo_mensual.filter(m => +m.anio === +year && +m.mes === +month).map(m => [txt(m.empleado_id), m]));
    const ocupada = r => (minutosOcupada(r.ultimo_uso, r.hora_esperada) ?? 0) > 0;
    const porOp = [...agrupar(rows, r => txt(r.empleado_id)).entries()].map(([id, rs]) => { const v = rs.filter(r => color(r, /^verde/i)).length, dif = rs.filter(r => r.minutos_diferencia != null);
      return { id, nombre: nombreDe(ctx.empMap, id, rs[0].operador), turnos: [...new Set(rs.map(r => r.turno))].join(', '), jornadas: rs.length, verde: v, amarillo: rs.filter(r => color(r, /^amarillo/i)).length, rojo: rs.filter(r => color(r, /^rojo/i)).length, pct: v / rs.length * 100,
        prom: dif.length ? dif.reduce((s, r) => s + n(r.minutos_diferencia), 0) / dif.length : null, ocupadas: rs.filter(ocupada).length, premiacion: periodo === 'mes' ? (premio.get(id)?.resultado || '—') : '—' }; }).sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre));
    return { rows, porOp, ocupadas: rows.filter(ocupada).length, verde: rows.filter(r => color(r, /^verde/i)).length, amarillo: rows.filter(r => color(r, /^amarillo/i)).length, rojo: rows.filter(r => color(r, /^rojo/i)).length };
  }, [datos, year, month, periodo, ctx.fecha, turno, ctx.empMap]);
  if(!calc) return <Cargando error={error && /autoelevador_logueo/.test(error) ? 'falta crear las tablas en Supabase (archivo supabase/logueo_autoelevador.sql).' : error}/>;
  const { rows } = calc, detalle = operador ? rows.filter(r => txt(r.empleado_id) === operador) : rows;
  const semaforo = s => <span className="auto-status" style={{ background: colorSemaforo(s), color: /^amarillo/i.test(s || '') ? '#332800' : '#fff' }}>{textoSemaforo(s)}</span>;
  return <section>
    <h2>⏱️ Logueo en autoelevadores</h2>
    <p className="note">Datos de la hoja Control_Diario del Excel de Control de Logueo AE. "Último uso" es la hora en que el turno anterior dejó la máquina con la que arrancó el operador; el Excel lo informa en los ingresos demorados.</p>
    {!rows.length ? <Empty/> : <div className="analysis-kpis">
      <Card title="JORNADAS" value={rows.length} line1={`${calc.porOp.length} operadores`}/>
      <Card title="A HORARIO (VERDE)" value={pct(calc.verde / rows.length * 100)} line1={`${calc.verde} jornadas`}/>
      <Card title="DEMORADOS" value={calc.amarillo + calc.rojo} line1={`Amarillo ${calc.amarillo} · Rojo ${calc.rojo}`}/>
      <Card title="MÁQUINA OCUPADA" value={calc.ocupadas} line1="Ingresos donde el turno anterior usó la máquina después del horario"/>
    </div>}
    <TablaDatos titulo="Por operador" sub={periodo === 'mes' ? 'La premiación es la del Resumen_Premiacion del Excel para el mes elegido.' : 'La premiación se muestra con el período Mes.'} archivo="Logueo_por_operador" data={calc.porOp} cols={[
      { t:'Operador', v:r => r.nombre }, { t:'Turno', v:r => r.turnos }, { t:'Jornadas', v:r => r.jornadas }, { t:'Verde', v:r => r.verde }, { t:'Amarillo', v:r => r.amarillo }, { t:'Rojo', v:r => r.rojo },
      { t:'% a horario', v:r => +r.pct.toFixed(1), f:v => <b style={{ color: v >= 85 ? '#17823b' : v >= 75 ? '#b88a00' : '#c62828' }}>{pct(v)}</b> }, { t:'Dif. promedio (min)', v:r => r.prom == null ? '' : +r.prom.toFixed(1) },
      { t:'Máquina ocupada', v:r => r.ocupadas }, { t:'Premiación', v:r => r.premiacion }
    ]}/>
    <section className="panel"><div className="sec-head"><div><h3>Día por día</h3><small>Elegí un operador para ver solo sus ingresos.</small></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select value={operador} onChange={e => setOperador(e.target.value)} style={{ margin: 0 }}><option value="">Todos los operadores</option>{calc.porOp.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
      {detalle.length > 0 && <button className="btn-export" onClick={() => exportarExcel('Logueo_dia_por_dia', ['Fecha','Turno','Operador','Horario','Primer logueo','Diferencia (min)','Estado','Máquina inicial','Máquinas usadas','Último uso de la máquina','Min. ocupada después del horario','Hora final'], detalle.map(r => [fechaAR(r.fecha), r.turno, nombreDe(ctx.empMap, r.empleado_id, r.operador), r.hora_esperada, r.primer_logueo, r.minutos_diferencia, textoSemaforo(r.semaforo), r.ae_inicial, r.ae_utilizados, r.ultimo_uso || '', Math.max(0, minutosOcupada(r.ultimo_uso, r.hora_esperada) ?? 0), r.hora_final]))}>⬇ Excel</button>}</div></div>
      {detalle.length ? <div className="scroll"><table><thead><tr>{['Fecha','Turno','Operador','Horario','Primer logueo','Diferencia','Estado','Máquina inicial','Máquina (turno anterior)','Hora final'].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{detalle.slice(0, 400).map(r => <tr key={r.id}><td>{fechaAR(r.fecha)}</td><td>{r.turno}</td><td>{nombreDe(ctx.empMap, r.empleado_id, r.operador)}</td><td>{txt(r.hora_esperada).slice(0, 5)}</td><td><b>{txt(r.primer_logueo).slice(0, 5)}</b></td><td>{r.minutos_diferencia == null ? '—' : `${r.minutos_diferencia > 0 ? '+' : ''}${r.minutos_diferencia} min`}</td><td>{semaforo(r.semaforo)}</td><td>{r.ae_inicial || '—'}</td><td><Ocupada ultimo={r.ultimo_uso} esperada={r.hora_esperada}/></td><td>{txt(r.hora_final).slice(0, 5) || '—'}</td></tr>)}</tbody></table>
        {detalle.length > 400 && <p className="note">Se muestran los primeros 400 de {detalle.length}. Bajá el Excel para ver todos o elegí un operador.</p>}</div> : <Empty/>}
    </section>
  </section>;
}
