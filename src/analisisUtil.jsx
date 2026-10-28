// Funciones y componentes compartidos por las pantallas de Análisis.
export const MIN_DIAS = 10;
export const TARGET_GENERAL = { TODOS: 362, TARDE: 398, NOCHE: 354 };
export const TARGET_CANCHA = {
  TARDE: { C1: 461, C2: 258, C3: 258, C4: 409, C5: 488 },
  NOCHE: { C1: 372, C2: 212, C3: 224, C4: 328, C5: 461 }
};
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const txt = v => String(v ?? '').trim();
export const norm = v => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,' ').trim().toUpperCase();
export const fmt = v => new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(n(v));
export const pct = v => `${n(v).toFixed(1)}%`;
export const iso = v => txt(v).slice(0,10);
export const fechaAR = v => { const [y,m,d]=iso(v).split('-'); return y&&m&&d?`${d}/${m}/${y}`:txt(v); };
export const turnoCanon = v => { const t=norm(v); if(t.includes('NOCHE')||t==='TN'||t==='N')return'NOCHE'; if(t.includes('TARDE')||t==='TT'||t==='T')return'TARDE'; if(t.includes('MANANA'))return'MANANA'; return t||'SIN TURNO'; };
export const nombreTurno = v => turnoCanon(v)==='NOCHE'?'Noche':turnoCanon(v)==='TARDE'?'Tarde':turnoCanon(v)==='MANANA'?'Mañana':txt(v);
export const operadorKey = r => txt(r.empleado_id||r.legajo||r.datos_originales?.operador||'SIN OPERADOR');
export const diasUnicos = rows => new Set(rows.map(r=>iso(r.fecha)).filter(Boolean)).size;
export const suma = (rows,key) => rows.reduce((s,r)=>s+n(r[key]),0);
export const paletas = rows => suma(rows,'pallets');
export const bultos = rows => suma(rows,'packs');
export const productividad = rows => { if(!rows.length)return 0; const packs=bultos(rows), seg=suma(rows,'duracion_segundos'); return packs>0&&seg>0?packs/(seg/3600):rows.reduce((s,r)=>s+n(r.productividad),0)/rows.length; };
export const targetCancha = r => TARGET_CANCHA[turnoCanon(r.turno)]?.[txt(r.cancha).toUpperCase()]||n(r.target)||0;
export const noEsError = r => { const m=norm(r.motivo||r.descripcion||r.comentario); return m==='OK'||m.includes('SIN NOVEDAD')||m.includes('SIN ERROR')||n(r.total_errores??r.cantidad??r.errores??1)===0; };
export const paletaId = r => txt(r.numero_paleta||r.paleta);
export const tipoAdministrativo = r => {
  const base = norm([r.cancha,r.operador,r.pickero,r.transporte,r.transportista,r.datos_originales?.operador,r.comentario].map(txt).join(' '));
  if(base.includes('CARRIER')) return 'E.Carrier';
  if(base.includes('TADA')) return 'TADA';
  if(norm(r.cancha)==='CARGA' || norm(r.operador)==='CARGA' || norm(r.pickero)==='CARGA' || norm(r.datos_originales?.operador)==='CARGA') return 'Carga';
  return '';
};
export const esAdministrativo = r => Boolean(tipoAdministrativo(r));
export const skuEtiqueta = r => txt(r.sku||r.codigo||r.material) || (r.__origen==='VOICE'?'SKU no disponible en Voice':'SKU no informado');

export function resumen(rows, errorRows, targetFijo=0){
  const validos=errorRows.filter(r=>!noEsError(r));
  const voice=validos.filter(r=>r.__origen==='VOICE').length;
  const gatera=validos.filter(r=>r.__origen==='GATERA').length;
  const total=voice+gatera;
  const ids=validos.map(paletaId).filter(Boolean);
  const paletasAfectadas=ids.length===validos.length?new Set(ids).size:null;
  const p=paletas(rows), prod=productividad(rows);
  const target=targetFijo||0;
  const cumplimiento=target>0?prod/target*100:(rows.length?rows.reduce((s,r)=>s+(targetCancha(r)>0?n(r.productividad)/targetCancha(r)*100:0),0)/rows.length:0);
  const tasaError=p>0?total/p*100:0;
  return {rows,errorRows:validos,paletas:p,bultos:bultos(rows),dias:diasUnicos(rows),productividad:prod,target,cumplimiento,voice,gatera,total,paletasAfectadas,tasaError,calidad:p>0?Math.max(0,100-tasaError):null};
}

