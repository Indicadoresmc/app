import { supabase } from './supabase';
import { normal } from './cargaExcel';

// Control de logueo en autoelevadores (Excel "Control_Logueo_AE").
// Fuente: hoja Control_Diario (la misma que usan el Dashboard y la Premiación del Excel),
// el "Último uso" de la máquina sale de Soporte_Resumen y el resultado del mes de Resumen_Premiacion.
let XLSX;
const fechaISO = v => { if(typeof v !== 'number') return null; const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}` : null; };
const hora = v => typeof v === 'number' ? XLSX.SSF.format('hh:mm:ss', v) : (String(v ?? '').trim() || null);
const entero = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v));
const numero = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const texto = v => String(v ?? '').trim() || null;

function tabla(wb, hoja, columnas){
  const ws = wb.Sheets[hoja]; if(!ws) throw new Error(`No se encontró la hoja ${hoja}.`);
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const hi = m.findIndex(r => columnas.every(c => r.some(x => normal(x) === normal(c))));
  if(hi < 0) throw new Error(`No se encontró la fila de encabezados en ${hoja}.`);
  const h = m[hi].map(normal), ix = c => h.indexOf(normal(c));
  return { filas: m.slice(hi + 1).filter(r => r.some(x => x != null && x !== '')), ix };
}

export async function revisarLogueo(file){
  XLSX ??= await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ctl = tabla(wb, 'Control_Diario', ['Fecha', 'ID Operador', 'Primer logueo']);
  const { data: emps, error } = await supabase.from('empleados').select('id,legajo,apellido_nombre,nombre_normalizado'); if(error) throw error;
  const { data: variantes, error: ev } = await supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa'); if(ev) throw ev;
  const porLegajo = new Map((emps || []).map(e => [String(e.legajo), e])), porNombre = new Map((emps || []).map(e => [normal(e.nombre_normalizado || e.apellido_nombre), e])), porId = new Map((emps || []).map(e => [e.id, e]));
  (variantes || []).filter(v => v.activa).forEach(v => { const e = porId.get(v.empleado_id); if(e) porNombre.set(normal(v.variante_normalizada), e); });
  const buscar = (legajo, nombre) => porLegajo.get(String(legajo ?? '').replace(/\.0$/, '')) || porNombre.get(normal(nombre));

  // Último uso de la máquina antes del ingreso (clave AAAAMMDD|ID Operador).
  const ultimo = new Map();
  if(wb.Sheets['Soporte_Resumen']){ const s = tabla(wb, 'Soporte_Resumen', ['Clave', 'Último uso']); s.filas.forEach(r => { const v = r[s.ix('Último uso')]; if(v != null && v !== '') ultimo.set(String(r[s.ix('Clave')]), hora(v)); }); }

  const valid = [], unknown = new Map(), seen = new Set(); let discarded = 0, duplicates = 0;
  for(const r of ctl.filas){
    const fecha = fechaISO(r[ctl.ix('Fecha')]), legajo = texto(r[ctl.ix('ID Operador')])?.replace(/\.0$/, ''), nombre = texto(r[ctl.ix('Operador')]), turno = texto(r[ctl.ix('Turno trabajado')]);
    if(!fecha || !legajo || !turno){ discarded++; continue; }
    const emp = buscar(legajo, nombre); if(!emp){ unknown.set(legajo, `${nombre} (${legajo})`); continue; }
    const key = `${fecha}|${turno}|${legajo}`; if(seen.has(key)){ duplicates++; continue; } seen.add(key);
    valid.push({ empleado_id: emp.id, legajo, operador: nombre, fecha, turno,
      hora_esperada: hora(r[ctl.ix('Hora esperada')]), primer_logueo: hora(r[ctl.ix('Primer logueo')]), minutos_diferencia: entero(r[ctl.ix('Minutos diferencia')]),
      resultado: texto(r[ctl.ix('Resultado premiación')]), semaforo: texto(r[ctl.ix('Semáforo')]), hora_final: hora(r[ctl.ix('Hora final')]),
      ae_inicial: texto(r[ctl.ix('AE inicial')]), ae_utilizados: texto(r[ctl.ix('AE utilizados')]), tipo_ae: texto(r[ctl.ix('Tipo AE')]),
      horas_ae: numero(r[ctl.ix('Horas AE')]), eventos: entero(r[ctl.ix('Eventos')]), ultimo_uso: ultimo.get(`${fecha.replace(/-/g, '')}|${legajo}`) || null });
  }

  const mensual = [];
  if(wb.Sheets['Resumen_Premiacion']){
    const p = tabla(wb, 'Resumen_Premiacion', ['Mes', 'ID Operador', 'Resultado premiación']);
    for(const r of p.filas){
      const mes = fechaISO(r[p.ix('Mes')]), legajo = texto(r[p.ix('ID Operador')])?.replace(/\.0$/, ''), nombre = texto(r[p.ix('Operador')]);
      if(!mes || !legajo) continue; const emp = buscar(legajo, nombre); if(!emp){ unknown.set(legajo, `${nombre} (${legajo})`); continue; }
      mensual.push({ empleado_id: emp.id, legajo, operador: nombre, anio: +mes.slice(0, 4), mes: +mes.slice(5, 7), turnos: texto(r[p.ix('Turno(s) trabajado(s)')]),
        verde: entero(r[p.ix('A horario (verde)')]) ?? 0, amarillo: entero(r[p.ix('Amarillo')]) ?? 0, rojo: entero(r[p.ix('Rojo')]) ?? 0, demorados: entero(r[p.ix('Demorados total')]) ?? 0,
        dias: entero(r[p.ix('Días controlados')]) ?? 0, pct_verde: numero(r[p.ix('% Verde')]) == null ? null : numero(r[p.ix('% Verde')]) * 100, resultado: texto(r[p.ix('Resultado premiación')]), observacion: texto(r[p.ix('Observación')]) });
    }
  }
  const fechas = valid.map(x => x.fecha).sort();
  return { tipo: 'logueo', valid, mensual, unknown: [...unknown.values()], discarded, duplicates, read: ctl.filas.length, sheet: 'Control_Diario', desde: fechas[0], hasta: fechas.at(-1) };
}

async function lotes(t, filas){ for(let i = 0; i < filas.length; i += 300){ const { error } = await supabase.from(t).insert(filas.slice(i, i + 300)); if(error) throw error; } }

// Reemplaza los días que trae el archivo (del primero al último) y el resumen de los meses que trae.
export async function publicarLogueo(review, { archivo }){
  if(!review.valid.length) throw new Error('No hay registros válidos para publicar.');
  const conArchivo = rows => rows.map(r => ({ ...r, archivo }));
  const del = await supabase.from('autoelevador_logueo').delete().gte('fecha', review.desde).lte('fecha', review.hasta); if(del.error) throw del.error;
  await lotes('autoelevador_logueo', conArchivo(review.valid));
  for(const k of new Set(review.mensual.map(m => `${m.anio}-${m.mes}`))){ const [a, m] = k.split('-').map(Number); const d = await supabase.from('autoelevador_logueo_mensual').delete().eq('anio', a).eq('mes', m); if(d.error) throw d.error; }
  await lotes('autoelevador_logueo_mensual', conArchivo(review.mensual));
  const f = v => v.split('-').reverse().join('/');
  return `Publicado: ${review.valid.length} jornadas de logueo del ${f(review.desde)} al ${f(review.hasta)} y ${review.mensual.length} resultados de premiación.`;
}

// Minutos que la máquina siguió en uso después de la hora esperada de ingreso (negativo = quedó libre antes).
// Las horas se comparan dentro de un margen de ±12 h para respetar el cruce de medianoche.
export function minutosOcupada(ultimoUso, horaEsperada){
  const m = t => { const x = String(t || '').match(/^(\d{1,2}):(\d{2})/); return x ? +x[1] * 60 + +x[2] : null; };
  const u = m(ultimoUso), e = m(horaEsperada); if(u == null || e == null) return null;
  let d = u - e; if(d > 720) d -= 1440; if(d <= -720) d += 1440; return d;
}
