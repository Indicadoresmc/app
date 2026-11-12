import React,{useCallback,useEffect,useRef,useState}from'react';
import{AlertTriangle,CheckCircle2,Link2,RefreshCw,Unlink,Trash2}from'lucide-react';
import{revisarExcel,publicarRevision,normal}from'./cargaExcel';
import{invalidarDatosAnalisis}from'./datosAnalisis';
import{revisarCapacitacion,publicarCapacitacion}from'./capacitacion';
import{revisarHoras,publicarHoras}from'./horas';

// Excel de OneDrive vinculados en esta compu. Igual que la Diaria: al abrir la página,
// al volver a la pestaña y cada 5 minutos se fija si algún Excel cambió; si cambió lo lee y lo
// publica solo. Lo raro (personas no reconocidas, duplicados, errores) queda en el Registro.
//
// modo 'archivo'  → un Excel fijo.
// modo 'carpeta'  → todos los Excel de la carpeta juntos (SKAP, Horas).
// modo 'mes'      → una carpeta con un Excel por mes: toma el del mes más nuevo según el nombre
//                   (número adelante o nombre del mes) y vuelve a publicar cualquier mes que se modifique.
const TIPOS=[
 {id:'manual',label:'📦 Clasificación',modo:'archivo',ayuda:'Uno solo para todo el año (hoja Carga Datos).'},
 {id:'picking',label:'📈 Picking',modo:'mes',filtro:'ANALISIS PICKING',ayuda:'La carpeta "Analisis Picking 2026". Toma sola el mes más nuevo.'},
 {id:'voice',label:'🎧 Errores Voice',modo:'mes',filtro:'REPORTE DE ERRORES',ayuda:'La carpeta "Errores Picking 2026". Toma sola el mes más nuevo.'},
 {id:'gatera',label:'⚠️ Errores Gatera',modo:'mes',ayuda:'El archivo o la carpeta (hoja con el nombre del mes).'},
 {id:'autoelevador',label:'🚜 Autoelevador Mañana-Tarde',modo:'archivo',ae:true,ayuda:'El Excel "Productividad_Turnos_Manana_Tarde_2026" (no la carpeta).'},
 {id:'autoelevador_noche',label:'🚜 Autoelevador Noche',modo:'archivo',ae:true,ayuda:'El Excel de Productividad del turno noche 2026 (no la carpeta).'},
 {id:'logueo',label:'⏱️ Logueo AE',modo:'archivo',ayuda:'Control_Logueo_AE_2026 (hoja Control_Diario).'},
 {id:'cap_skap',label:'🎓 SKAP y plan de acción',modo:'carpeta',ayuda:'La carpeta Skap completa (los 6 archivos de Autoelevadores y Picking).'},
 {id:'cap_matriz',label:'🎓 Habilidades (matriz)',modo:'archivo',ayuda:'Matriz por Tareas.xlsx (hoja Hechos_Capacitacion).'},
 {id:'horas',label:'🕐 Horas del personal',modo:'carpeta',ayuda:'La carpeta de los Detalle de Consolidación (un Excel por turno).'}
];
const POR_ID=Object.fromEntries(TIPOS.map(t=>[t.id,t]));
const esCap=t=>t==='cap_skap'||t==='cap_matriz';
const esAE=t=>!!POR_ID[t]?.ae;
const capListo=r=>!!(r&&(r.usados.skap||r.usados.plan||r.usados.matriz));
const MESES_TXT=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES=[['ENERO'],['FEBRERO'],['MARZO'],['ABRIL'],['MAYO'],['JUNIO'],['JULIO'],['AGOSTO'],['SEPTIEMBRE','SETIEMBRE'],['OCTUBRE'],['NOVIEMBRE'],['DICIEMBRE']];
const disponible=typeof window!=='undefined'&&typeof window.showOpenFilePicker==='function'&&(()=>{try{return window.self===window.top}catch{return false}})();
const CADA=5*60*1000;

