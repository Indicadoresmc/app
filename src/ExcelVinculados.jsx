import React,{useEffect,useState}from'react';
import{AlertTriangle,CheckCircle2,Link2,RefreshCw,Unlink}from'lucide-react';
import{revisarExcel,publicarRevision}from'./cargaExcel';
import{invalidarDatosAnalisis}from'./datosAnalisis';
import{revisarCapacitacion,publicarCapacitacion}from'./capacitacion';

// Excel guardados en la carpeta de OneDrive de la compu: se vinculan una vez y
// "Actualizar" los vuelve a leer. Nada se publica sin tocar "Publicar todo".
const TIPOS=[
 ['manual','📦 Clasificación','Uno solo para todo el año (hoja Carga Datos).'],
 ['picking','📈 Picking','El del mes (hoja Bajada General).'],
 ['voice','🎧 Errores Voice','El del mes (hoja ArchiveWorkUnit).'],
 ['gatera','⚠️ Errores Gatera','El del mes (hoja con el nombre del mes).'],
 ['autoelevador','🚜 Autoelevador','El del mes.'],
 ['logueo','⏱️ Logueo AE','Control de logueo (hoja Control_Diario).'],
 ['cap_skap','🎓 SKAP y plan de acción','La carpeta Skap completa (los 6 archivos de Autoelevadores y Picking).'],
 ['cap_matriz','🎓 Habilidades (matriz)','Matriz por Tareas.xlsx (hoja Hechos_Capacitacion).']
];
const esCap=t=>t==='cap_skap'||t==='cap_matriz';
const capListo=r=>!!(r&&(r.usados.skap||r.usados.plan||r.usados.matriz));
const NOMBRE=Object.fromEntries(TIPOS.map(([id,label])=>[id,label]));
const disponible=typeof window!=='undefined'&&typeof window.showOpenFilePicker==='function'&&(()=>{try{return window.self===window.top}catch{return false}})();

const db=()=>new Promise((res,rej)=>{const r=indexedDB.open('indicadoresmc',1);r.onupgradeneeded=()=>r.result.createObjectStore('vinculos');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function leerVinculos(){try{const d=await db();return await new Promise(res=>{const st=d.transaction('vinculos').objectStore('vinculos'),out={};const q=st.openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[c.key]=c.value;c.continue()}else res(out)};q.onerror=()=>res({})})}catch{return{}}}
async function guardarVinculo(tipo,h){try{const d=await db();await new Promise(res=>{const t=d.transaction('vinculos','readwrite');h?t.objectStore('vinculos').put(h,tipo):t.objectStore('vinculos').delete(tipo);t.oncomplete=res;t.onerror=res})}catch{}}
const fechaHora=ms=>new Date(ms).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});

function Resumen({tipo,r,year}){
 if(esCap(tipo)){const sin=[...new Set([...r.sinVincular.skap,...r.sinVincular.plan,...r.sinVincular.matriz])];return <>{tipo==='cap_skap'?<p>SKAP: {r.skap.length} personas · Plan de acción: {r.plan.filter(x=>x.estado==='NOK').length} pendientes y {r.plan.filter(x=>x.estado==='OK').length} aprobados</p>:<p>Tareas: {new Set(r.tareas.map(x=>x.empleado_id)).size} personas</p>}<p>Personas no reconocidas: {sin.length}</p>{sin.length>0&&<p className="note">Pendientes: {sin.join(', ')}</p>}</>}
 if(tipo==='autoelevador')return <><p>Turnos: {r.turnos.join(', ')||'—'} · Resúmenes mensuales: {r.mensuales.length} · Días: {r.diarios.length} · Pausas: {r.pausas.length} · Horarios: {r.horarios.length}</p><p>Operadores no vinculados: {r.unknown.length}</p>{r.unknown.length>0&&<p className="note">Pendientes: {r.unknown.join(', ')}</p>}</>;
 return <><p>Filas leídas: {r.read} · Registros válidos: {r.valid.length}{tipo==='gatera'&&<> · Administrativos especiales: {r.special?.length||0}</>}{tipo==='voice'&&<> · Errores detectados: {r.totalErrores}</>}</p><p>Operarios no reconocidos: {r.unknown.length} · Duplicados internos: {r.duplicates} · Filas descartadas: {r.discarded}</p>{tipo==='manual'&&<p>{Object.entries(r.porMes||{}).map(([m,c])=>`${m}/${year}: ${c}`).join(' · ')}</p>}{tipo==='logueo'&&<p>Días: {r.desde?.split('-').reverse().join('/')} al {r.hasta?.split('-').reverse().join('/')} · Premiación: {r.mensual.length}</p>}{r.unknown.length>0&&<p className="note">Pendientes: {r.unknown.join(', ')}</p>}</>;
}

