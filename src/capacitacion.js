import*as XLSX from'xlsx';
import{supabase}from'./supabase';
import{normal}from'./cargaExcel';

// Mi capacitación: SKAP, plan de acción y tareas (matriz de habilidades) de cada persona.
// Lee los mismos Excel que la Matriz de Habilidades: carpeta Skap (hojas Consolidado y BASE_PLAN_ACCION)
// y Matriz por Tareas.xlsx (hoja Hechos_Capacitacion).

export const TAREAS=['Ae Simple','AE Doble','Layer','Reach','Etiquetador','Picking Lata','Picking 500','Picking Litro','Picking 2,25','Picking 1500','Picking BBOX','Picking Inverso','Clas. Litro','Clas. Litro Sorting','Clasif. Mix','Clasif. Barriles','Clasif. Chapadur','Clasif. Paletas','Reproceso','Operador Sorting'];
export const IMAGEN_TAREA={'AE SIMPLE':'https://i.imgur.com/ms6qRpB.jpeg','AE DOBLE':'https://i.imgur.com/WNP9hkX.png','LAYER':'https://i.imgur.com/8jJMf5W.png','REACH':'https://i.imgur.com/709hUFM.png','ETIQUETADOR':'https://i.imgur.com/cc369Qz.png','PICKING LATA':'https://i.imgur.com/sGNqifP.png','PICKING 500':'https://i.imgur.com/Hq2IPsl.png','PICKING LITRO':'https://i.imgur.com/VHulIe8.png','PICKING 2,25':'https://i.imgur.com/2C6Oc8T.png','PICKING 1500':'https://i.imgur.com/qEkkNP1.png','PICKING BBOX':'https://i.imgur.com/X9Xsfnn.png','PICKING INVERSO':'https://i.imgur.com/YOD23ep.png','CLAS. LITRO':'https://i.imgur.com/DZtTNui.png','CLAS. LITRO SORTING':'https://i.imgur.com/IqJuaKY.png','CLASIF. MIX':'https://i.imgur.com/MOABHwp.png','CLASIF. BARRILES':'https://i.imgur.com/1QXnLhx.png','CLASIF. CHAPADUR':'https://i.imgur.com/w5YzWSt.png','CLASIF. PALETAS':'https://i.imgur.com/h16pBzd.png','REPROCESO':'https://i.imgur.com/DWHxqkC.png','OPERADOR SORTING':'https://i.imgur.com/FCqEt9W.png'};
export const puntajeSkap=r=>r?((+r.basico||0)*5+(+r.proactivo||0)*3+(+r.empoderamiento||0)*2)/10:null;

const U=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
const txt=v=>v==null?'':String(v).replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const cleanLeg=v=>{if(v==null||v==='')return null;const s=String(v).trim().replace(/\.0+$/,'');return /^\d+$/.test(s)&&+s>0?s:null};
function num(v){if(v==null||v==='')return null;if(typeof v==='number')return v>1.5?v/100:v;const s=String(v).replace('%','').replace(',','.').trim(),n=parseFloat(s);if(isNaN(n))return null;return(String(v).includes('%')||n>1.5)?n/100:n}
function fecha(v){if(v==null||v==='')return null;if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
 if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null}
 const t=String(v).trim();let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 m=t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);if(m){let y=+m[3];if(y<100)y+=2000;return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}return null}
function tabla(rows,prueba){let h=-1;for(let i=0;i<Math.min(rows.length,40);i++){if(prueba((rows[i]||[]).map(U))){h=i;break}}
 if(h<0)return null;const H=(rows[h]||[]).map(U);
 const col=(...ns)=>{for(const n of ns){const i=H.findIndex(x=>x===n);if(i>=0)return i}for(const n of ns){const i=H.findIndex(x=>x.startsWith(n));if(i>=0)return i}return -1};
 return{col,body:rows.slice(h+1).filter(r=>r&&r.some(v=>v!=null&&String(v).trim()!==''))}}

// --- Lectura de filas (sin dependencia de XLSX, para poder probarla aparte) ---
export function turnoDeArchivo(n){const t=U(n);return /MANANA/.test(t)?'Mañana':/TARDE/.test(t)?'Tarde':/NOCHE/.test(t)?'Noche':''}
export function sectorDeArchivo(n){const t=U(n);return /AUTOELEV/.test(t)?'AE':/PICKING/.test(t)?'Picking':'Otro'}
export function leerConsolidado(nombre,rows){const t=tabla(rows,H=>H.includes('LEGAJO')&&H.some(x=>x.startsWith('EMPODERA')));if(!t)return[];
 const c={l:t.col('LEGAJO'),n:t.col('NOMBRE Y APELLIDO','APELLIDO Y NOMBRE'),b:t.col('HABILIDADES BASICO','HABILIDAD BASICO'),p:t.col('HABILIDAD PROACTIVO','HABILIDADES PROACTIVO'),e:t.col('EMPODERAMENTO','EMPODERAMIENTO')};
 return t.body.map(r=>({legajo:cleanLeg(r[c.l]),nombre:txt(r[c.n]),turno:turnoDeArchivo(nombre),sector:sectorDeArchivo(nombre),basico:num(r[c.b]),proactivo:num(r[c.p]),empoderamiento:num(r[c.e])})).filter(r=>r.legajo)}