// Mes y año a partir del nombre del archivo. Si nombra dos meses (ej. "Enero-Julio") es un consolidado y se ignora.
function periodoDeNombre(nombre){
 const base=nombre.replace(/\.[^.]+$/,''),n=' '+normal(base)+' ';
 const meses=[...new Set(MESES.flatMap((alias,i)=>alias.some(a=>n.includes(' '+a+' '))?[i+1]:[]))];
 let mes=null;
 if(meses.length>1)return null;
 if(meses.length===1)mes=meses[0];
 else{const m=base.match(/^\s*(\d{1,2})(?=\D)/);if(m&&+m[1]>=1&&+m[1]<=12)mes=+m[1]}
 if(!mes)return null;
 const hoy=new Date();let anio=null;
 const y4=base.match(/(?:^|\D)(20\d{2})(?:\D|$)/);if(y4)anio=+y4[1];
 else{const y2=base.match(/[-_ ](\d{2})\s*$/);if(y2)anio=2000+ +y2[1]}
 if(!anio)anio=mes>hoy.getMonth()+1?hoy.getFullYear()-1:hoy.getFullYear();
 return{mes,anio};
}
const textoPeriodo=p=>p?`${MESES_TXT[p.mes-1]} ${p.anio}`:'';

async function listarExcel(dir,nivel=0,ruta=''){
 const out=[];
 for await(const[n,en]of dir.entries()){
  if(en.kind==='file'&&/\.(xlsx|xlsm|xls)$/i.test(n)&&!n.startsWith('~$'))out.push({ruta:ruta+n,file:await en.getFile()});
  else if(en.kind==='directory'&&nivel<2)out.push(...await listarExcel(en,nivel+1,ruta+n+'/'));
 }
 return out;
}
const vaciaMsg=h=>`La carpeta “${h.name}” está vacía para el navegador. Si es de OneDrive, abrila en el Explorador, clic derecho → “Mantener siempre en este dispositivo”.`;

// ---------- guardado en el navegador ----------
const db=()=>new Promise((res,rej)=>{const r=indexedDB.open('indicadoresmc',1);r.onupgradeneeded=()=>r.result.createObjectStore('vinculos');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function leerVinculos(){try{const d=await db();return await new Promise(res=>{const st=d.transaction('vinculos').objectStore('vinculos'),out={};const q=st.openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[c.key]=c.value;c.continue()}else res(out)};q.onerror=()=>res({})})}catch{return{}}}
async function guardarVinculo(tipo,h){try{const d=await db();await new Promise(res=>{const t=d.transaction('vinculos','readwrite');h?t.objectStore('vinculos').put(h,tipo):t.objectStore('vinculos').delete(tipo);t.oncomplete=res;t.onerror=res})}catch{}}
const LS={get(k,d){try{const v=localStorage.getItem('imc_'+k);return v?JSON.parse(v):d}catch{return d}},set(k,v){try{localStorage.setItem('imc_'+k,JSON.stringify(v))}catch{}}};
const fechaHora=ms=>new Date(ms).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});

