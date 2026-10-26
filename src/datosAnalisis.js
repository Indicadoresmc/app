import { supabase } from './supabase';

// Trae las mismas filas que antes (todas, ordenadas por id), pero pidiendo
// varias páginas a la vez en lugar de una por una.
const PAGINA = 1000, SIMULTANEAS = 6;

async function cargarCompleto(tabla){
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true });
  if(error) throw error;
  const paginas = Math.ceil((count || 0) / PAGINA);
  let todas = [];
  for(let i = 0; i < paginas; i += SIMULTANEAS){
    const tandas = await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, paginas - i) }, (_, j) => {
      const desde = (i + j) * PAGINA;
      return supabase.from(tabla).select('*').order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
    }));
    for(const { data, error } of tandas){ if(error) throw error; todas = todas.concat(data || []); }
  }
  // Si entraron filas nuevas mientras se contaba, se siguen leyendo hasta el final.
  let desde = paginas * PAGINA;
  while(true){
    const { data, error } = await supabase.from(tabla).select('*').order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
    if(error) throw error;
    const filas = data || []; todas = todas.concat(filas);
    if(filas.length < PAGINA) break; desde += PAGINA;
  }
  return todas;
}

// Se guarda en memoria mientras la página esté abierta: volver a Análisis no
// descarga todo de nuevo. Al publicar una carga mensual se descarta.
let cache = null;

export function cargarDatosAnalisis({ forzar = false } = {}){
  if(forzar || !cache){
    cache = Promise.all(['picking', 'errores_gatera', 'errores_voice', 'empleados'].map(cargarCompleto));
    cache.catch(() => { cache = null; });
  }
  return cache;
}

export function invalidarDatosAnalisis(){ cache = null; }
