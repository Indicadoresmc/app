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
export function periodo(v){const t=txt(v);const p=t.split(/\s+al\s+/i);if(p.length===2){const a=iso(p[0]),b=iso(p[1]);if(a&&b)return{desde:a,hasta:b}}const d=iso(v);return d?{desde:d,hasta:d}:null}
function turnoDe(n){const t=U(n);return /MANANA/.test(t)?'Mañana':/TARDE/.test(t)?'Tarde':/NOCHE/.test(t)?'Noche':/INTERMEDIO/.test(t)?'Intermedio':''}

export function leerFilasHoras(nombre,rows){
 let h=-1;for(let i=0;i<Math.min(rows.length,60);i++){const H=(rows[i]||[]).map(U);if(H.includes('EMPLEADO')&&H.includes('LEGAJO')&&H.includes('CONCEPTO')){h=i;break}}
 if(h<0)return[];const H=rows[h].map(U),col=n=>H.findIndex(x=>x===n||x.startsWith(n));
 const c={n:col('EMPLEADO'),l:col('LEGAJO'),p:col('FECHA DESDE'),co:col('CONCEPTO'),d:col('DESCRIPCION'),q:col('CANTIDAD'),t:col('TURNO')};
 const out=[];for(const r of rows.slice(h+1)){if(!r)continue;const nombreE=txt(r[c.n]),leg=legajoCompleto(r[c.l]),per=periodo(r[c.p]),con=parseInt(r[c.co],10);
  if(!nombreE||!leg||!per||isNaN(con))continue;
  out.push({nombre:nombreE,legajo:leg,turno:txt(r[c.t])||turnoDe(nombre),periodo_desde:per.desde,periodo_hasta:per.hasta,concepto:con,descripcion:txt(r[c.d]),cantidad:cantidad(r[c.q])})}
 return out;
}
export async function revisarHoras(files){
 const lista=Array.from(files).filter(f=>/\.(xlsx|xlsm|xls)$/i.test(f.name)&&!f.name.startsWith('~$'));
 const filas=[],avisos=[];let usados=0;
 for(const f of lista){try{const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});let n=0;
   for(const s of wb.SheetNames){const r=leerFilasHoras(f.name,XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1,raw:true,blankrows:false}));if(r.length){filas.push(...r);n+=r.length}}
   if(n)usados++}catch(e){avisos.push(`No se pudo leer ${f.name}: ${e.message}`)}}
 const[{data:emps,error},{data:vars}]=await Promise.all([supabase.from('empleados').select('id,legajo,apellido_nombre,nombre_normalizado,turno,activo'),supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa')]);
 if(error)throw error;
 const buscar=crearBuscador(emps||[],vars||[]),sin=new Set,valid=[],vistos=new Set;
 for(const r of filas){const e=buscar.porLegajo(r.legajo)||buscar.porNombre(r.nombre,r.turno);if(!e){sin.add(r.nombre);continue}
  const k=[e.id,r.periodo_hasta,r.concepto].join('|');if(vistos.has(k))continue;vistos.add(k);valid.push({...r,empleado_id:e.id})}
 const grupos=[...new Set(valid.map(r=>r.periodo_hasta+'|'+r.turno))].map(k=>{const[hasta,turno]=k.split('|');const x=valid.find(r=>r.periodo_hasta===hasta&&r.turno===turno);return{desde:x.periodo_desde,hasta,turno,personas:new Set(valid.filter(r=>r.periodo_hasta===hasta&&r.turno===turno).map(r=>r.empleado_id)).size}});
 return{valid,grupos,sinVincular:[...sin],avisos,usados,leidos:lista.length};
}
export async function publicarHoras(review,{archivo}){
 for(const g of review.grupos){const r=await supabase.from('horas_personal').delete().eq('periodo_hasta',g.hasta).eq('turno',g.turno);if(r.error)throw r.error}
 const filas=review.valid.map(x=>({...x,archivo}));
 for(let i=0;i<filas.length;i+=300){const{error}=await supabase.from('horas_personal').insert(filas.slice(i,i+300));if(error)throw error}
 const fa=v=>v.split('-').reverse().join('/');
 return `Publicado: horas de ${new Set(review.valid.map(r=>r.empleado_id)).size} personas (${review.grupos.map(g=>`${g.turno} ${fa(g.desde)} al ${fa(g.hasta)}`).join(', ')}). Cada persona ya lo ve en “Horas”.`;
}
