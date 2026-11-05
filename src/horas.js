import*as XLSX from'xlsx';
import{supabase}from'./supabase';
import{crearBuscador}from'./capacitacion';

// Horas: lee el "Detalle de Consolidación" de cada turno (Empleado, Legajo, Fecha Desde, Concepto, Descripción, Cantidad, Turno).
const U=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
const txt=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
// Los legajos vienen cortos (4014) o completos (29022470): se completan a 8 dígitos con el prefijo 29.
export function legajoCompleto(v){if(v==null||v==='')return null;const s=String(v).trim().replace(/\.0+$/,'');if(!/^\d+$/.test(s)||+s<=0)return null;return s.length<=6?'29'+s.padStart(6,'0'):s}
function cantidad(v){if(v==null||v==='')return null;if(typeof v==='number')return v;const n=parseFloat(String(v).replace(/\./g,'').replace(',','.'));return isNaN(n)?null:n}
function iso(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);const m=String(v||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null}
// Acepta "16/09/2026 al 15/10/2026" y también sin año ("16/08 al 15/09"): el año se toma del nombre del archivo o del año actual.
const MESN={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,SETIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
export function anioDe(nombre){const m=String(nombre||'').match(/20\d\d/);if(m)return+m[0];const h=new Date(),mes=Object.entries(MESN).find(([k])=>U(nombre).includes(k))?.[1];return mes&&mes>h.getMonth()+1?h.getFullYear()-1:h.getFullYear()}
const dm=s=>{const m=String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})$/);return m?{d:+m[1],m:+m[2]}:null};
const ymd=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
export function periodo(v,anio){const t=txt(v);const p=t.split(/\s+al\s+/i);if(p.length===2){const a=iso(p[0]),b=iso(p[1]);if(a&&b)return{desde:a,hasta:b};
  const A=dm(p[0]),B=dm(p[1]);if(A&&B&&anio){const yb=anio,ya=A.m>B.m?anio-1:anio;return{desde:a||ymd(ya,A.m,A.d),hasta:b||ymd(yb,B.m,B.d)}}}
 const d=iso(v);return d?{desde:d,hasta:d}:null}
function turnoDe(n){const t=U(n);return /MANANA/.test(t)?'Mañana':/TARDE/.test(t)?'Tarde':/NOCHE/.test(t)?'Noche':/INTERMEDIO/.test(t)?'Intermedio':''}

export function leerFilasHoras(nombre,rows){
 let h=-1;for(let i=0;i<Math.min(rows.length,60);i++){const H=(rows[i]||[]).map(U);if(H.includes('EMPLEADO')&&H.includes('LEGAJO')&&H.includes('CONCEPTO')){h=i;break}}
 if(h<0)return[];const H=rows[h].map(U),col=n=>H.findIndex(x=>x===n||x.startsWith(n));
 const c={n:col('EMPLEADO'),l:col('LEGAJO'),p:col('FECHA DESDE'),co:col('CONCEPTO'),d:col('DESCRIPCION'),q:col('CANTIDAD'),t:col('TURNO')};
 const out=[];for(const r of rows.slice(h+1)){if(!r)continue;const nombreE=txt(r[c.n]),leg=legajoCompleto(r[c.l]),per=periodo(r[c.p],anioDe(nombre)),con=parseInt(r[c.co],10);
  if(nombreE&&leg&&!per&&!isNaN(con)){out.sinPeriodo=(out.sinPeriodo||0)+1;continue}if(!nombreE||!leg||!per||isNaN(con))continue;
  out.push({archivo:nombre,nombre:nombreE,legajo:leg,turno:txt(r[c.t])||turnoDe(nombre),periodo_desde:per.desde,periodo_hasta:per.hasta,concepto:con,descripcion:txt(r[c.d]),cantidad:cantidad(r[c.q])})}
 return out;
}
export async function revisarHoras(files){
 const lista=Array.from(files).filter(f=>/\.(xlsx|xlsm|xls)$/i.test(f.name)&&!f.name.startsWith('~$'));
 const filas=[],avisos=[];let usados=0;
 for(const f of lista){try{const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});let n=0;
   for(const s of wb.SheetNames){const r=leerFilasHoras(f.name,XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1,raw:true,blankrows:false}));if(r.sinPeriodo)avisos.push(`${f.name}: ${r.sinPeriodo} filas sin un período que se pueda leer en “Fecha Desde”.`);if(r.length){filas.push(...r);n+=r.length}}
   if(!n)avisos.push(`${f.name}: no se cargó ninguna fila.`)
   if(n)usados++}catch(e){avisos.push(`No se pudo leer ${f.name}: ${e.message}`)}}
 const[{data:emps,error},{data:vars}]=await Promise.all([supabase.from('empleados').select('id,legajo,apellido_nombre,nombre_normalizado,turno,activo'),supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa')]);
 if(error)throw error;
 const buscar=crearBuscador(emps||[],vars||[]),sin=new Set,valid=[],vistos=new Set;
 for(const r of filas){const e=buscar.porLegajo(r.legajo)||buscar.porNombre(r.nombre,r.turno);if(!e){sin.add(r.nombre);continue}
  const k=[e.id,r.periodo_hasta,r.concepto].join('|');if(vistos.has(k))continue;vistos.add(k);valid.push({...r,empleado_id:e.id})}
 const grupos=[...new Set(valid.map(r=>r.periodo_hasta+'|'+r.turno))].map(k=>{const[hasta,turno]=k.split('|');const x=valid.find(r=>r.periodo_hasta===hasta&&r.turno===turno);return{desde:x.periodo_desde,hasta,turno,personas:new Set(valid.filter(r=>r.periodo_hasta===hasta&&r.turno===turno).map(r=>r.empleado_id)).size}});
 const porArchivo=new Map;for(const r of filas){const k=r.periodo_hasta+'|'+r.turno;if(!porArchivo.has(k))porArchivo.set(k,new Set);porArchivo.get(k).add(r.archivo)}for(const[k,a]of porArchivo)if(a.size>1){const[hasta,turno]=k.split('|');avisos.push(`Turno ${turno}, período que termina ${hasta.split('-').reverse().join('/')}: viene en ${a.size} archivos (${[...a].join(', ')}). Se toma uno solo.`)}
 return{valid,grupos,sinVincular:[...sin],avisos,usados,leidos:lista.length};
}
export async function publicarHoras(review,{archivo}){
 for(const g of review.grupos){const r=await supabase.from('horas_personal').delete().eq('periodo_hasta',g.hasta).eq('turno',g.turno);if(r.error)throw r.error}
 const filas=review.valid.map(x=>({...x,archivo}));
 for(let i=0;i<filas.length;i+=300){const{error}=await supabase.from('horas_personal').insert(filas.slice(i,i+300));if(error)throw error}
 const fa=v=>v.split('-').reverse().join('/');
 return `Publicado: horas de ${new Set(review.valid.map(r=>r.empleado_id)).size} personas (${review.grupos.map(g=>`${g.turno} ${fa(g.desde)} al ${fa(g.hasta)}`).join(', ')}). Cada persona ya lo ve en “Horas”.`;
}