// ---------- qué archivos hay que leer ----------
// Devuelve una lista de trabajos {files:[File], nombre, periodo}. Solo los que cambiaron, salvo forzar.
async function trabajosDe(tipo,h,firmasTipo,forzar){
 const def=POR_ID[tipo];
 if(h.kind==='file'){
  const f=await h.getFile(),firma=f.name+'|'+f.lastModified;
  if(!forzar&&firmasTipo['*']===firma)return[];
  const periodo=def.modo==='mes'?periodoDeNombre(f.name):null;
  return[{files:[f],nombre:f.name,periodo,firmas:{'*':firma}}];
 }
 if(def.modo==='archivo')throw new Error('Acá va el Excel, no la carpeta. Tocá Cambiar y elegí el archivo.');
 const todos=await listarExcel(h);
 if(!todos.length)throw new Error(vaciaMsg(h));
 if(def.modo==='carpeta'){
  const firma=todos.map(x=>x.ruta+'|'+x.file.lastModified).sort().join(';');
  if(!forzar&&firmasTipo['*']===firma)return[];
  return[{files:todos.map(x=>x.file),nombre:h.name,periodo:null,firmas:{'*':firma}}];
 }
 // modo 'mes'
 let cand=todos.map(x=>({...x,periodo:periodoDeNombre(x.ruta.split('/').pop())})).filter(x=>x.periodo&&(!def.filtro||normal(x.ruta.split('/').pop()).includes(def.filtro)));
 if(!cand.length)throw new Error(`En “${h.name}” no encontré Excel ${def.filtro?`que digan “${def.filtro.toLowerCase()}” y `:''}con el mes en el nombre.`);
 cand.sort((a,b)=>(b.periodo.anio*12+b.periodo.mes)-(a.periodo.anio*12+a.periodo.mes)||b.file.lastModified-a.file.lastModified);
 // Un archivo por mes: si hay dos del mismo mes, el modificado más recientemente.
 const porMes=new Map();for(const c of cand){const k=c.periodo.anio*12+c.periodo.mes;if(!porMes.has(k))porMes.set(k,c)}
 const lista=[...porMes.values()],primeraVez=!Object.keys(firmasTipo).length;
 const elegidos=lista.filter((c,i)=>{const firma=String(c.file.lastModified);
  if(i===0)return forzar||firmasTipo[c.ruta]!==firma;            // el mes más nuevo
  return!primeraVez&&firmasTipo[c.ruta]!==undefined&&firmasTipo[c.ruta]!==firma; // un mes anterior que alguien volvió a tocar
 });
 const todasFirmas=Object.fromEntries(lista.map(c=>[c.ruta,String(c.file.lastModified)]));
 return elegidos.map((c,i)=>({files:[c.file],nombre:c.ruta,periodo:c.periodo,firmas:i===elegidos.length-1?todasFirmas:{}}));
}

// ---------- leer y publicar ----------
async function leerYPublicar(tipo,t,perfilId){
 const f=t.files[0],hoy=new Date(),anio=t.periodo?.anio||hoy.getFullYear(),mes=t.periodo?.mes||hoy.getMonth()+1;
 let review,listo,msg;
 if(tipo==='horas'){review=await revisarHoras(t.files);listo=review.valid.length>0;if(!listo)throw new Error('No encontré horas (columnas Empleado, Legajo y Concepto).');msg=await publicarHoras(review,{archivo:t.nombre})}
 else if(esCap(tipo)){review=await revisarCapacitacion(t.files);if(!capListo(review))throw new Error(tipo==='cap_skap'?'No encontré las hojas Consolidado ni BASE_PLAN_ACCION.':'No encontré la hoja Hechos_Capacitacion.');msg=await publicarCapacitacion(review,{archivo:t.nombre})}
 else if(esAE(tipo)){const ae=await import('./AutoelevadorCarga');review=await ae.revisarAutoelevador(f,anio);if(!review.periodos.length)throw new Error('El Excel no trajo datos de operadores reconocidos.');msg=await ae.publicarAutoelevador(review)}
 else{review=await revisarExcel(tipo,f,anio,mes);if(!(review.valid.length||review.special?.length))throw new Error(`No hay registros válidos${t.periodo?` de ${textoPeriodo(t.periodo)}`:''}.`);msg=await publicarRevision(review,{archivo:t.nombre,year:anio,month:mes,perfilId})}
 return{review,msg};
}
// Lo raro que conviene revisar.
function avisosDe(tipo,r){
 const a=[];if(!r)return a;
 if(tipo==='horas'){if(r.sinVincular.length)a.push(`Personas no reconocidas (${r.sinVincular.length}): ${r.sinVincular.join(', ')}`);r.avisos?.forEach(x=>a.push(x));return a}
 if(esCap(tipo)){const sin=[...new Set([...r.sinVincular.skap,...r.sinVincular.plan,...r.sinVincular.matriz])];if(sin.length)a.push(`Personas no reconocidas (${sin.length}): ${sin.join(', ')}`);return a}
 if(r.unknown?.length)a.push(`${esAE(tipo)?'Operadores':'Operarios'} no reconocidos (${r.unknown.length}): ${r.unknown.join(', ')}`);
 if(r.duplicates)a.push(`Duplicados dentro del Excel: ${r.duplicates}`);
 return a;
}

