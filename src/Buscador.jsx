import { useState } from 'react';
import { cargarTabla } from './datosAnalisis';
import { MIN_DIAS, TARGET_CANCHA, MESES, n, txt, norm, fmt, pct, iso, fechaAR, turnoCanon, nombreTurno, operadorKey, diasUnicos, suma, noEsError, esAdministrativo, resumen, Card } from './analisisUtil';
import { tipoError } from './AnalisisSecciones';

// Buscador del Asistente: entiende preguntas escritas con palabras clave y responde
// solo con los datos cargados. Siempre muestra qué interpretó de la pregunta.

const MES_NOMBRE = { ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6, JULIO:7, AGOSTO:8, SEPTIEMBRE:9, SETIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12 };
// Palabras que nunca se toman como parte de un nombre.
const RESERVADAS = new Set(['QUIEN','QUIENES','QUE','CUAL','CUALES','COMO','CUANTO','CUANTOS','CUANTAS','DONDE','DE','DEL','LA','LAS','EL','LOS','EN','Y','O','A','AL','CON','POR','PARA','MAS','MENOS','MEJOR','MEJORES','PEOR','PEORES','TOP','RANKING','MAYOR','MENOR','TUVO','TIENE','HIZO','ESTA','ESTE','ESE','ESA','SEMANA','MES','ANO','ANIO','HOY','AYER','PASADO','PASADA','ANTERIOR','BAJO','BAJOS','BAJA','BAJAS','ALTO','ALTOS','ALTA','ALTAS','NECESITA','NECESITAN','REVISION','REVISAR','ULTIMO','ULTIMA','ULTIMOS','ULTIMAS','DIAS','DIA','QUINCENA','TURNO','TARDE','NOCHE','CANCHA','CANCHAS','ERROR','ERRORES','PRODUCTIVIDAD','CALIDAD','PALETAS','BULTOS','CUMPLIMIENTO','CLASIFICACION','AUTOELEVADOR','AUTOELEVADORES','SKU','PRODUCTO','PRODUCTOS','FALTANTE','FALTANTES','SOBRANTE','SOBRANTES','SABOR','CAMBIO','VS','CONTRA','COMPARAR','COMPARACION','RESUMEN','DATOS','OPERADOR','OPERADORES','PICKERO','PICKEROS','RINDE','RINDIO','RENDIMIENTO','TRABAJO','TRABAJADOS','GENERAL','TOTAL','TODOS', ...Object.keys(MES_NOMBRE)]);

const isoDe = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sumarDias = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const finDeMes = (y, m) => isoDe(new Date(y, m, 0));

