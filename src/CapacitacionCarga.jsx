import React,{useState}from'react';
import{Upload,AlertTriangle,CheckCircle2}from'lucide-react';
import{revisarCapacitacion,publicarCapacitacion}from'./capacitacion';

// Carga de capacitación (administrador): carpeta Skap + Matriz por Tareas.xlsx.
export default function CapacitacionCarga(){
 const[files,setFiles]=useState(null),[fecha,setFecha]=useState(''),[review,setReview]=useState(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const elegir=e=>{setFiles(e.target.files);setReview(null);setMsg('')};
 async function revisar(){if(!files?.length)return setMsg('Elegí la carpeta Skap y/o el archivo Matriz por Tareas.');setBusy(true);setMsg('Leyendo archivos...');setReview(null);
  try{const r=await revisarCapacitacion(files);setReview(r);setMsg(r.usados.skap||r.usados.plan||r.usados.matriz?'Revisá la vista previa antes de publicar.':'No encontré las hojas Consolidado, BASE_PLAN_ACCION ni Hechos_Capacitacion en lo que elegiste.')}
  catch(e){setMsg(`No se pudo revisar: ${e.message}`)}finally{setBusy(false)}}
 async function publicar(){setBusy(true);setMsg('Publicando y reemplazando la versión anterior...');
  try{const m=await publicarCapacitacion(review,{fechaObjetivo:fecha||null,archivo:Array.from(files).map(f=>f.name).slice(0,3).join(', ')});setReview(null);setFiles(null);setMsg(m)}
  catch(e){setMsg(`No se publicó. Detalle: ${e.message}`)}finally{setBusy(false)}}
 const sv=review?.sinVincular;const nSin=sv?new Set([...sv.skap,...sv.plan,...sv.matriz]).size:0;
 return <div className="cap-carga">
  <p className="detail-sub">Subí la carpeta <b>Skap</b> (los 6 archivos de Autoelevadores y Picking) y el archivo <b>Matriz por Tareas.xlsx</b>. Podés subir todo junto o solo lo que cambió: cada parte reemplaza solo lo suyo.</p>
  <div className="cap-upload-row"><label className="upload"><Upload/>Elegir carpeta Skap<input type="file" webkitdirectory="" directory="" multiple onChange={elegir}/></label><label className="upload"><Upload/>Elegir archivos sueltos<input type="file" accept=".xlsx,.xlsm" multiple onChange={elegir}/></label></div>
  {files?.length>0&&<p><b>{files.length} archivo{files.length===1?'':'s'} elegido{files.length===1?'':'s'}</b></p>}
  <label>Fecha objetivo para los entrenamientos pendientes (opcional)</label><input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
  <button className="primary" onClick={revisar} disabled={busy}>{busy&&!review?'Procesando...':'Revisar archivos'}</button>
  {review&&<div className="notice"><div><b>Vista previa de capacitación</b>
   <p>{review.usados.skap?<><CheckCircle2 size={14}/> SKAP: {review.skap.length} personas ({review.usados.skap} archivos)</>:'SKAP: sin cambios'}</p>
   <p>{review.usados.plan?<><CheckCircle2 size={14}/> Plan de acción: {review.plan.filter(x=>x.estado==='NOK').length} pendientes y {review.plan.filter(x=>x.estado==='OK').length} aprobados</>:'Plan de acción: sin cambios'}</p>
   <p>{review.usados.matriz?<><CheckCircle2 size={14}/> Tareas: {new Set(review.tareas.map(x=>x.empleado_id)).size} personas</>:'Tareas (matriz): sin cambios'}</p>
   <p>Personas no reconocidas: {nSin}</p>
   {nSin>0&&<p className="note">No están en Accesos y claves o el nombre no coincide: {[...new Set([...sv.skap,...sv.plan,...sv.matriz])].slice(0,15).join(', ')}{nSin>15?` y ${nSin-15} más`:''}. Podés agregarles una variante de nombre y volver a revisar.</p>}
   {review.avisos.map(a=><p className="note" key={a}>{a}</p>)}
   <button className="primary" onClick={publicar} disabled={busy||!(review.usados.skap||review.usados.plan||review.usados.matriz)}>Reemplazar y publicar</button></div></div>}
  {msg&&<div className="notice"><AlertTriangle/>{msg}</div>}
 </div>;
}