export function leerPlan(nombre,rows){const t=tabla(rows,H=>H.includes('ESTADO')&&H.includes('HABILIDAD'));if(!t)return[];
 const c={l:t.col('LEGAJO'),n:t.col('APELLIDO Y NOMBRE'),tu:t.col('TURNO'),h:t.col('HABILIDAD'),i:t.col('ENTRENAMIENTO NO OK','ENTRENAMIENTO'),e:t.col('ESTADO')};
 return t.body.map(r=>({legajo:cleanLeg(r[c.l]),nombre:txt(r[c.n]),turno:txt(r[c.tu])||turnoDeArchivo(nombre),sector:sectorDeArchivo(nombre),habilidad:txt(r[c.h]),entrenamiento:txt(r[c.i]),estado:U(r[c.e])})).filter(r=>r.legajo&&(r.estado==='OK'||r.estado==='NOK'))}
export function leerMatriz(rows){const t=tabla(rows,H=>H.includes('PERSONA')&&H.includes('TAREA'));if(!t)return[];
 const c={p:t.col('PERSONA'),ta:t.col('TAREA'),s:t.col('SABE TAREA'),a:t.col('APTO'),tu:t.col('TURNO'),f:t.col('FECHA INICIO')};
 return t.body.filter(r=>txt(r[c.p])).map(r=>({persona:txt(r[c.p]),turno:txt(r[c.tu]),tarea:txt(String(r[c.ta]??'').split('\n')[0]),sabe:U(r[c.s])==='SI',apto:U(r[c.a])!=='NO APTO',fecha_inicio:c.f>=0?fecha(r[c.f]):null}))}

// --- Une cada fila con su empleado: por legajo y, si no hay, por nombre ---
export function crearBuscador(emps,variantes){
 const porLeg=new Map,porNom=new Map,porId=new Map;
 emps.forEach(e=>{porId.set(e.id,e);if(e.legajo!=null)porLeg.set(String(e.legajo).replace(/\.0+$/,''),e);porNom.set(normal(e.nombre_normalizado||e.apellido_nombre),e);porNom.set(normal(e.apellido_nombre),e)});
 (variantes||[]).filter(v=>v.activa!==false).forEach(v=>{const e=porId.get(v.empleado_id);if(e)porNom.set(normal(v.variante_normalizada),e)});
 const partes=s=>{const t=U(s).replace(/\./g,',');const i=t.indexOf(',');const[a,b]=i>=0?[t.slice(0,i),t.slice(i+1)]:[t.split(' ')[0],t.split(' ').slice(1).join(' ')];return[normal(a),new Set(normal(b).split(' ').filter(Boolean))]};
 const indice={};emps.forEach(e=>{const[a,b]=partes(e.apellido_nombre);(indice[a]=indice[a]||[]).push({e,b})});
 const cruce=(a,b)=>{let n=0;a.forEach(x=>{if(b.has(x))n++});return n};
 return{
  porLegajo:l=>porLeg.get(String(l))||null,
  porNombre(nombre,turno){const exacto=porNom.get(normal(nombre));if(exacto)return exacto;
   const[a,b]=partes(nombre),c=(indice[a]||[]).filter(x=>cruce(x.b,b));if(c.length===1)return c[0].e;
   if(c.length>1){const t=c.filter(x=>x.e.turno===turno);if(t.length===1)return t[0].e;const s=c.map(x=>[cruce(x.b,b),x.e]).sort((p,q)=>q[0]-p[0]);if(s[0][0]>s[1][0])return s[0][1]}
   return null}
 };
}
export function vincular(datos,buscar){
 const sin={skap:new Set,plan:new Set,matriz:new Set};const emp=(r,k)=>{const e=(r.legajo&&buscar.porLegajo(r.legajo))||buscar.porNombre(r.nombre||r.persona,r.turno);if(!e)sin[k].add(r.nombre||r.persona);return e};
 const skap=[];const vistos=new Set;datos.skap.forEach(r=>{const e=emp(r,'skap');if(!e)return;const k=e.id+'|'+r.sector;if(vistos.has(k))return;vistos.add(k);skap.push({empleado_id:e.id,legajo:r.legajo,nombre:e.apellido_nombre,turno:r.turno,sector:r.sector,basico:r.basico,proactivo:r.proactivo,empoderamiento:r.empoderamiento})});
 const plan=[];datos.plan.forEach(r=>{const e=emp(r,'plan');if(!e)return;plan.push({empleado_id:e.id,legajo:r.legajo,nombre:e.apellido_nombre,turno:r.turno,sector:r.sector,habilidad:r.habilidad,entrenamiento:r.entrenamiento,estado:r.estado})});
 const orden=t=>{const i=TAREAS.findIndex(x=>U(x)===U(t));return i>=0?i+1:99};
 const mejor=new Map;datos.matriz.forEach(r=>{const e=emp(r,'matriz');if(!e||!r.tarea)return;const k=e.id+'|'+U(r.tarea);const nivel=x=>x.apto?(x.sabe?2:1):0;const prev=mejor.get(k);
  if(!prev||nivel(r)>nivel(prev))mejor.set(k,{empleado_id:e.id,nombre:e.apellido_nombre,turno:r.turno,tarea:r.tarea,orden:orden(r.tarea),sabe:r.sabe,apto:r.apto,fecha_inicio:r.fecha_inicio})});
 return{skap,plan,tareas:[...mejor.values()],sinVincular:{skap:[...sin.skap],plan:[...sin.plan],matriz:[...sin.matriz]}};
}