export const Card=({title,value,line1,line2,info})=>{const ayuda=info??INFO_TARJETAS[title];return <div className={ayuda?'kpi-card con-info':'kpi-card'} tabIndex={ayuda?0:undefined} data-info={ayuda} style={{position:'relative',background:'#050505',color:'#fff',borderRadius:14,padding:16,display:'grid',gap:7,minWidth:0}}><small style={{color:'#ffd400',fontWeight:800}}>{title}{ayuda&&<span className="info-i" aria-label="Cómo se calcula">ⓘ</span>}</small><b style={{fontSize:28,lineHeight:1.05,overflowWrap:'anywhere'}}>{value}</b>{line1&&<small style={{lineHeight:1.35}}>{line1}</small>}{line2&&<small style={{lineHeight:1.35}}>{line2}</small>}</div>}
export const Empty=({children='Sin datos para el período seleccionado.'})=><div className="notice">{children}</div>;
export const Pill=({children,onClick,active=false})=><button onClick={onClick} style={{border:'1px solid #ddd',borderRadius:999,padding:'8px 12px',fontWeight:800,background:active?'#050505':'#fff',color:active?'#ffd400':'#111',cursor:'pointer'}}>{children}</button>;


// Targets editables: la tabla `targets` pisa los valores de arriba (claves GENERAL_TARDE, CANCHA_NOCHE_C3, etc.).
export const TARGETS_ORIGINALES = { general: { ...TARGET_GENERAL }, cancha: { TARDE: { ...TARGET_CANCHA.TARDE }, NOCHE: { ...TARGET_CANCHA.NOCHE } } };
export function aplicarTargets(filas){
  Object.assign(TARGET_GENERAL, TARGETS_ORIGINALES.general);
  Object.keys(TARGET_CANCHA).forEach(t => Object.assign(TARGET_CANCHA[t], TARGETS_ORIGINALES.cancha[t]));
  (filas || []).forEach(({ clave, valor }) => {
    const [tipo, a, b] = String(clave).split('_'), v = Number(valor);
    if(!(v > 0)) return;
    if(tipo === 'GENERAL' && a in TARGET_GENERAL) TARGET_GENERAL[a] = v;
    if(tipo === 'CANCHA' && TARGET_CANCHA[a] && b) TARGET_CANCHA[a][b] = v;
  });
}

// Puntaje del ranking: 50% productividad (cumplimiento contra el target de su cancha) y 50% pocos errores (tasa de error).
// Cada parte va de 0 a 100 comparando contra los demás operadores del mismo turno: 100 = el mejor del grupo, 0 = el más bajo.
// El cumplimiento se limita a 150% para que un caso extremo no aplaste al resto.
export function puntuarRanking(ops){
  if(!ops.length) return [];
  const c = ops.map(o => Math.min(o.cumplimiento, 150)), t = ops.map(o => o.tasaError);
  const cMin = Math.min(...c), cMax = Math.max(...c), tMin = Math.min(...t), tMax = Math.max(...t);
  return ops.map(o => { const ptsProd = cMax > cMin ? (Math.min(o.cumplimiento, 150) - cMin) / (cMax - cMin) * 100 : 100, ptsErr = tMax > tMin ? (tMax - o.tasaError) / (tMax - tMin) * 100 : 100;
    return { ...o, ptsProd, ptsErr, puntaje: (ptsProd + ptsErr) / 2 }; })
    .sort((a, b) => b.puntaje - a.puntaje || b.cumplimiento - a.cumplimiento || a.tasaError - b.tasaError)
    .map((o, i) => ({ ...o, puesto: i + 1 }));
}