function interpretarPeriodo(q, palabras, original){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const anioTxt = q.match(/\b(20\d\d)\b/), anio = anioTxt ? +anioTxt[1] : hoy.getFullYear();
  const lunes = d => sumarDias(d, -((d.getDay() + 6) % 7));
  const fecha = original.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g);
  const aIso = t => { const [d, m, y] = t.split(/[/-]/).map(Number); return `${y ? (y < 100 ? 2000 + y : y) : anio}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; };
  if(fecha?.length >= 2) { const [a, b] = [aIso(fecha[0]), aIso(fecha[1])].sort(); return { desde: a, hasta: b, texto: `del ${fechaAR(a)} al ${fechaAR(b)}` }; }
  if(fecha?.length === 1) { const f = aIso(fecha[0]); return { desde: f, hasta: f, texto: fechaAR(f) }; }
  if(palabras.includes('HOY')) return { desde: isoDe(hoy), hasta: isoDe(hoy), texto: 'hoy' };
  if(palabras.includes('AYER')) { const a = isoDe(sumarDias(hoy, -1)); return { desde: a, hasta: a, texto: 'ayer' }; }
  if(palabras.includes('SEMANA') && (palabras.includes('PASADA') || palabras.includes('ANTERIOR'))) { const l = sumarDias(lunes(hoy), -7); return { desde: isoDe(l), hasta: isoDe(sumarDias(l, 6)), texto: 'la semana pasada' }; }
  if(palabras.includes('SEMANA')) return { desde: isoDe(lunes(hoy)), hasta: isoDe(hoy), texto: 'esta semana' };
  const ult = q.match(/\bULTIM[OA]S (\d{1,3}) DIAS\b/); if(ult) return { desde: isoDe(sumarDias(hoy, -(+ult[1] - 1))), hasta: isoDe(hoy), texto: `los últimos ${ult[1]} días` };
  if(palabras.includes('QUINCENA')) return { desde: isoDe(sumarDias(hoy, -14)), hasta: isoDe(hoy), texto: 'los últimos 15 días' };
  if(palabras.includes('MES') && (palabras.includes('PASADO') || palabras.includes('ANTERIOR'))) { const y = hoy.getMonth() ? hoy.getFullYear() : hoy.getFullYear() - 1, m = hoy.getMonth() || 12; return { desde: `${y}-${String(m).padStart(2,'0')}-01`, hasta: finDeMes(y, m), texto: `${MESES[m-1]} ${y}` }; }
  if(palabras.includes('MES')) { const y = hoy.getFullYear(), m = hoy.getMonth() + 1; return { desde: `${y}-${String(m).padStart(2,'0')}-01`, hasta: finDeMes(y, m), texto: `${MESES[m-1]} ${y}` }; }
  const mes = palabras.find(p => MES_NOMBRE[p]); if(mes) { const m = MES_NOMBRE[mes]; return { desde: `${anio}-${String(m).padStart(2,'0')}-01`, hasta: finDeMes(anio, m), texto: `${MESES[m-1]} ${anio}` }; }
  if(palabras.includes('ANO') || palabras.includes('ANIO') || anioTxt) return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, texto: `el año ${anio}` };
  return null;
}

function interpretarTema(palabras, q){
  if(palabras.some(p => ['AUTOELEVADOR','AUTOELEVADORES','CLARK','ZORRA'].includes(p))) return 'autoelevador';
  if(palabras.includes('CLASIFICACION')) return 'clasificacion';
  if(palabras.some(p => ['SKU','PRODUCTO','PRODUCTOS'].includes(p))) return 'sku';
  if(palabras.some(p => ['ERROR','ERRORES','FALTANTE','FALTANTES','SOBRANTE','SOBRANTES','SABOR'].includes(p))) return 'errores';
  if(palabras.includes('CALIDAD')) return 'calidad';
  if(palabras.some(p => ['PALETAS','BULTOS'].includes(p))) return 'paletas';
  if(palabras.some(p => ['DIAS','TRABAJO','TRABAJADOS','ASISTENCIA'].includes(p)) && !/ULTIM/.test(q)) return 'dias';
  if(palabras.some(p => ['PRODUCTIVIDAD','RINDE','RINDIO','RENDIMIENTO','CUMPLIMIENTO'].includes(p))) return 'productividad';
  return null;
}

function buscarPersonas(palabras, empleados){
  const claves = palabras.filter(p => p.length >= 3 && !RESERVADAS.has(p) && !/^\d/.test(p));
  if(!claves.length) return { personas: [], claves };
  const puntaje = empleados.map(e => { const ws = norm(e.apellido_nombre).split(' '); return { e, p: claves.filter(c => ws.includes(c)).length }; }).filter(x => x.p > 0);
  const max = Math.max(0, ...puntaje.map(x => x.p));
  return { personas: puntaje.filter(x => x.p === max).map(x => x.e), claves };
}

const METRICAS = {
  productividad: { label: 'Productividad', v: o => o.productividad, f: fmt, sube: true },
  errores: { label: 'Errores', v: o => o.total, f: v => fmt(v), sube: false },
  calidad: { label: 'Calidad', v: o => o.calidad ?? 0, f: pct, sube: true },
  paletas: { label: 'Paletas', v: o => o.paletas, f: fmt, sube: true },
  dias: { label: 'Días', v: o => o.dias, f: v => v, sube: true }
};
// Columnas del ranking; la del tema elegido va primero y no se repite.
const COLUMNAS = [['Productividad', o => fmt(o.productividad)], ['Días', o => o.dias], ['Paletas', o => fmt(o.paletas)], ['Cumplimiento', o => pct(o.cumplimiento)], ['Errores', o => o.total], ['Calidad', o => pct(o.calidad)]];

export async function responderPregunta(texto, ctx){
  const q = norm(texto), palabras = q.split(' ').filter(Boolean);
  const empleados = [...ctx.empMap.values()];
  const periodo = interpretarPeriodo(q, palabras, texto);
  const enRango = periodo ? (r => { const f = iso(r.fecha); return f >= periodo.desde && f <= periodo.hasta; }) : ctx.enRango;
  const textoPeriodo = periodo ? periodo.texto : 'el período elegido en los filtros';
  const turno = palabras.includes('TARDE') && !palabras.includes('NOCHE') ? 'TARDE' : palabras.includes('NOCHE') && !palabras.includes('TARDE') ? 'NOCHE' : '';
  const canchaM = q.match(/\bC(?:ANCHA)? ?([1-6])\b/), cancha = canchaM ? `C${canchaM[1]}` : '';
  const tema = interpretarTema(palabras, q);
  const { personas, claves } = buscarPersonas(palabras, empleados);
  const quiereRanking = palabras.some(p => ['QUIEN','QUIENES','MEJOR','MEJORES','PEOR','PEORES','TOP','RANKING','MAS','MENOS','MAYOR','MENOR'].includes(p));
  const haciaAbajo = palabras.some(p => ['PEOR','PEORES','MENOS','MENOR','BAJO','BAJOS','BAJA','BAJAS','REVISION','REVISAR'].includes(p)), haciaArriba = palabras.some(p => ['ALTO','ALTOS','ALTA','ALTAS'].includes(p));
  const compararTurnos = palabras.includes('TARDE') && palabras.includes('NOCHE');
  const noEncontrado = claves.length && !personas.length ? `No encontré a nadie con: ${claves.join(', ')}` : '';
  const entendido = [noEncontrado,personas.length === 1 && `Persona: ${personas[0].apellido_nombre}`, `Período: ${textoPeriodo}`, turno && `Turno: ${nombreTurno(turno)}`, cancha && `Cancha: ${cancha}`, tema && `Tema: ${tema}`].filter(Boolean);

  const delTurno = rows => !turno ? rows : rows.filter(r => turnoCanon(r.turno) === turno);
  const deCancha = rows => !cancha ? rows : rows.filter(r => txt(r.cancha).toUpperCase() === cancha);
  const P = deCancha(delTurno(ctx.picking.filter(enRango)));
  const E = deCancha(delTurno(ctx.errors.filter(e => enRango(e) && !esAdministrativo(e))));
  const sinDatos = { entendido, titulo: 'Sin datos', lineas: [`No hay registros de picking para ${textoPeriodo}${turno ? ` en el turno ${nombreTurno(turno)}` : ''}${cancha ? ` en ${cancha}` : ''}.`] };

  // Varias personas con el mismo apellido: se pide aclarar.
  if(personas.length > 1 && personas.length <= 12) return { entendido, titulo: '¿A quién te referís?', lineas: [`Encontré ${personas.length} personas que coinciden con "${claves.join(' ')}". Tocá una para repetir la pregunta con su nombre completo.`], opciones: personas.map(p => p.apellido_nombre), claves };

  // ---------- Una persona ----------
  if(personas.length === 1){
    const p = personas[0], id = txt(p.id), nombre = p.apellido_nombre;
    if(tema === 'clasificacion'){
      const rows = delTurno((await cargarTabla('clasificacion_manual')).filter(r => txt(r.empleado_id) === id && enRango(r)));
      if(!rows.length) return { entendido, titulo: nombre, lineas: [`No registra clasificación en ${textoPeriodo}.`] };
      const obj = suma(rows, 'objetivo'), real = suma(rows, 'real');
      return { entendido, titulo: `${nombre} · Clasificación`, tarjetas: [['CUMPLIMIENTO', pct(obj ? real / obj * 100 : 0)], ['RESULTADO', fmt(obj ? 4.6 * real / obj : 0)], ['DÍAS', diasUnicos(rows)], ['REAL / OBJETIVO', `${fmt(real)} / ${fmt(obj)}`]] };
    }
    if(tema === 'autoelevador'){
      const rows = delTurno((await cargarTabla('autoelevador_diario')).filter(r => txt(r.empleado_id) === id && enRango(r)));
      if(!rows.length) return { entendido, titulo: nombre, lineas: [`No registra autoelevador en ${textoPeriodo}.`] };
      return { entendido, titulo: `${nombre} · Autoelevador`, tarjetas: [['RENDIMIENTO (PROM. DIARIO)', pct(rows.reduce((s, r) => s + n(r.rendimiento), 0) / rows.length)], ['DÍAS', diasUnicos(rows)], ['TIEMPO MUERTO', hms(suma(rows, 'tiempo_muerto_segundos'))], ['RALENTÍ', hms(suma(rows, 'tiempo_ralenti_segundos'))]] };
    }
    const rows = P.filter(r => txt(r.empleado_id) === id), errs = E.filter(e => txt(e.empleado_id) === id);
    if(!rows.length && !errs.length) return { entendido, titulo: nombre, lineas: [`No tiene registros de picking ni errores en ${textoPeriodo}${turno ? ` (turno ${nombreTurno(turno)})` : ''}${cancha ? ` en ${cancha}` : ''}.`] };
    const r = resumen(rows, errs, 0), validos = errs.filter(e => !noEsError(e));
    const tipos = [...validos.reduce((m, e) => m.set(tipoError(e), (m.get(tipoError(e)) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
    const canchas = [...rows.reduce((m, x) => m.set(txt(x.cancha).toUpperCase(), (m.get(txt(x.cancha).toUpperCase()) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} (${k})`);
    return { entendido, titulo: nombre, tarjetas: [['PRODUCTIVIDAD', fmt(r.productividad), `Cumplimiento ${pct(r.cumplimiento)}`], ['CALIDAD', pct(r.calidad), `${r.total} errores · tasa ${pct(r.tasaError)}`], ['PALETAS', fmt(r.paletas), `${fmt(r.bultos)} bultos`], ['DÍAS', r.dias, `${rows.length} tareas`]],
      lineas: [tipos.length ? `Errores por tipo: ${tipos.map(([t, k]) => `${k} ${t.toLowerCase()}`).join(' · ')}.` : 'Sin errores reales en el período.', canchas.length ? `Canchas (tareas): ${canchas.join(', ')}.` : ''].filter(Boolean),
      tabla: validos.length ? { heads: ['Fecha', 'Origen', 'Tipo', 'Cancha', 'SKU', 'Motivo'], rows: validos.slice().sort((a, b) => iso(b.fecha).localeCompare(iso(a.fecha))).slice(0, 15).map(e => [fechaAR(iso(e.fecha)), e.__origen === 'VOICE' ? 'Voice' : 'Gatera', tipoError(e), txt(e.cancha) || '—', txt(e.sku) || '—', txt(e.motivo) || '—']) } : null };
  }

  // ---------- Clasificación / autoelevador en general ----------
  if(tema === 'clasificacion' || tema === 'autoelevador'){
    const esC = tema === 'clasificacion', rows = delTurno((await cargarTabla(esC ? 'clasificacion_manual' : 'autoelevador_diario')).filter(enRango));
    if(!rows.length) return { entendido, titulo: 'Sin datos', lineas: [`No hay registros de ${esC ? 'clasificación' : 'autoelevador'} en ${textoPeriodo}.`] };
    const porId = [...rows.reduce((m, r) => m.set(txt(r.empleado_id), [...(m.get(txt(r.empleado_id)) || []), r]), new Map())].map(([id, rs]) => {
      const obj = suma(rs, 'objetivo'), valor = esC ? (obj ? suma(rs, 'real') / obj * 100 : 0) : rs.reduce((s, r) => s + n(r.rendimiento), 0) / rs.length;
      return { nombre: txt(ctx.empMap.get(id)?.apellido_nombre) || 'SIN NOMBRE', valor, dias: diasUnicos(rs) }; });
    const peor = haciaAbajo && !haciaArriba;
    porId.sort((a, b) => peor ? a.valor - b.valor : b.valor - a.valor);
    return { entendido, titulo: `${esC ? 'Clasificación: cumplimiento' : 'Autoelevador: rendimiento promedio diario'} · ${peor ? 'los más bajos' : 'los más altos'}`, tabla: { heads: ['#', 'Operador', esC ? 'Cumplimiento' : 'Rendimiento', 'Días'], rows: porId.slice(0, 10).map((x, i) => [i + 1, x.nombre, pct(x.valor), x.dias]) } };
  }

  // ---------- SKU ----------
  if(tema === 'sku'){
    const gat = E.filter(e => e.__origen === 'GATERA' && !noEsError(e) && txt(e.sku));
    if(!gat.length) return { entendido, titulo: 'Sin datos', lineas: [`No hay errores de Gatera con SKU en ${textoPeriodo}.`] };
    const m = new Map(); gat.forEach(e => { const k = txt(e.sku), x = m.get(k) || { sku: k, desc: '', n: 0, cant: 0 }; x.n++; x.cant += n(e.cantidad); x.desc = x.desc || txt(e.descripcion); m.set(k, x); });
    return { entendido, titulo: 'SKU con más errores (Gatera)', tabla: { heads: ['SKU', 'Descripción', 'Errores', 'Cantidad'], rows: [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10).map(x => [x.sku, x.desc || '—', x.n, fmt(x.cant)]) } };
  }

  if(!P.length) return sinDatos;

  // ---------- Tarde vs noche ----------
  if(compararTurnos){
    const fila = t => { const rs = P.filter(r => turnoCanon(r.turno) === t), es = E.filter(e => turnoCanon(e.turno) === t), r = resumen(rs, es, 0); return [nombreTurno(t), fmt(r.productividad), pct(r.cumplimiento), fmt(r.paletas), r.total, pct(r.calidad)]; };
    return { entendido, titulo: `Turno tarde vs. noche · ${textoPeriodo}`, tabla: { heads: ['Turno', 'Productividad', 'Cumplimiento', 'Paletas', 'Errores', 'Calidad'], rows: [fila('TARDE'), fila('NOCHE')] } };
  }

  // ---------- Canchas ----------
  if(palabras.some(p => ['CANCHA','CANCHAS'].includes(p)) && !cancha){
    const filas = [...P.reduce((m, r) => { const k = `${turnoCanon(r.turno)}|${txt(r.cancha).toUpperCase()}`; return m.set(k, [...(m.get(k) || []), r]); }, new Map())].map(([k, rs]) => { const [t, c] = k.split('|'), es = E.filter(e => turnoCanon(e.turno) === t && txt(e.cancha).toUpperCase() === c), r = resumen(rs, es, TARGET_CANCHA[t]?.[c] || 0); return { t, c, ...r }; });
    const peor = haciaAbajo && !haciaArriba;
    const met = tema === 'errores' ? x => -x.tasaError : tema === 'calidad' ? x => x.calidad ?? 0 : x => x.cumplimiento;
    filas.sort((a, b) => peor ? met(a) - met(b) : met(b) - met(a));
    return { entendido, titulo: `Canchas ordenadas por ${tema === 'errores' ? 'tasa de error' : tema === 'calidad' ? 'calidad' : 'cumplimiento'} · ${peor ? 'de peor a mejor' : 'de mejor a peor'}`, tabla: { heads: ['Cancha', 'Turno', 'Cumplimiento', 'Productividad', 'Target', 'Errores', 'Calidad'], rows: filas.map(x => [x.c, nombreTurno(x.t), pct(x.cumplimiento), fmt(x.productividad), x.target, x.total, pct(x.calidad)]) } };
  }

  // ---------- Ranking de operadores ----------
  if(quiereRanking || (tema && tema !== 'errores' && !cancha)){
    const met = METRICAS[tema] || METRICAS.productividad;
    const ops = [...P.reduce((m, r) => m.set(operadorKey(r), [...(m.get(operadorKey(r)) || []), r]), new Map())].map(([k, rs]) => { const id = txt(rs[0].empleado_id), r = resumen(rs, E.filter(e => txt(e.empleado_id) === id), 0); return { ...r, nombre: txt(ctx.empMap.get(id)?.apellido_nombre || rs[0].datos_originales?.operador) || 'SIN NOMBRE' }; });
    const bajos = palabras.some(p => ['BAJO','BAJOS','BAJA','BAJAS'].includes(p)), menos = palabras.some(p => ['MENOS','MENOR'].includes(p)), peor = palabras.some(p => ['PEOR','PEORES'].includes(p));
    const desc = haciaArriba ? true : bajos || menos ? false : peor ? !met.sube : palabras.some(p => ['MAS','MAYOR'].includes(p)) ? true : met.sube;
    ops.sort((a, b) => desc ? met.v(b) - met.v(a) : met.v(a) - met.v(b));
    const pocos = ops.filter(o => o.dias < MIN_DIAS).length;
    return { entendido: [...entendido, `Orden: ${met.label} ${desc ? 'de mayor a menor' : 'de menor a mayor'}`], titulo: `${met.label} por operador`, lineas: pocos ? [`${pocos} de ${ops.length} operadores tienen menos de ${MIN_DIAS} días en el período: compará con cuidado.`] : [],
      tabla: { heads: ['#', 'Operador', met.label, ...COLUMNAS.filter(([h]) => h !== met.label).map(([h]) => h)], rows: ops.slice(0, 10).map((o, i) => [i + 1, o.nombre, met.f(met.v(o)), ...COLUMNAS.filter(([h]) => h !== met.label).map(([, f]) => f(o))]) } };
  }

  // ---------- Resumen general (con o sin cancha) ----------
  const r = resumen(P, E, 0), validos = E.filter(e => !noEsError(e));
  const tipos = [...validos.reduce((m, e) => m.set(tipoError(e), (m.get(tipoError(e)) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  if(tema === 'errores' || cancha || entendido.length > 1)
    return { entendido, titulo: `Resumen${cancha ? ` de ${cancha}` : ''} · ${textoPeriodo}`, tarjetas: [['PRODUCTIVIDAD', fmt(r.productividad), `Cumplimiento ${pct(r.cumplimiento)}`], ['ERRORES REALES', r.total, `Voice ${r.voice} · Gatera ${r.gatera}`], ['CALIDAD', pct(r.calidad), `Tasa ${pct(r.tasaError)}`], ['PALETAS', fmt(r.paletas), `${r.dias} días`]],
      lineas: tipos.length ? [`Errores por tipo: ${tipos.map(([t, k]) => `${k} ${t.toLowerCase()}`).join(' · ')}.`] : [] };

  return { entendido, titulo: 'No entendí la pregunta', lineas: [claves.length ? `No encontré ninguna persona ni tema con: ${claves.join(', ')}.` : '','Probá con un nombre, un tema (productividad, errores, calidad, paletas, clasificación, autoelevador, SKU, cancha) y un período (octubre, esta semana, ayer, 15/10).'].filter(Boolean), ayuda: true };
}

const hms = v => { const s = Math.max(0, Math.round(n(v))); return `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
export const EJEMPLOS = ['¿Quién tuvo más errores este mes?', 'Mejor productividad turno noche', 'Canchas que necesitan revisión', 'Tarde vs noche', 'SKU con más errores', 'Clasificación los más bajos', 'Autoelevador mejores', 'Errores en C3 la semana pasada'];

export function BuscadorPreguntas({ ctx }){
  const [texto, setTexto] = useState(''), [res, setRes] = useState(null), [busy, setBusy] = useState(false);
  async function preguntar(t = texto){
    if(!t.trim()) return; setTexto(t); setBusy(true);
    try { setRes(await responderPregunta(t, ctx)); } catch(e) { setRes({ titulo: 'No se pudo responder', lineas: [e.message || 'Error al cargar los datos.'] }); }
    setBusy(false);
  }
  return <section className="panel buscador">
    <h3>💬 Preguntá lo que necesites</h3>
    <form onSubmit={e => { e.preventDefault(); preguntar(); }} className="buscador-form"><input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej.: errores de Pérez en octubre · mejor cancha noche · productividad de Gómez esta semana"/><button className="primary" disabled={busy}>{busy ? 'Buscando...' : 'Preguntar'}</button></form>
    <div className="buscador-ejemplos">{EJEMPLOS.map(x => <button key={x} type="button" onClick={() => preguntar(x)}>{x}</button>)}</div>
    {res && <div className="buscador-res">
      {res.entendido?.length > 0 && <p className="buscador-entendido">Entendí → {res.entendido.join(' · ')}</p>}
      <h3>{res.titulo}</h3>
      {res.tarjetas && <div className="analysis-kpis">{res.tarjetas.map(([t, v, l], i) => <Card key={i} title={t} value={v} line1={l}/>)}</div>}
      {res.lineas?.map((l, i) => <p key={i}>{l}</p>)}
      {res.opciones && <div className="buscador-ejemplos">{res.opciones.map(o => <button key={o} type="button" onClick={() => preguntar(`${texto.split(/\s+/).filter(w => !res.claves.includes(norm(w))).join(' ')} ${o}`)}>{o}</button>)}</div>}
      {res.tabla && <div className="scroll"><table><thead><tr>{res.tabla.heads.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{res.tabla.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
    </div>}
  </section>;
}