function Resumen({tipo,r}){
 if(tipo==='horas'){const fa=v=>v.split('-').reverse().join('/');return <>{r.grupos.map(g=><p key={g.hasta+g.turno}>Turno {g.turno||'sin turno'}: {g.personas} personas · {fa(g.desde)} al {fa(g.hasta)}</p>)}<p className="note">Archivos leídos: {r.leidos} · con horas: {r.usados}</p></>}
 if(esCap(tipo))return tipo==='cap_skap'?<p>SKAP: {r.skap.length} personas · Plan de acción: {r.plan.filter(x=>x.estado==='NOK').length} pendientes y {r.plan.filter(x=>x.estado==='OK').length} aprobados</p>:<p>Tareas: {new Set(r.tareas.map(x=>x.empleado_id)).size} personas</p>;
 if(esAE(tipo))return <p>Turnos: {r.turnos.join(', ')||'—'} · Resúmenes: {r.mensuales.length} · Días: {r.diarios.length} · Pausas: {r.pausas.length}</p>;
 return <p>Filas leídas: {r.read} · Registros válidos: {r.valid.length}{tipo==='voice'&&<> · Errores detectados: {r.totalErrores}</>}{tipo==='logueo'&&r.desde&&<> · Días: {r.desde.split('-').reverse().join('/')} al {r.hasta?.split('-').reverse().join('/')}</>}</p>;
}