// --- Archivos ---
export async function leerArchivos(files){
 const d={skap:[],plan:[],matriz:[]},usados={skap:0,plan:0,matriz:0},avisos=[];
 const lista=Array.from(files).filter(f=>/\.(xlsx|xlsm)$/i.test(f.name)&&!f.name.startsWith('~$')&&U(f.name)!=='OWD DEPOSITO 3.0 & 4.0.XLSX');
 for(const f of lista){try{
  const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});const hoja=n=>wb.SheetNames.find(s=>U(s)===n);const filas=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});
  const hm=hoja('HECHOS_CAPACITACION');if(hm){const r=leerMatriz(filas(hm));if(r.length){d.matriz=r;usados.matriz++}}
  const hc=hoja('CONSOLIDADO');if(hc){const r=leerConsolidado(f.name,filas(hc));if(r.length){d.skap.push(...r);usados.skap++}}
  const hp=hoja('BASE_PLAN_ACCION');if(hp){const r=leerPlan(f.name,filas(hp));if(r.length){d.plan.push(...r);usados.plan++}}
 }catch(e){avisos.push(`No se pudo leer ${f.name}: ${e.message}`)}}
 return{datos:d,usados,avisos,leidos:lista.length};
}
export async function revisarCapacitacion(files){
 const[{data:emps,error},{data:vars}]=await Promise.all([supabase.from('empleados').select('id,legajo,apellido_nombre,nombre_normalizado,turno,activo'),supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa')]);
 if(error)throw error;
 const l=await leerArchivos(files);const v=vincular(l.datos,crearBuscador(emps||[],vars||[]));
 return{...v,usados:l.usados,avisos:l.avisos,leidos:l.leidos};
}
async function lotes(tabla,filas){for(let i=0;i<filas.length;i+=300){const{error}=await supabase.from(tabla).insert(filas.slice(i,i+300));if(error)throw error}}
export async function publicarCapacitacion(review,{fechaObjetivo,archivo}){
 const hecho=[];
 // Si no se indica fecha (por ejemplo desde Excel vinculados), se mantiene la que ya estaba publicada.
 if(fechaObjetivo===undefined&&review.usados.plan){const{data}=await supabase.from('capacitacion_plan').select('fecha_objetivo').not('fecha_objetivo','is',null).order('fecha_objetivo',{ascending:false}).limit(1);fechaObjetivo=data?.[0]?.fecha_objetivo||null}
 if(review.usados.skap){const r=await supabase.from('capacitacion_skap').delete().gte('id',0);if(r.error)throw r.error;await lotes('capacitacion_skap',review.skap.map(x=>({...x,archivo})));hecho.push(`SKAP de ${review.skap.length} personas`)}
 if(review.usados.plan){const r=await supabase.from('capacitacion_plan').delete().gte('id',0);if(r.error)throw r.error;await lotes('capacitacion_plan',review.plan.map(x=>({...x,fecha_objetivo:x.estado==='NOK'&&fechaObjetivo?fechaObjetivo:null,archivo})));hecho.push(`plan de acción (${review.plan.filter(x=>x.estado==='NOK').length} pendientes)`)}
 if(review.usados.matriz){const r=await supabase.from('capacitacion_tareas').delete().gte('id',0);if(r.error)throw r.error;await lotes('capacitacion_tareas',review.tareas.map(x=>({...x,archivo})));hecho.push(`tareas de ${new Set(review.tareas.map(x=>x.empleado_id)).size} personas`)}
 return `Publicado: ${hecho.join(', ')}. Cada persona ya lo ve en “Habilidades/SKAP”.`;
}