export default function ExcelVinculados({profile}){
 const hoy=new Date(),[year,setYear]=useState(hoy.getFullYear()),[month,setMonth]=useState(hoy.getMonth()+1);
 const[vinculos,setVinculos]=useState({}),[estado,setEstado]=useState({}),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 useEffect(()=>{leerVinculos().then(setVinculos)},[]);
 const vinculados=TIPOS.filter(([id])=>vinculos[id]);
 const listos=vinculados.filter(([id])=>{const r=estado[id]?.review;return r&&(esCap(id)?capListo(r):id==='autoelevador'?r.periodos.length>0:(r.valid.length||r.special?.length))});

 async function vincular(tipo){
  try{if(tipo==='cap_skap'){if(typeof window.showDirectoryPicker!=='function')return setMsg('Este navegador no deja vincular carpetas. Usá Chrome o Edge en la compu.');const h=await window.showDirectoryPicker({mode:'read'});await guardarVinculo(tipo,h);setVinculos(v=>({...v,[tipo]:h}));setEstado(e=>({...e,[tipo]:undefined}));return}
   const[h]=await window.showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx','.xlsm'],'application/vnd.ms-excel':['.xls']}}],multiple:false});
   await guardarVinculo(tipo,h);setVinculos(v=>({...v,[tipo]:h}));setEstado(e=>({...e,[tipo]:undefined}))}
  catch(e){if(e?.name!=='AbortError')setMsg('No se pudo vincular el archivo.')}
 }
 async function quitar(tipo){await guardarVinculo(tipo,null);setVinculos(({[tipo]:_,...v})=>v);setEstado(({[tipo]:_,...e})=>e)}

 async function actualizar(){
  setBusy(true);setMsg('Leyendo los Excel vinculados...');const nuevo={},permiso={};
  // Primero se piden los permisos (el navegador solo los pide justo después del clic).
  for(const[tipo]of vinculados){try{const h=vinculos[tipo];let p=await h.queryPermission({mode:'read'});if(p!=='granted')p=await h.requestPermission({mode:'read'});permiso[tipo]=p}catch{permiso[tipo]='denied'}}
  for(const[tipo]of vinculados){
   try{
    const h=vinculos[tipo];
    if(permiso[tipo]!=='granted')throw new Error('El navegador no dio permiso para leer el archivo. Tocá Actualizar de nuevo y elegí "Permitir".');
    if(esCap(tipo)){let files=[];if(tipo==='cap_skap'){for await(const[n,en]of h.entries()){if(en.kind==='file'&&/\.(xlsx|xlsm)$/i.test(n)&&!n.startsWith('~$'))files.push(await en.getFile())}}else files=[await h.getFile()];
     if(!files.length)throw new Error('La carpeta no tiene archivos Excel.');const review=await revisarCapacitacion(files);if(!capListo(review))throw new Error(tipo==='cap_skap'?'No encontré las hojas Consolidado ni BASE_PLAN_ACCION en la carpeta.':'No encontré la hoja Hechos_Capacitacion.');
     nuevo[tipo]={review,nombre:h.name,modificado:Math.max(...files.map(f=>f.lastModified))};setEstado(s=>({...s,[tipo]:nuevo[tipo]}));continue}
    const f=await h.getFile();
    const review=tipo==='autoelevador'?await(await import('./AutoelevadorCarga')).revisarAutoelevador(f,year):await revisarExcel(tipo,f,year,month);
    nuevo[tipo]={review,nombre:f.name,modificado:f.lastModified};
   }catch(e){nuevo[tipo]={error:e?.name==='NotFoundError'?'No se encontró el archivo. Si OneDrive lo movió o renombró, vinculalo de nuevo.':e.message}}
   setEstado(s=>({...s,[tipo]:nuevo[tipo]}));
  }
  setMsg('Revisá cada vista previa. Nada se publicó todavía.');setBusy(false);
 }

 async function publicarTodo(){
  if(!window.confirm(`Se van a reemplazar los datos publicados de: ${listos.map(([id])=>NOMBRE[id]).join(', ')}. ¿Continuar?`))return;
  setBusy(true);setMsg('Publicando...');invalidarDatosAnalisis();
  for(const[tipo]of listos){
   const{review,nombre}=estado[tipo];
   try{const m=esCap(tipo)?await publicarCapacitacion(review,{archivo:nombre}):tipo==='autoelevador'?await(await import('./AutoelevadorCarga')).publicarAutoelevador(review):await publicarRevision(review,{archivo:nombre,year,month,perfilId:profile.id});
    setEstado(s=>({...s,[tipo]:{...s[tipo],review:null,publicado:m}}))}
   catch(e){setEstado(s=>({...s,[tipo]:{...s[tipo],error:`No se publicó. Detalle: ${e.message}`}}))}
  }
  setMsg('Proceso terminado. Revisá el resultado de cada archivo.');setBusy(false);
 }

 if(!disponible)return <section className="panel vinculos"><h2>🔗 Excel vinculados de OneDrive</h2><p className="note">Para vincular los Excel y actualizar con un botón, abrí la app en Chrome o Edge desde la compu. En este navegador seguí usando la carga manual de abajo.</p></section>;
 return <section className="panel vinculos">
  <div className="vinculos-head"><div><h2>🔗 Excel vinculados de OneDrive</h2><p>Vinculá cada Excel de tu carpeta de OneDrive una vez. Después tocá <b>Actualizar</b>: se leen todos, revisás y recién ahí publicás.</p></div>
   <div className="vinculos-periodo"><label>Mes<input type="number" min="1" max="12" value={month} onChange={e=>setMonth(+e.target.value)}/></label><label>Año<input type="number" value={year} onChange={e=>setYear(+e.target.value)}/></label></div></div>
  <div className="vinculos-lista">{TIPOS.map(([id,label,ayuda])=>{const h=vinculos[id],e=estado[id];return <article key={id} className={'vinculo'+(h?' on':'')}>
   <div className="vinculo-top"><b>{label}</b>{h?<span className="vinculo-archivo">{h.name}{e?.modificado&&<small> · guardado {fechaHora(e.modificado)}</small>}</span>:<small>{ayuda}</small>}
    <span className="vinculo-acciones">{h?<><button onClick={()=>vincular(id)} disabled={busy}><Link2/>Cambiar</button><button onClick={()=>quitar(id)} disabled={busy} title="Desvincular"><Unlink/></button></>:<button onClick={()=>vincular(id)} disabled={busy}><Link2/>Vincular</button>}</span></div>
   {e?.error&&<p className="vinculo-error"><AlertTriangle/>{e.error}</p>}
   {e?.review&&<div className="vinculo-review"><Resumen tipo={id} r={e.review} year={year}/></div>}
   {e?.publicado&&<p className="vinculo-ok"><CheckCircle2/>{e.publicado}</p>}
  </article>})}</div>
  <div className="vinculos-botones"><button className="primary" onClick={actualizar} disabled={busy||!vinculados.length}><RefreshCw/>{busy?'Procesando...':'Actualizar'}</button>{listos.length>0&&<button className="primary" onClick={publicarTodo} disabled={busy}>Publicar todo ({listos.length})</button>}</div>
  {msg&&<div className="notice"><AlertTriangle/>{msg}</div>}
  <p className="note">Picking, Voice y Gatera usan el mes y año de arriba. Clasificación toma todos los meses del año y Autoelevador los meses que traiga el archivo. Capacitación reemplaza todo lo anterior y mantiene la fecha objetivo que ya estaba cargada. El navegador pide permiso para leer los archivos una vez por sesión.</p>
 </section>;
}