export default function ExcelVinculados({profile}){
 const[vinculos,setVinculos]=useState(null),[estado,setEstado]=useState(()=>LS.get('estado',{})),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const[registro,setRegistro]=useState(()=>LS.get('registro',[])),[verTodo,setVerTodo]=useState(false);
 const corriendo=useRef(false),vincRef=useRef({});
 useEffect(()=>{leerVinculos().then(v=>{vincRef.current=v;setVinculos(v)})},[]);
 const anotar=useCallback(items=>{if(!items.length)return;setRegistro(r=>{const n=[...items.map(x=>({t:Date.now(),...x})),...r].slice(0,300);LS.set('registro',n);return n})},[]);
 const ponerEstado=(tipo,e)=>setEstado(s=>{const n={...s,[tipo]:e};LS.set('estado',Object.fromEntries(Object.entries(n).filter(([,x])=>x).map(([k,{resumen,...x}])=>[k,x])));return n});

 // interactivo = tocaste el botón (puede pedir permiso y relee todo aunque no haya cambiado).
 const correr=useCallback(async interactivo=>{
  const vinc=vincRef.current,tipos=TIPOS.filter(t=>vinc[t.id]).map(t=>t.id);
  if(corriendo.current||!tipos.length)return;corriendo.current=true;
  if(interactivo){setBusy(true);setMsg('Leyendo los Excel vinculados...')}
  const permiso={};
  for(const tipo of tipos){try{let p=await vinc[tipo].queryPermission({mode:'read'});if(p!=='granted'&&interactivo)p=await vinc[tipo].requestPermission({mode:'read'});permiso[tipo]=p}catch{permiso[tipo]='denied'}}
  const sinPermiso=tipos.filter(t=>permiso[t]!=='granted');
  if(!interactivo&&sinPermiso.length)setMsg('Para que se actualice solo, tocá “Actualizar ahora” una vez y elegí “Permitir” (si aparece, “Permitir en cada visita”).');
  const firmas=LS.get('firmas',{});let publicados=0,invalidado=false;
  for(const tipo of tipos){
   const label=POR_ID[tipo].label;
   if(permiso[tipo]!=='granted'){if(interactivo){ponerEstado(tipo,{error:'El navegador no dio permiso para leer. Tocá Actualizar de nuevo y elegí “Permitir”.',t:Date.now()});anotar([{tipo:label,nivel:'error',texto:'Sin permiso del navegador para leer.'}])}continue}
   let trabajos;
   try{trabajos=await trabajosDe(tipo,vinc[tipo],firmas[tipo]||{},interactivo)}
   catch(e){const err=e?.name==='NotFoundError'?'No se encontró. Si OneDrive lo movió o renombró, vinculalo de nuevo.':e.message;if(estado[tipo]?.error!==err||interactivo)anotar([{tipo:label,nivel:'error',texto:err}]);ponerEstado(tipo,{error:err,t:Date.now()});continue}
   for(const t of trabajos){
    try{
     if(!invalidado){invalidarDatosAnalisis();invalidado=true}
     const{review,msg:ok}=await leerYPublicar(tipo,t,profile.id),av=avisosDe(tipo,review);
     publicados++;
     ponerEstado(tipo,{ok,avisos:av,archivo:t.nombre,periodo:textoPeriodo(t.periodo),modificado:Math.max(...t.files.map(f=>f.lastModified)),t:Date.now(),resumen:review});
     anotar([...av.map(x=>({tipo:label,archivo:t.nombre,nivel:'aviso',texto:x})),{tipo:label,archivo:t.nombre,nivel:'ok',texto:ok}]);
     firmas[tipo]={...(firmas[tipo]||{}),...t.firmas};LS.set('firmas',firmas);
    }catch(e){const err=`No se publicó: ${e.message}`;ponerEstado(tipo,{error:err,archivo:t.nombre,t:Date.now()});anotar([{tipo:label,archivo:t.nombre,nivel:'error',texto:err}]);
     firmas[tipo]={...(firmas[tipo]||{}),...t.firmas};LS.set('firmas',firmas)} // no reintenta el mismo archivo roto cada 5 minutos
   }
  }
  corriendo.current=false;
  if(interactivo){setBusy(false);setMsg(publicados?`Listo: ${publicados} publicado(s). Mirá el Registro por si hay algo raro.`:'Revisado. Nada para publicar o hubo errores (mirá cada tarjeta).')}
  else if(publicados)setMsg(`Actualizado solo a las ${new Date().toLocaleTimeString('es-AR',{timeStyle:'short'})}: ${publicados} publicado(s).`);
 },[profile.id,anotar,estado]);

 // Automático: al abrir, al volver a la pestaña y cada 5 minutos.
 const correrRef=useRef(correr);correrRef.current=correr;
 useEffect(()=>{
  if(!disponible||!vinculos)return;
  const auto=()=>{if(!document.hidden)correrRef.current(false)};
  auto();const iv=setInterval(auto,CADA);document.addEventListener('visibilitychange',auto);
  return()=>{clearInterval(iv);document.removeEventListener('visibilitychange',auto)};
 },[vinculos]);

 async function vincular(tipo){
  const def=POR_ID[tipo];
  try{
   let h;
   if(def.modo==='archivo'||(tipo==='gatera'&&!window.confirm('¿Vas a vincular la CARPETA de Gatera?\n\nAceptar = carpeta (toma el mes más nuevo)\nCancelar = un archivo'))){
    [h]=await window.showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx','.xlsm'],'application/vnd.ms-excel':['.xls']}}],multiple:false});
   }else{
    if(typeof window.showDirectoryPicker!=='function')return setMsg('Este navegador no deja vincular carpetas. Usá Chrome o Edge en la compu.');
    h=await window.showDirectoryPicker({mode:'read'});
   }
   await guardarVinculo(tipo,h);vincRef.current={...vincRef.current,[tipo]:h};setVinculos(vincRef.current);
   const firmas=LS.get('firmas',{});delete firmas[tipo];LS.set('firmas',firmas);ponerEstado(tipo,undefined);
   setMsg('Vinculado. Tocá “Actualizar ahora” para leerlo y publicarlo.');
  }catch(e){if(e?.name!=='AbortError')setMsg('No se pudo vincular.')}
 }
 async function quitar(tipo){await guardarVinculo(tipo,null);const{[tipo]:_,...v}=vincRef.current;vincRef.current=v;setVinculos(v);const firmas=LS.get('firmas',{});delete firmas[tipo];LS.set('firmas',firmas);ponerEstado(tipo,undefined)}
 function limpiarRegistro(){if(window.confirm('¿Borrar el registro?')){setRegistro([]);LS.set('registro',[])}}

 if(!disponible)return <section className="panel vinculos"><h2>🔗 Excel vinculados de OneDrive</h2><p className="note">Para vincular los Excel y que se actualicen solos, abrí la app en Chrome o Edge desde la compu. En este navegador seguí usando la carga manual de abajo.</p></section>;
 const v=vinculos||{},avisosReg=registro.filter(x=>x.nivel!=='ok'),mostrar=(verTodo?registro:avisosReg).slice(0,60);
 return <section className="panel vinculos">
  <div className="vinculos-head"><div><h2>🔗 Excel vinculados de OneDrive</h2><p>Vinculá cada Excel o carpeta una vez. Mientras esta pantalla esté abierta en la compu, cada 5 minutos se fija si algo cambió y lo <b>publica solo</b>. Lo raro queda en el <b>Registro</b> de abajo.</p></div></div>
  <div className="vinculos-lista">{TIPOS.map(({id,label,ayuda,modo})=>{const h=v[id],e=estado[id];return <article key={id} className={'vinculo'+(h?' on':'')}>
   <div className="vinculo-top"><b>{label}</b>{h?<span className="vinculo-archivo">{h.kind==='directory'?'📁 ':''}{h.name}</span>:<small>{ayuda}</small>}
    <span className="vinculo-acciones">{h?<><button onClick={()=>vincular(id)} disabled={busy}><Link2/>Cambiar</button><button onClick={()=>quitar(id)} disabled={busy} title="Desvincular"><Unlink/></button></>:<button onClick={()=>vincular(id)} disabled={busy}><Link2/>Vincular</button>}</span></div>
   {h&&h.kind==='file'&&modo==='mes'&&<p className="note">Está vinculado un archivo. Si tocás Cambiar y elegís la carpeta, toma solo el mes nuevo cada mes.</p>}
   {e?.archivo&&<p className="note">{e.archivo}{e.periodo&&<> · <b>{e.periodo}</b></>}{e.modificado&&<> · guardado {fechaHora(e.modificado)}</>}</p>}
   {e?.resumen&&!e.error&&<div className="vinculo-review"><Resumen tipo={id} r={e.resumen}/></div>}
   {e?.error&&<p className="vinculo-error"><AlertTriangle/>{e.error}</p>}
   {e?.avisos?.length>0&&!e.error&&<p className="vinculo-error" style={{color:'#b45309'}}><AlertTriangle/>{e.avisos.length} aviso(s) · mirá el Registro</p>}
   {e?.ok&&!e.error&&<p className="vinculo-ok"><CheckCircle2/>{e.ok} <small>({fechaHora(e.t)})</small></p>}
  </article>})}</div>
  <div className="vinculos-botones"><button className="primary" onClick={()=>correr(true)} disabled={busy||!Object.keys(v).length}><RefreshCw/>{busy?'Procesando...':'Actualizar ahora'}</button></div>
  {msg&&<div className="notice"><AlertTriangle/>{msg}</div>}
  <div className="vinculos-registro">
   <div className="vinculo-top"><h3 style={{margin:0}}>📋 Registro {avisosReg.length>0&&<small>({avisosReg.length} avisos/errores)</small>}</h3>
    <span className="vinculo-acciones"><button onClick={()=>setVerTodo(!verTodo)}>{verTodo?'Solo avisos':'Ver todo'}</button>{registro.length>0&&<button onClick={limpiarRegistro} title="Borrar registro"><Trash2/></button>}</span></div>
   {!mostrar.length?<p className="note">{verTodo?'Todavía no hay nada.':'Sin avisos. Todo lo publicado coincidió con el personal cargado.'}</p>:
    <ul className="registro-lista">{mostrar.map((x,i)=><li key={x.t+'-'+i} className={'reg-'+x.nivel}><small>{fechaHora(x.t)}</small> <b>{x.tipo}</b>{x.archivo&&<small> · {x.archivo}</small>}<br/>{x.nivel==='error'?'❌ ':x.nivel==='aviso'?'⚠️ ':'✅ '}{x.texto}</li>)}</ul>}
  </div>
  <p className="note">Picking, Voice y Gatera toman el mes del nombre del archivo (número adelante o el mes escrito). Autoelevador: cada Excel publica solo sus turnos, así Mañana-Tarde y Noche no se pisan. El navegador puede pedir permiso una vez por sesión: tocá “Actualizar ahora” y elegí “Permitir”.</p>
 </section>;
}