// Explicación de cada tarjeta del administrador: aparece al pasar el mouse o tocar la tarjeta.
export const INFO_TARJETAS = {
  'PRODUCTIVIDAD': 'Bultos por hora = total de bultos ÷ horas de picking (suma de la "Duración total" de las tareas del Excel de Picking). Si el Excel no trae duración, se usa el promedio de la columna Bultos/hora.\nCumplimiento = productividad ÷ target × 100. En el Dashboard se usa el target general del turno; en la ficha, el promedio del cumplimiento de cada tarea contra el target de su cancha.',
  'CALIDAD DE ARMADO': 'Calidad = 100% − tasa de error.\nTasa de error = errores reales ÷ paletas armadas × 100.\nErrores reales = registros de Voice y Gatera con error en el período y turno. Cada registro cuenta 1 (no la cantidad). No cuentan las verificaciones OK / sin novedad / con 0 errores ni los registros administrativos.',
  'CALIDAD': 'Calidad = 100% − tasa de error. Tasa de error = errores reales (Voice + Gatera) ÷ paletas armadas × 100. Cada registro con error cuenta 1.',
  'ERRORES REALES': 'Registros de Voice y Gatera con error en el período y turno. Cada registro cuenta 1 (no la cantidad). No cuentan las verificaciones OK / sin novedad / con 0 errores ni los registros administrativos de Gatera.',
  'PALETAS ARMADAS': 'Suma de la columna Pallets del Excel de Picking en el período y turno.\nPromedio por día = paletas ÷ días con registros.',
  'PALETAS': 'Suma de la columna Pallets del Excel de Picking en el período y turno.',
  'BULTOS': 'Suma de la columna Packs / Bultos del Excel de Picking en el período y turno.\nPromedio por día = bultos ÷ días con registros.',
  'OPERADOR': 'Nombre y legajo según la nómina. Días trabajados = días distintos con tareas de picking en el período.',
  'PICKING': 'Cantidad de filas de picking cargadas (todas las fechas). Son tareas, no paletas.',
  'MESES': 'Meses del año elegido que tienen registros de picking.',
  'INCONSISTENCIAS': 'Controles de datos: errores sin empleado, sin fecha o sin número de paleta, y picking sin turno o sin cancha.',
  'E.CARRIER': 'Registros administrativos de E.Carrier. No afectan ranking, ficha ni calidad.',
  'TADA': 'Registros administrativos de TADA. No afectan ranking, ficha ni calidad.',
  'CARGA': 'Registros administrativos de Carga. No afectan ranking, ficha ni calidad.',
  'FALTANTE': 'Errores reales de tipo faltante. Voice: paletas con faltantes informados; Gatera: motivo que contiene "faltante". % = sobre el total de errores reales.',
  'SOBRANTE': 'Errores reales de tipo sobrante. Voice: paletas con sobrantes informados; Gatera: motivo que contiene "sobrante". % = sobre el total de errores reales.',
  'CAMBIO DE SABOR': 'Errores reales de tipo cambio de sabor. Voice: paletas con cambio de sabor informado; Gatera: motivo con "sabor" o "cambio". % = sobre el total de errores reales.',
  'OTROS MOTIVOS': 'Errores reales cuyo motivo no es faltante, sobrante ni cambio de sabor (por ejemplo "Error sin motivo").',
  'CUMPLIMIENTO': 'Real ÷ objetivo × 100, sumando todos los días del período (mismo cálculo que ve cada persona en su perfil).',
  'RESULTADO': 'Resultado = 4,6 × real ÷ objetivo. 4,6 es el target de paletas por hora-hombre de clasificación.',
  'REAL / OBJETIVO': 'Suma de las columnas Real y Objetivo del Excel de Clasificación en el período.',
  'PERSONAS': 'Personas con registros de clasificación en el período y turno.',
  'OPERADORES': 'Operadores con datos de autoelevador en el período. "Por debajo de 70%" = rendimiento menor a 70%.',
  'RENDIMIENTO PROMEDIO': 'Promedio del rendimiento de los operadores. Con período Mes se usa el rendimiento del Resumen Mensual del Excel; con otros períodos, el promedio de los rendimientos diarios.',
  'TIEMPO MUERTO': 'Tiempo muerto = objetivo − tiempo efectivo en operaciones (si da negativo, cuenta 0), sumado para todos los operadores o días.',
  'TIEMPO EFECTIVO': 'Suma del "Tiempo efectivo en operaciones" del Excel de autoelevador. Horas netas = suma de la columna "Horas netas".',
  'AUTOELEVADOR · RENDIMIENTO': 'Promedio del rendimiento diario del Excel de autoelevador en el período.\nTiempo muerto = suma de (objetivo − tiempo en operación) de cada día.',
  'RENDIMIENTO (PROM. DIARIO)': 'Promedio del rendimiento diario del Excel de autoelevador en el período.',
  'RALENTÍ': 'Suma del tiempo en ralentí (motor encendido sin operar) del Excel de autoelevador.',
  'DÍAS': 'Días distintos con registros en el período.',
  'CLASIFICACIÓN': 'Cumplimiento = real ÷ objetivo × 100 del período. Resultado = 4,6 × real ÷ objetivo.',
  'LOGUEO AE': '% a horario = jornadas en verde ÷ jornadas del período, según el semáforo de Control_Diario.\n"Ocupada por el turno anterior" = ingresos en los que el turno anterior usó la máquina después del horario de ingreso.',
  'ERRORES POR TIPO': 'Errores reales de la persona separados en faltante, sobrante, cambio de sabor u otro motivo.',
  'JORNADAS': 'Jornadas controladas (filas de la hoja Control_Diario) en el período y turno.',
  'A HORARIO (VERDE)': '% = jornadas en verde ÷ jornadas totales × 100. Verde = se logueó a horario y participa de la premiación.',
  'DEMORADOS': 'Amarillo = demorado dentro de la tolerancia. Rojo = demorado. Los dos cuentan como demorados para la premiación.',
  'MÁQUINA OCUPADA': 'Ingresos en los que el último uso de la máquina por el turno anterior fue después de la hora esperada de ingreso.'
};
