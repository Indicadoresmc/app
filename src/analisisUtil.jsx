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
export const turnoCanon = v => { const t=norm(v); if(t.includes('NOCHE')||t==='TN'||t==='N')return'NOCHE'; if(t.includes('TARDE')||t==='TT'||t==='T')return'TARDE'; return t||'SIN TURNO'; };
export const nombreTurno = v => turnoCanon(v)==='NOCHE'?'Noche':turnoCanon(v)==='TARDE'?'Tarde':txt(v);
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

export const Card=({title,value,line1,line2})=><div style={{background:'#050505',color:'#fff',borderRadius:14,padding:16,display:'grid',gap:7,minWidth:0}}><small style={{color:'#ffd400',fontWeight:800}}>{title}</small><b style={{fontSize:28,lineHeight:1.05,overflowWrap:'anywhere'}}>{value}</b>{line1&&<small style={{lineHeight:1.35}}>{line1}</small>}{line2&&<small style={{lineHeight:1.35}}>{line2}</small>}</div>;
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
