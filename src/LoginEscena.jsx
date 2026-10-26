import React,{useEffect,useRef,useState}from'react';
import{supabase}from'./supabase';
import escudo from'./escudo.png';
import'./login-escena.css';

const MIN_CARGA=1100,SALIDA=1500,FINAL=900;

export default function LoginEscena({onStart,onDone}){
  const[modo,setModo]=useState('personal');
  const[fase,setFase]=useState('legajo');
  const[legajo,setLegajo]=useState('');
  const[correo,setCorreo]=useState('');
  const[pass,setPass]=useState('');
  const[err,setErr]=useState('');
  const timers=useRef([]);
  const passRef=useRef(null);
  const later=(fn,ms)=>{timers.current.push(setTimeout(fn,ms))};
  useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
  useEffect(()=>{if(fase==='pass')setTimeout(()=>passRef.current?.focus(),350)},[fase]);

  const admin=modo==='admin';
  const pl=Math.min(pass.length,6);

  function onLegajo(e){
    const n=e.target.value.replace(/\D/g,'').slice(0,8);
    setLegajo(n);setErr('');
    if(n.length===8)later(()=>setFase(f=>f==='legajo'?'pass':f),700);
  }
  function continuar(){if(legajo.length>=3)setFase('pass')}
  function cambiarLegajo(){setFase('legajo');setPass('');setErr('')}
  function cambiarModo(m){setModo(m);setErr('');setPass('');setLegajo('');setCorreo('');setFase(m==='admin'?'pass':'legajo')}

  async function ingresar(){
    if(!pass||fase!=='pass')return;
    if(admin&&!correo.trim()){setErr('Ingresá el correo del administrador.');return}
    setErr('');onStart?.();setFase('load');
    const email=admin?correo.trim():`${legajo.trim()}@personal.local`;
    const inicio=Date.now();
    const{error}=await supabase.auth.signInWithPassword({email,password:pass});
    const espera=Math.max(0,MIN_CARGA-(Date.now()-inicio));
    later(()=>{
      if(error){setFase('pass');setErr('Usuario o contraseña incorrectos.');onDone?.();return}
      setFase('go');
      later(()=>setFase('ok'),SALIDA);
      later(()=>onDone?.(),SALIDA+FINAL);
    },espera);
  }

  const llenos=admin?8:legajo.length;
  const cajon=i=>{const lleno=i<llenos;return(
    <div key={i} className="lx-slot" style={{borderColor:i===llenos&&fase==='legajo'?'#FFC000':'#2A2A2A'}}>
      <div className="lx-cajon" style={{opacity:lleno?1:0,transform:lleno?'translateY(0)':'translateY(-40px)'}}>{admin?'':legajo[i]||''}</div>
    </div>)};

  let camionX=260;
  if(fase==='pass')camionX=Math.round(260*(1-pl/6));
  if(fase==='load')camionX=0;
  if(fase==='go'||fase==='ok')camionX=420;
  const enPersonal=fase==='legajo';
  const despachado=fase==='go'||fase==='ok';
  const pretty=legajo.length>4?legajo.slice(0,4)+' '+legajo.slice(4):legajo;

  const caption={
    legajo:`Armando pedido · ${legajo.length}/8 cajones`,
    pass:pl>=6?'Camión en dársena':'Camión retrocediendo a la dársena…',
    load:'Autoelevador cargando…',go:'Camión saliendo',ok:'¡Despachado!'
  }[fase];
  const etapa={legajo:0,pass:1,load:2,go:3,ok:3}[fase];
  const etapas=['Armando pedido','Camión en dársena','Carga y salida'];

  return <div className="lx">
    <div className="lx-col">
      <span className="lx-marca">CD MERCADO CENTRAL</span>

      <div className="lx-scene-out">
        <div className="lx-scene" role="img" aria-label={caption}>
          <div className="lx-piso"/><div className="lx-linea"/>
          <div className="lx-rack" aria-hidden="true">
            {[0,1,2].map(r=><div key={r} className="lx-estante"><div style={{background:r%2?'#FFC000':'#B88A00'}}/><div style={{background:r%2?'#B88A00':'#FFC000'}}/></div>)}
          </div>

          <div className="lx-camion" aria-hidden="true" style={{transform:`translateX(${camionX}px)`,transitionDuration:despachado?'1400ms':'700ms'}}>
            <div className={enPersonal?'':'lx-rumble'} style={{position:'relative',width:170,height:124}}>
              <div className="lx-caja"><div className="lx-caja-puerta"/><div className="lx-caja-franja"/><img src={escudo} alt="" className="lx-escudo"/></div>
              <svg width="170" height="124" viewBox="0 0 170 124" style={{position:'absolute',left:0,top:0}}>
                <path d="M124 46 h24 l14 20 v34 h-38 z" fill="#FFC000"/>
                <path d="M130 52 h16 l9 13 h-25 z" fill="#0B0B0B" opacity=".75"/>
                <rect x="120" y="94" width="44" height="8" fill="#2A2A2A"/>
                {[28,96,146].map(x=><circle key={x} cx={x} cy="108" r="11" fill="#0B0B0B" stroke="#555" strokeWidth="3"/>)}
              </svg>
            </div>
          </div>

          <div className="lx-carrier" aria-hidden="true" style={{transform:fase==='load'?'translateX(112px)':'translateX(0)'}}>
            <div className="lx-pallet" style={{opacity:despachado?0:1}}>
              <div className="lx-fila">{[4,5,6,7].map(cajon)}</div>
              <div className="lx-fila">{[0,1,2,3].map(cajon)}</div>
              <div className="lx-tabla"/>
              <div className="lx-tacos"><div/><div/><div/></div>
            </div>
            <div className="lx-auto" style={{opacity:enPersonal?0:1,transform:enPersonal?'translateX(-150px)':'translateX(0)'}}>
              <svg width="84" height="92" viewBox="0 0 84 92">
                <circle className="lx-baliza" cx="30" cy="6" r="4" fill="#FF8A00"/>
                <path d="M14 12 h32 v4 h-32 z" fill="#3A3A3A"/>
                <path d="M16 16 v28 M44 16 v28" stroke="#3A3A3A" strokeWidth="3"/>
                <path d="M6 44 h50 l6 10 v24 h-56 z" fill="#FFC000"/>
                <rect x="22" y="30" width="10" height="16" rx="3" fill="#E8C8A0"/>
                <circle cx="27" cy="25" r="6" fill="#E8C8A0"/>
                <path d="M20 24 a7 7 0 0 1 14 0 z" fill="#FFC000"/>
                <rect x="62" y="8" width="5" height="76" fill="#2E2E2E"/>
                <rect x="67" y="82" width="17" height="4" fill="#9A9A9A"/>
                <circle cx="18" cy="80" r="9" fill="#0B0B0B" stroke="#555" strokeWidth="3"/>
                <circle cx="50" cy="82" r="7" fill="#0B0B0B" stroke="#555" strokeWidth="3"/>
              </svg>
            </div>
          </div>

          <div className="lx-operario" aria-hidden="true" style={{opacity:enPersonal?1:0,transform:enPersonal?'translateX(0)':'translateX(-70px)'}}>
            <div key={legajo.length} className={legajo.length?'lx-lift':''}>
              <svg width="36" height="74" viewBox="0 0 36 74">
                <circle cx="18" cy="12" r="7" fill="#E8C8A0"/>
                <path d="M10 11 a8 8 0 0 1 16 0 h2 v2 h-20 v-2 z" fill="#FFC000"/>
                <path d="M9 22 h18 l3 26 h-24 z" fill="#FF8A00"/>
                <path d="M14 22 v26 M22 22 v26" stroke="#E0E0E0" strokeWidth="2"/>
                <path d="M27 26 l8 10" stroke="#E8C8A0" strokeWidth="4" strokeLinecap="round"/>
                <path d="M9 26 l-5 12" stroke="#E8C8A0" strokeWidth="4" strokeLinecap="round"/>
                <path d="M12 48 v24 M24 48 v24" stroke="#2F3B52" strokeWidth="6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          <span className="lx-caption" style={{color:fase==='ok'?'#FFC000':'#D4D4D4'}}>{caption}</span>
        </div>
      </div>

      <div className="lx-etapas" aria-hidden="true">
        {etapas.map((t,i)=><div key={t}><div className="lx-barra" style={{background:i<etapa?'#FFC000':i===etapa?'#7A5C00':'#262626'}}/><span style={{color:i<=etapa?'#F5F5F5':'#8A8A8A'}}>{t}</span></div>)}
      </div>

      {fase==='legajo'&&<div className="lx-form">
        <div className="lx-lab"><label htmlFor="lx-legajo">Legajo</label><span>{legajo.length} / 8</span></div>
        <input id="lx-legajo" className="lx-input lx-input-leg" inputMode="numeric" autoComplete="username" maxLength={8} placeholder="8 números" value={legajo} onChange={onLegajo} onKeyDown={e=>e.key==='Enter'&&continuar()} autoFocus/>
        <span className="lx-ayuda">Cada número que escribís carga un cajón en el pallet.</span>
      </div>}

      {fase==='pass'&&<div className="lx-form lx-rise">
        {admin?<>
          <label htmlFor="lx-correo" className="lx-lab-solo">Correo del administrador</label>
          <input id="lx-correo" className="lx-input" type="email" autoComplete="username" value={correo} onChange={e=>setCorreo(e.target.value)}/>
        </>:null}
        <div className="lx-lab"><label htmlFor="lx-pass">Contraseña</label>{!admin&&<span>Legajo {pretty}</span>}</div>
        <input id="lx-pass" ref={passRef} className="lx-input" type="password" autoComplete="current-password" placeholder="••••••" value={pass} onChange={e=>{setPass(e.target.value);setErr('')}} onKeyDown={e=>e.key==='Enter'&&ingresar()}/>
        {err&&<div className="lx-error">{err}</div>}
        <button type="button" className="lx-btn" onClick={ingresar} disabled={!pass}>
          CARGAR E INGRESAR
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
        {!admin&&<button type="button" className="lx-link" onClick={cambiarLegajo}>← Cambiar legajo</button>}
      </div>}

      {(fase==='load'||fase==='go'||fase==='ok')&&<div className="lx-estado lx-rise">
        <strong>{fase==='ok'?'¡Adentro! Bienvenido':fase==='go'?'Despachando…':'Cargando el camión…'}</strong>
        {!admin&&<span>Legajo {pretty}</span>}
      </div>}

      <div className="lx-pie">
        {fase!=='load'&&fase!=='go'&&fase!=='ok'&&<button type="button" className="lx-link" onClick={()=>cambiarModo(admin?'personal':'admin')}>{admin?'Ingreso del personal':'Ingreso administrador'}</button>}
        <span>¿Olvidaste tu contraseña? Pedila a tu supervisor.</span>
      </div>
    </div>
  </div>;
}
