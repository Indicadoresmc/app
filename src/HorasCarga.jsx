import React,{useState}from'react';
import{Upload,AlertTriangle,CheckCircle2}from'lucide-react';
import{revisarHoras,publicarHoras}from'./horas';

// Carga de horas (administrador): "Detalle de Consolidación" de cada turno. Reemplaza solo el período y turno de cada archivo.
const fa=v=>String(v||'').split('-').reverse().join('/');
export default function HorasCarga(){
 const[files,setFiles]=useState(null),[review,setReview]=useState(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const elegir=e=>{setFiles(e.target.files);setReview(null);setMsg('')};
 async function revisar(){if(!files?.length)return setMsg('Elegí uno o más Excel de Detalle de Consolidación.');setBusy(true);setMsg('Leyendo archivos...');setReview(null);
  try{const r=await revisarHoras(files);setReview(r);setMsg(r.valid.length?'Revisá la vista previa antes de publicar.':'No encontré las columnas Empleado, Legajo y Concepto en lo que elegiste.')}
  catch(e){setMsg(`No se pudo revisar: ${e.message}`)}finally{setBusy(false)}}
 async function publicar(){setBusy(true);setMsg('Publicando...');
  try{const m=await publicarHoras(review,{archivo:Array.from(files).map(f=>f.name).slice(0,4).join(', ')});setReview(null);setFiles(null);setMsg(m)}
  catch(e){setMsg(`No se publicó. Detalle: ${e.message}`)}finally{setBusy(false)}}
 return <div className="cap-carga">
  <p className="detail-sub">Subí el <b>Detalle de Consolidación</b> de cada turno (podés elegir varios juntos). Cada archivo reemplaza solo su período y su turno; los meses anteriores quedan guardados.</p>
  <div className="cap-upload-row"><label className="upload"><Upload/>Elegir Excel de horas<input type="file" accept=".xlsx,.xlsm,.xls" multiple onChange={elegir}/></label></div>
  {files?.length>0&&<p><b>{files.length} archivo{files.length===1?'':'s'} elegido{files.length===1?'':'s'}</b></p>}
  <button className="primary" onClick={revisar} disabled={busy}>{busy&&!review?'Procesando...':'Revisar archivos'}</button>
  {review&&<div className="notice"><div><b>Vista previa de horas</b>
   {review.grupos.map(g=><p key={g.hasta+g.turno}><CheckCircle2 size={14}/> Turno {g.turno||'sin turno'}: {g.personas} personas · período {fa(g.desde)} al {fa(g.hasta)}</p>)}
   <p>Personas no reconocidas: {review.sinVincular.length}</p>
   {review.sinVincular.length>0&&<p className="note">No están en Accesos y claves o el legajo no coincide: {review.sinVincular.join(', ')}.</p>}
   {review.avisos.map(a=><p className="note" key={a}>{a}</p>)}
   <button className="primary" onClick={publicar} disabled={busy||!review.valid.length}>Reemplazar y publicar</button></div></div>}
  {msg&&<div className="notice"><AlertTriangle/>{msg}</div>}
 </div>;
}
