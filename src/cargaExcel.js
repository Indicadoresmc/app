import{supabase}from'./supabase';
// Lectura y publicación de los Excel de carga mensual. La usan el formulario
// manual y los Excel vinculados de OneDrive, así ambos leen exactamente igual.
let XLSX;
export const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,' ').trim().toUpperCase();
function excelFecha(v){if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null}const t=String(v||'').trim(),m=t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);if(m)return `${m[3].length===2?'20'+m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return null}
function segundos(v){if(v==null||v==='')return null;if(typeof v==='number')return Math.round(v<2?v*86400:v);const m=String(v).match(/^(\d+):(\d+)(?::(\d+))?/);return m?(+m[1]*3600)+(+m[2]*60)+ +(m[3]||0):null}
function hora(v){if(v==null||v==='')return null;if(typeof v==='number')return XLSX.SSF.format('hh:mm:ss',v);return String(v).slice(0,8)}
async function insertarLotes(tabla,filas){for(let i=0;i<filas.length;i+=250){const{error}=await supabase.from(tabla).insert(filas.slice(i,i+250));if(error)throw error}}
// Reemplaza los datos de un módulo para un mes/año: busca o crea el período, registra la importación,
// borra lo publicado antes en esas tablas, inserta las filas nuevas y marca todo como publicado.
async function publicarPeriodo({anio,mes,tipo,archivo,hoja,conteos,tablas,perfilId}){
 let{data:period,error}=await supabase.from('periodos').select('*').eq('anio',anio).eq('mes',mes).maybeSingle();if(error)throw error;
 if(!period){const r=await supabase.from('periodos').insert({anio,mes,publicado:false}).select().single();if(r.error)throw r.error;period=r.data}
 const ir=await supabase.from('importaciones').insert({periodo_id:period.id,tipo_archivo:tipo,nombre_archivo:archivo,hoja_origen:hoja,...conteos,estado:'procesando',cargado_por:perfilId}).select().single();if(ir.error)throw ir.error;
 for(const[tabla]of tablas){const del=await supabase.from(tabla).delete().eq('periodo_id',period.id);if(del.error)throw del.error}
 for(const[tabla,filas]of tablas)if(filas.length)await insertarLotes(tabla,filas.map(x=>({...x,periodo_id:period.id,importacion_id:ir.data.id})));
 const imp=await supabase.from('importaciones').update({estado:'publicado',publicado_en:new Date().toISOString()}).eq('id',ir.data.id);if(imp.error)throw imp.error;
 const up=await supabase.from('periodos').update({publicado:true,publicado_en:new Date().toISOString(),publicado_por:perfilId}).eq('id',period.id);if(up.error)throw up.error;
}
// Lee el Excel y devuelve la vista previa (no escribe nada en la base).
export async function revisarExcel(tipo,file,year,month){
   if(!['picking','manual','gatera','voice'].includes(tipo))throw new Error('La publicación real está habilitada para los cuatro módulos.');
   XLSX??=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellStyles:false,cellNF:false,cellHTML:false});
   if(tipo==='manual'){
    const ws=wb.Sheets['Carga Datos'];if(!ws)throw new Error('No se encontró la hoja Carga Datos.');
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    const hi=matrix.findIndex(r=>r.some(c=>normal(c)==='DIA')&&r.some(c=>normal(c)==='MES')&&r.some(c=>normal(c)==='LEGAJO')&&r.some(c=>normal(c)==='OBJETIVO'));
    if(hi<0)throw new Error('No se encontró la fila de encabezados.');
    const h=matrix[hi].map(normal),ix=n=>h.indexOf(normal(n)),valid=[];let discarded=0,duplicates=0;const seen=new Set();
    const{data:emps,error}=await supabase.from('empleados').select('id,legajo,apellido_nombre,nombre_normalizado');if(error)throw error;const byLeg=new Map((emps||[]).map(e=>[String(e.legajo),e]));const byManualName=new Map((emps||[]).map(e=>[normal(e.nombre_normalizado||e.apellido_nombre),e]));
    for(const r of matrix.slice(hi+1)){
     const dia=Number(r[ix('Día')]),mes=Number(r[ix('Mes')]),legOriginal=String(r[ix('Legajo')]??'').replace(/\.0$/,''),nombreManual=String(r[ix('Operarios')]??'').trim(),obj=Number(r[ix('Objetivo')]||0),real=Number(r[ix('Real')]||0);
     if(!dia||mes<1||mes>12||obj<=0){discarded++;continue}
     const legCompleto=legOriginal&&legOriginal.length<=4?`2900${legOriginal.padStart(4,'0')}`:legOriginal;
     const emp=byLeg.get(legOriginal)||byLeg.get(legCompleto)||byManualName.get(normal(nombreManual));if(!emp){discarded++;continue}
     const leg=String(emp.legajo)
     const fecha=`${year}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,key=`${emp.id}|${fecha}|${obj}|${real}`;
     if(seen.has(key)){duplicates++;continue}seen.add(key);
     valid.push({empleado_id:emp.id,fecha,turno:String(r[ix('Turno')]||''),objetivo:obj,real,diferencia:real-obj,cumplimiento:real/obj,mes,datos_originales:{legajo:leg}})
    }
    const porMes={};valid.forEach(x=>porMes[x.mes]=(porMes[x.mes]||0)+1);
    return {tipo:'manual',valid,unknown:[],discarded,duplicates,read:matrix.length-hi-1,porMes};
   }
   if(tipo==='voice'){
    const ws=wb.Sheets['ArchiveWorkUnit'];if(!ws)throw new Error('No se encontró la hoja ArchiveWorkUnit.');
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});const h=matrix[0].map(normal),ix=n=>h.indexOf(normal(n));
    const{data:emps,error}=await supabase.from('empleados').select('id,apellido_nombre,nombre_normalizado');if(error)throw error;
    const{data:variantes,error:ev}=await supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa');if(ev)throw ev;
    const byName=new Map((emps||[]).map(e=>[normal(e.nombre_normalizado||e.apellido_nombre),e])),byId=new Map((emps||[]).map(e=>[e.id,e]));
    (variantes||[]).filter(v=>v.activa).forEach(v=>{const e=byId.get(v.empleado_id);if(e)byName.set(normal(v.variante_normalizada),e)});
    const valid=[],unknown=new Map(),seen=new Set();let discarded=0,duplicates=0,totalErrores=0;
    for(const r of matrix.slice(1)){
     const fecha=excelFecha(r[ix('Fecha')]),pickero=String(r[ix('Pickero')]||'').trim(),verificador=String(r[ix('Verificador')]||'').trim(),estado=normal(r[ix('Estado verif.')]),cancha=String(r[ix('Cancha')]||'').trim().toUpperCase(),paleta=String(r[ix('Nro.Pal.')]??'').trim(),bultos=Number(r[ix('Bultos')]||0);
     if(!fecha||!['COMPLETADO','CORREGIDO'].includes(estado)||!pickero||!paleta||bultos<=0||!/^C[1-6]$/.test(cancha)){discarded++;continue}
     const[y,m]=fecha.split('-').map(Number);if(y!==year||m!==month){discarded++;continue}
     const emp=byName.get(normal(pickero));if(!emp){unknown.set(normal(pickero),pickero);continue}
     const total=Number(r[ix('Tot. Errores')]||r[ix('Cant.Err.')]||0),motivo=String(r[ix('Motivos ll')]||r[ix('Motivos I')]||r[ix('Motivos')]||(total>0?'Error sin motivo':'Sin novedad')).trim(),nm=normal(motivo),falt=nm.includes('FALT')?total:0,sob=nm.includes('SOBR')?total:0,cambio=(nm.includes('SABOR')||nm.includes('CAMBIO'))?total:0;
     const key=[emp.id,fecha,String(r[ix('Ola')]??''),String(r[ix('Reparto')]??''),paleta,cancha,String(r[ix('Inicio verif.')]??''),String(r[ix('Fin')]??'')].join('|');
     if(seen.has(key)){duplicates++;continue}seen.add(key);totalErrores+=total;
     valid.push({empleado_id:emp.id,fecha,turno:String(r[ix('Turno')]||''),cancha,numero_paleta:paleta,bultos,motivo,total_errores:total,faltantes:falt,sobrantes:sob,cambio_sabor:cambio,datos_originales:{pickero,verificador,estado_verificacion:String(r[ix('Estado verif.')]||''),ola:r[ix('Ola')],reparto:r[ix('Reparto')],inicio_verificacion:r[ix('Inicio verif.')],fin_verificacion:r[ix('Fin')]}})
    }
    return {tipo:'voice',valid,unknown:[...unknown.values()],discarded,duplicates,read:matrix.length-1,sheet:'ArchiveWorkUnit',totalErrores};
   }
   if(tipo==='gatera'){
    const aliases=[['ENERO','ENE'],['FEBRERO','FEB'],['MARZO','MAR'],['ABRIL','ABR'],['MAYO','MAY'],['JUNIO','JUN'],['JULIO','JUL'],['AGOSTO','AGO'],['SEPTIEMBRE','SEPT','SEP'],['OCTUBRE','OCT'],['NOVIEMBRE','NOV'],['DICIEMBRE','DIC']][month-1]||[];
    const sheet=wb.SheetNames.find(n=>aliases.includes(normal(n)));if(!sheet)throw new Error(`No se encontró la hoja del mes. Hojas: ${wb.SheetNames.join(', ')}`);const ws=wb.Sheets[sheet];
    const rowsMap=new Map();for(const addr of Object.keys(ws)){if(addr[0]==='!')continue;const pos=XLSX.utils.decode_cell(addr);if(pos.r<10||pos.c<2||pos.c>19)continue;if(!rowsMap.has(pos.r))rowsMap.set(pos.r,{});rowsMap.get(pos.r)[pos.c]=ws[addr].v}
    const{data:emps,error}=await supabase.from('empleados').select('id,apellido_nombre,nombre_normalizado');if(error)throw error;const{data:variantes,error:ev}=await supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa');if(ev)throw ev;const byName=new Map((emps||[]).map(e=>[normal(e.nombre_normalizado||e.apellido_nombre),e])),byId=new Map((emps||[]).map(e=>[e.id,e]));(variantes||[]).filter(v=>v.activa).forEach(v=>{const e=byId.get(v.empleado_id);if(e)byName.set(normal(v.variante_normalizada),e)});
    const valid=[],special=[],unknown=new Map(),seen=new Set();let discarded=0,duplicates=0;
    for(const [rn,r] of rowsMap){const fecha=excelFecha(r[2]),nombre=String(r[19]||'').trim(),motivo=String(r[12]||'').trim(),cancha=String(r[18]||'').trim().toUpperCase(),cantidad=Number(r[14]||0);if(!fecha||!nombre||!motivo||cantidad<=0||!/^C[1-6]$/.test(cancha)){discarded++;continue}const[y,m]=fecha.split('-').map(Number);if(y!==year||m!==month){discarded++;continue}const nombreNormal=normal(nombre);if(['FUERA V','CARGA','MKP','MARKETPLACE','TOTAL'].includes(nombreNormal)){discarded++;continue}const base={fecha,turno:String(r[10]||''),cancha,motivo,cantidad,sku:String(r[13]||''),descripcion:String(r[15]||''),comentario:String(r[11]||''),reparto:String(r[16]||''),paleta:String(r[17]||''),planilla:String(r[3]||''),canal:String(r[4]||''),verificador:String(r[9]||''),datos_originales:{fila:rn+1,pickero:nombre}};if(['F VOICEP','F V','FUERA DE VOICE PICKING','FUERA VOICE PICKING','CARGA','BARRILES','LAYER','0','N A','42'].includes(nombreNormal)){const key=['F/voiceP',fecha,cancha,motivo,base.sku,cantidad,base.reparto,base.paleta].join('|');if(seen.has(key)){duplicates++;continue}seen.add(key);special.push({...base,categoria:'F/voiceP'});continue}const emp=byName.get(nombreNormal);if(!emp){unknown.set(nombreNormal,nombre);continue}const key=[emp.id,fecha,cancha,motivo,base.sku,cantidad,base.reparto,base.paleta].join('|');if(seen.has(key)){duplicates++;continue}seen.add(key);valid.push({...base,empleado_id:emp.id})}
    return {tipo:'gatera',valid,special,unknown:[...unknown.values()],discarded,duplicates,read:rowsMap.size,sheet};
   }
   const ws=wb.Sheets['Bajada General'];if(!ws)throw new Error('No se encontró la hoja Bajada General.');
   const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});const hi=matrix.findIndex(r=>r.some(c=>normal(c)==='FECHA')&&r.some(c=>normal(c)==='OPERADOR')&&r.some(c=>['PACKS','BULTOS'].includes(normal(c))));if(hi<0)throw new Error('No se encontró la fila de encabezados de Picking.');
   const headers=matrix[hi].map(normal),ix=(...names)=>headers.findIndex(h=>names.map(normal).includes(h));const iFecha=ix('Fecha'),iTurno=ix('Turno'),iCancha=ix('Túnel','Cancha'),iOper=ix('Operador'),iPacks=ix('Packs','Bultos'),iPallets=ix('Pallets'),iInicio=ix('Inicio'),iFin=ix('Fin'),iDur=ix('Duración total'),iNeto=ix('~Tiempo neto trabajado','Tiempo neto trabajado'),iSin=ix('Tiempo no piqueando','Tiempo sin picking'),iProd=ix('Bultos/hora II','Packs/hora','Bultos/hora'),iTarget=headers.lastIndexOf('TARGET'),iDes=ix('Desvio','Desvío'),iColor=ix('Num/Color');
   const{data:emps,error}=await supabase.from('empleados').select('id,apellido_nombre,nombre_normalizado,activo');if(error)throw error;const{data:variantes,error:errorVariantes}=await supabase.from('variantes_nombres').select('empleado_id,variante_normalizada,activa');if(errorVariantes)throw errorVariantes;const byName=new Map((emps||[]).map(e=>[normal(e.nombre_normalizado||e.apellido_nombre),e]));const byId=new Map((emps||[]).map(e=>[e.id,e]));(variantes||[]).filter(v=>v.activa).forEach(v=>{const empleado=byId.get(v.empleado_id);if(empleado)byName.set(normal(v.variante_normalizada),empleado)});
   const valid=[],unknown=new Map(),seen=new Set();let discarded=0,duplicates=0;
   for(const r of matrix.slice(hi+1)){const fecha=excelFecha(r[iFecha]),cancha=String(r[iCancha]||'').trim().toUpperCase(),nombre=String(r[iOper]||'').trim(),packs=Number(r[iPacks]||0),pallets=Number(r[iPallets]||0);if(!fecha||!nombre||!/^C[1-6]$/.test(cancha)||packs<=0){discarded++;continue}const[y,m]=fecha.split('-').map(Number);if(y!==year||m!==month){discarded++;continue}const emp=byName.get(normal(nombre));if(!emp){unknown.set(normal(nombre),nombre);continue}const inicio=hora(r[iInicio]),fin=hora(r[iFin]),key=[emp.id,fecha,cancha,inicio,fin,packs,pallets].join('|');if(seen.has(key)){duplicates++;continue}seen.add(key);valid.push({empleado_id:emp.id,fecha,turno:String(r[iTurno]||''),cancha,packs,pallets,inicio,fin,duracion_segundos:segundos(r[iDur]),tiempo_neto_segundos:segundos(r[iNeto]),tiempo_sin_picking_segundos:segundos(r[iSin]),productividad:Number(r[iProd]||0),target:Number(r[iTarget]||0),desvio:Number(r[iDes]||0),num_color:Number(r[iColor]||0),datos_originales:{operador:nombre}})}
   return {valid,unknown:[...unknown.values()],discarded,duplicates,read:matrix.length-hi-1};
}
export const MENSAJE_REVISION={manual:'Vista previa anual terminada. Revisá los meses detectados antes de publicar.',voice:'Vista previa de Errores Voice Picking terminada. Revisá antes de publicar.',gatera:'Vista previa de Errores en gatera terminada. Revisá antes de publicar.',picking:'Vista previa terminada. Revisá los resultados antes de publicar.'};
// Publica una vista previa y devuelve el mensaje de resultado.
export async function publicarRevision(review,{archivo,year,month,perfilId}){
  const mm=String(month).padStart(2,'0'),conteos={registros_encontrados:review.read,registros_aceptados:review.valid.length+(review.special?.length||0),registros_rechazados:review.unknown.length+review.discarded,registros_duplicados:review.duplicates};
  if(review.tipo==='voice'){
   await publicarPeriodo({anio:year,mes:month,tipo:'errores_voice',archivo,hoja:'ArchiveWorkUnit',conteos,tablas:[['errores_voice',review.valid]],perfilId});
   return(`Publicado: ${review.valid.length} verificaciones de Voice Picking de ${mm}/${year}, sin duplicar.`);
  }
  if(review.tipo==='gatera'){
   await publicarPeriodo({anio:year,mes:month,tipo:'errores_gatera',archivo,hoja:review.sheet,conteos,tablas:[['errores_gatera',review.valid],['errores_gatera_especiales',review.special||[]]],perfilId});
   return(`Publicado: ${review.valid.length} errores asignados y ${review.special?.length||0} registros administrativos especiales de ${mm}/${year}, sin duplicar.`);
  }
  if(review.tipo==='manual'){
   const meses=[...new Set(review.valid.map(x=>x.mes))].sort((a,b)=>a-b);let total=0;
   for(const mes of meses){
    const filas=review.valid.filter(x=>x.mes===mes).map(({mes,...x})=>x);
    await publicarPeriodo({anio:year,mes,tipo:'clasificacion_manual',archivo,hoja:'Carga Datos',conteos:{registros_encontrados:filas.length,registros_aceptados:filas.length,registros_rechazados:0,registros_duplicados:0},tablas:[['clasificacion_manual',filas]],perfilId});
    total+=filas.length;
   }
   return(`Publicado: ${total} registros de Clasificación manual en ${meses.length} meses de ${year}, sin duplicar.`);
  }
  await publicarPeriodo({anio:year,mes:month,tipo:'picking',archivo,hoja:'Bajada General',conteos,tablas:[['picking',review.valid]],perfilId});
  return(`Publicado: ${review.valid.length} registros. Picking ${mm}/${year} fue reemplazado sin duplicar.`)
}
