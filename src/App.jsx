import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from "recharts";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════ */
const API = "https://optionval-api.onrender.com";

/* ═══════════════════════════════════════════════════
   MATH ENGINE
═══════════════════════════════════════════════════ */
function erf(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+p*x);return s*(1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));}
const N=x=>0.5*(1+erf(x/Math.sqrt(2)));
const nd=x=>Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);

function bs(S,K,T,r,σ,q,type){
  if(T<=0||σ<=0)return{price:Math.max(type==='call'?S-K:K-S,0),delta:type==='call'?1:0,gamma:0,vega:0,theta:0,rho:0,d1:0,d2:0,Nd1:type==='call'?1:0,Nd2:type==='call'?1:0};
  const sq=Math.sqrt(T),d1=(Math.log(S/K)+(r-q+.5*σ*σ)*T)/(σ*sq),d2=d1-σ*sq;
  const eq=Math.exp(-q*T),er=Math.exp(-r*T),n1=nd(d1);
  const price=type==='call'?S*eq*N(d1)-K*er*N(d2):K*er*N(-d2)-S*eq*N(-d1);
  return{price,delta:type==='call'?eq*N(d1):eq*(N(d1)-1),
    gamma:eq*n1/(S*σ*sq),vega:S*eq*n1*sq/100,
    theta:(-(S*eq*n1*σ)/(2*sq)+(type==='call'?q*S*eq*N(d1)-r*K*er*N(d2):-q*S*eq*N(-d1)+r*K*er*N(-d2)))/365,
    rho:type==='call'?K*T*er*N(d2)/100:-K*T*er*N(-d2)/100,
    d1,d2,Nd1:N(d1),Nd2:N(d2)};
}

function binomCRR(S,K,T,r,σ,q,type,steps=150){
  if(T<=0||σ<=0)return{price:Math.max(type==='call'?S-K:K-S,0)};
  const dt=T/steps,u=Math.exp(σ*Math.sqrt(dt)),d=1/u,p=(Math.exp((r-q)*dt)-d)/(u-d),disc=Math.exp(-r*dt);
  let v=Array.from({length:steps+1},(_,i)=>Math.max(type==='call'?S*Math.pow(u,steps-i)*Math.pow(d,i)-K:K-S*Math.pow(u,steps-i)*Math.pow(d,i),0));
  for(let i=steps-1;i>=0;i--)for(let j=0;j<=i;j++){const s=S*Math.pow(u,i-j)*Math.pow(d,j);v[j]=Math.max(disc*(p*v[j]+(1-p)*v[j+1]),Math.max(type==='call'?s-K:K-s,0));}
  return{price:v[0]};
}

function binomConv(S,K,T,r,σ,q,type){
  const bsP=bs(S,K,T,r,σ,q,type).price;
  return[5,10,20,35,50,75,100,150,200].map(n=>({steps:n,price:parseFloat(binomCRR(S,K,T,r,σ,q,type,n).price.toFixed(4)),bs:parseFloat(bsP.toFixed(4))}));
}

let _z2=null,_hz=false;
function boxM(){if(_hz){_hz=false;return _z2;}const u=Math.random()||1e-10,v=Math.random(),m=Math.sqrt(-2*Math.log(u));_z2=m*Math.sin(2*Math.PI*v);_hz=true;return m*Math.cos(2*Math.PI*v);}
function mc(S,K,T,r,σ,q,type,sims=20000){
  if(T<=0||σ<=0)return{price:Math.max(type==='call'?S-K:K-S,0),stderr:0,ci95:[0,0]};
  const mu=(r-q-.5*σ*σ)*T,vol=σ*Math.sqrt(T),disc=Math.exp(-r*T),n=sims/2;
  let sum=0,sum2=0;
  for(let i=0;i<n;i++){const z=boxM(),a=(Math.max(type==='call'?S*Math.exp(mu+vol*z)-K:K-S*Math.exp(mu+vol*z),0)+Math.max(type==='call'?S*Math.exp(mu-vol*z)-K:K-S*Math.exp(mu-vol*z),0))/2;sum+=a;sum2+=a*a;}
  const mean=sum/n*disc,v2=(sum2/n-(sum/n)**2)*disc*disc;
  return{price:mean,stderr:Math.sqrt(v2/n),ci95:[mean-1.96*Math.sqrt(v2/n),mean+1.96*Math.sqrt(v2/n)]};
}

/* ═══════════════════════════════════════════════════
   HOOKS
═══════════════════════════════════════════════════ */
function useFetch(url){
  const[data,setD]=useState(null),[loading,setL]=useState(false),[error,setE]=useState(null);
  const ctrl=useRef(null);
  useEffect(()=>{
    if(!url){setD(null);setL(false);setE(null);return;}
    ctrl.current?.abort();ctrl.current=new AbortController();
    setL(true);setE(null);
    fetch(url,{signal:ctrl.current.signal})
      .then(r=>r.ok?r.json():r.json().then(e=>{throw new Error(e.detail||'API error')}))
      .then(d=>{setD(d);setL(false);}).catch(e=>{if(e.name!=='AbortError'){setE(e.message);setL(false);}});
    return()=>ctrl.current?.abort();
  },[url]);
  return{data,loading,error};
}

function useAnim(target,ms=350){
  const[v,setV]=useState(target);const ref=useRef(target);
  useEffect(()=>{const s=ref.current,t0=performance.now();const f=n=>{const p=Math.min((n-t0)/ms,1),e=1-Math.pow(1-p,4);setV(s+(target-s)*e);if(p<1)requestAnimationFrame(f);else ref.current=target;};requestAnimationFrame(f);},[target]);
  return v;
}

/* ═══════════════════════════════════════════════════
   DESIGN TOKENS — Deep Navy, not black
═══════════════════════════════════════════════════ */
const D = {
  // Deep layered navy — each layer is distinctly lighter
  bg:   '#0a0f1a',   // deepest navy
  s1:   '#0d1424',   // card base
  s2:   '#111b2e',   // elevated card
  s3:   '#162238',   // hover state
  s4:   '#1c2d47',   // active/selected
  // Borders with visible contrast
  b0:   '#1a2d44',
  b1:   '#223852',
  b2:   '#2d4d6e',
  b3:   '#3d6488',
  // Text hierarchy — 4 clear levels
  t0:   '#e8f4ff',   // primary — headings, prices
  t1:   '#b8d4f0',   // secondary — labels
  t2:   '#7aa0c0',   // tertiary — subtitles
  t3:   '#4a6880',   // muted — hints
  t4:   '#2a4560',   // very muted — disabled
  // Brand accents
  cyan:   '#1ab8e8',  // BS model / primary action
  green:  '#00d68f',  // profit / up / binomial
  red:    '#ff4d6d',  // loss / down / put
  amber:  '#f0b429',  // market / warning
  orange: '#ff7b39',  // MC / vol
  purple: '#a78bfa',  // rho
  // Model identity colors
  mBS:    '#1ab8e8',
  mBinom: '#00d68f',
  mMC:    '#ff7b39',
  mMkt:   '#f0b429',
};
const MONO    = '"JetBrains Mono","Fira Code","Consolas",monospace';
const DISPLAY = '"Share Tech Mono","Courier New",monospace';
const TTP = {background:D.s2,border:`1px solid ${D.b2}`,fontFamily:MONO,fontSize:10,color:D.t0,borderRadius:2,padding:'8px 12px'};

/* ═══════════════════════════════════════════════════
   TOOLTIP SYSTEM — hover any annotated element
═══════════════════════════════════════════════════ */
const TOOLTIPS = {
  delta:   'Δ Delta: How much the option price moves per $1 move in the stock. Call Δ ∈ [0,1], Put Δ ∈ [-1,0]. Δ=0.5 means ATM.',
  gamma:   'Γ Gamma: Rate of change of Delta. High Gamma near expiry — small stock moves cause large Delta swings.',
  vega:    'ν Vega: Price change per 1% increase in implied vol. Long options always have positive Vega.',
  theta:   'Θ Theta: Time decay per calendar day. Options lose value as expiry approaches — negative for long positions.',
  rho:     'ρ Rho: Price change per 1% rise in risk-free rate. Calls gain, puts lose when rates rise.',
  nd2:     'N(d₂): Risk-neutral probability the option expires in-the-money. Not the same as the real-world probability.',
  iv:      'Implied Vol: The σ the market is "implying" — back-solved from the market price using BS. Higher IV = more expensive option.',
  alpha:   'α Edge: BS theoretical price minus market mid price. Positive = model says option is cheap vs market.',
  bs:      'Black-Scholes (1973): Closed-form analytical solution. Assumes constant vol, no jumps, European exercise.',
  binom:   'Binomial CRR Tree: Discrete lattice model. Supports American early exercise. Converges to BS as steps → ∞.',
  mcarlo:  'Monte Carlo: Simulates 20,000 GBM price paths with antithetic variance reduction. Best for path-dependent payoffs.',
  surface: 'Vol Surface: Plots implied vol across all strikes (x-axis) and expiries (y-axis). A flat surface = BS is correct. The real surface is a smile/skew.',
};

function Annotated({children,tip,color=D.cyan}){
  const[show,setShow]=useState(false);
  const[pos,setPos]=useState({x:0,y:0});
  return(
    <span style={{position:'relative',display:'inline-flex',alignItems:'center',gap:3}}
      onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setPos({x:r.left,y:r.bottom+6});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      {children}
      <span style={{width:12,height:12,borderRadius:'50%',background:`${color}20`,border:`1px solid ${color}50`,
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        fontFamily:MONO,fontSize:7,color,cursor:'help',flexShrink:0,lineHeight:1}}>?</span>
      {show&&(
        <div style={{position:'fixed',left:Math.min(pos.x,window.innerWidth-280),top:pos.y,
          width:260,padding:'10px 12px',background:D.s1,border:`1px solid ${color}60`,
          boxShadow:`0 8px 32px #0008,0 0 0 1px ${color}20`,
          fontFamily:MONO,fontSize:9,color:D.t1,lineHeight:1.7,zIndex:9999,pointerEvents:'none'}}>
          <div style={{color,fontFamily:MONO,fontSize:8,letterSpacing:1,marginBottom:4}}>{tip.split(':')[0]}</div>
          {tip.split(':').slice(1).join(':')}
        </div>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════════════ */
function Badge({children,color=D.cyan}){
  return <span style={{fontFamily:MONO,fontSize:7,padding:'2px 7px',letterSpacing:1.5,
    background:`${color}15`,color,border:`1px solid ${color}35`,textTransform:'uppercase'}}>{children}</span>;
}
function ContextBar({text,color=D.t3}){
  return(
    <div style={{padding:'6px 16px',background:`${color}08`,borderBottom:`1px solid ${color}18`,
      fontFamily:MONO,fontSize:8,color,letterSpacing:.5,lineHeight:1.6}}>
      {text}
    </div>
  );
}
function Spin({label='LOADING'}){
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:56,flexDirection:'column'}}>
      <div style={{width:32,height:32,border:`2px solid ${D.b2}`,borderTop:`2px solid ${D.cyan}`,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <span style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:3}}>{label}</span>
    </div>
  );
}
function Err({msg}){return <div style={{margin:16,padding:'12px 16px',fontFamily:MONO,fontSize:9,color:D.red,background:`${D.red}0c`,border:`1px solid ${D.red}25`,lineHeight:1.5}}>⚠ {msg}</div>;}

/* ═══════════════════════════════════════════════════
   TOP BAR
═══════════════════════════════════════════════════ */
function TopBar({ticker,onLoad,apiLive,time}){
  const[q,setQ]=useState(ticker),[sugg,setSugg]=useState([]),[open,setOpen]=useState(false);
  useEffect(()=>{if(!q||q.toUpperCase()===ticker){setSugg([]);return;}
    fetch(`${API}/api/search?q=${q}`).then(r=>r.json()).then(d=>setSugg(d.results||[])).catch(()=>{});
  },[q]);
  const go=t=>{const u=t.toUpperCase();onLoad(u);setQ(u);setOpen(false);setSugg([]);};
  return(
    <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'0 24px',background:D.s1,borderBottom:`1px solid ${D.b1}`,
      position:'relative',zIndex:100,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:20}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{position:'relative',width:22,height:22}}>
            <div style={{position:'absolute',inset:0,border:`1.5px solid ${D.cyan}`,transform:'rotate(45deg)',opacity:.6}}/>
            <div style={{position:'absolute',inset:4,background:D.cyan,transform:'rotate(45deg)',opacity:.9}}/>
          </div>
          <div>
            <div style={{fontFamily:DISPLAY,fontSize:12,color:D.t0,letterSpacing:4}}>OPTIONVAL</div>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginTop:-1}}>QUANTITATIVE PRICING ENGINE</div>
          </div>
        </div>
        <div style={{width:1,height:24,background:D.b1}}/>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:apiLive?D.green:D.red,
            boxShadow:apiLive?`0 0 10px ${D.green}90`:'none',animation:apiLive?'glow 2s infinite':'none'}}/>
          <span style={{fontFamily:MONO,fontSize:8,color:apiLive?D.green:D.red,letterSpacing:.5}}>
            {apiLive?'MARKET DATA LIVE':'API OFFLINE — MANUAL PRICER ONLY'}
          </span>
        </div>
      </div>
      <div style={{position:'relative',display:'flex',gap:0,alignItems:'center'}}>
        <span style={{fontFamily:MONO,fontSize:8,color:D.t3,padding:'0 12px 0 0',letterSpacing:2}}>TICKER</span>
        <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}}
          onKeyDown={e=>e.key==='Enter'&&go(q)} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),180)}
          placeholder="AAPL · TSLA · RELIANCE.NS" style={{fontFamily:DISPLAY,fontSize:14,color:D.t0,
            background:D.s2,border:`1px solid ${D.b2}`,borderRight:'none',
            padding:'9px 14px',width:230,letterSpacing:1.5}}/>
        <button onClick={()=>go(q)} style={{fontFamily:MONO,fontSize:8,padding:'9px 20px',cursor:'pointer',
          background:D.cyan,border:'none',color:D.bg,letterSpacing:2,fontWeight:'bold',transition:'opacity .15s'}}
          onMouseEnter={e=>e.target.style.opacity='.85'} onMouseLeave={e=>e.target.style.opacity='1'}>
          LOAD ▶
        </button>
        {open&&sugg.length>0&&(
          <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,
            background:D.s1,border:`1px solid ${D.b2}`,zIndex:200,boxShadow:`0 16px 48px #0009`}}>
            {sugg.map(s=>(
              <div key={s.ticker} onMouseDown={()=>go(s.ticker)} style={{padding:'9px 14px',cursor:'pointer',
                display:'flex',alignItems:'center',gap:12,borderBottom:`1px solid ${D.b0}`}}
                onMouseEnter={e=>e.currentTarget.style.background=D.s3}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontFamily:DISPLAY,fontSize:13,color:D.cyan,minWidth:80}}>{s.ticker}</span>
                <span style={{fontFamily:MONO,fontSize:8,color:D.t2,flex:1}}>{s.name}</span>
                <Badge color={D.amber}>{s.market}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
      <span style={{fontFamily:MONO,fontSize:8,color:D.t3}}>{time}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   QUOTE STRIP
═══════════════════════════════════════════════════ */
function QuoteStrip({q,loading}){
  const price=useAnim(q?.price||0);
  if(loading)return <div style={{height:64,background:D.s1,borderBottom:`1px solid ${D.b1}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}><Spin label="FETCHING MARKET DATA"/></div>;
  if(!q)return(
    <div style={{padding:'14px 24px',background:D.s1,borderBottom:`1px solid ${D.b1}`,flexShrink:0,
      display:'flex',alignItems:'center',gap:12}}>
      <span style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:2}}>
        ↑ Enter any ticker above to load live market data and options chain
      </span>
      <Badge color={D.amber}>TRY: AAPL · TSLA · MSFT · RELIANCE.NS</Badge>
    </div>
  );
  const up=q.change>=0;
  return(
    <div style={{display:'flex',alignItems:'stretch',background:D.s1,borderBottom:`1px solid ${D.b1}`,height:64,flexShrink:0,
      backgroundImage:`linear-gradient(135deg,${D.cyan}06 0%,transparent 40%)`}}>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',
        borderRight:`1px solid ${D.b1}`,minWidth:220}}>
        <div style={{fontFamily:DISPLAY,fontSize:20,color:D.t0,letterSpacing:3}}>{q.ticker}</div>
        <div style={{fontFamily:MONO,fontSize:8,color:D.t2,marginTop:1}}>{q.flag} {q.exchange} · {q.name}</div>
      </div>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${D.b1}`}}>
        <div style={{fontFamily:DISPLAY,fontSize:26,color:D.t0,letterSpacing:1}}>{q.currency==='INR'?'₹':'$'}{price.toFixed(2)}</div>
        <div style={{fontFamily:MONO,fontSize:10,color:up?D.green:D.red,marginTop:1}}>
          {up?'▲':'▼'} {Math.abs(q.change).toFixed(2)} ({Math.abs(q.change_pct).toFixed(2)}%) TODAY
        </div>
      </div>
      {[[
        '30D HIST VOL',`${(q.hist_vol_30d*100).toFixed(1)}%`,D.orange,TOOLTIPS.iv,
      ],[
        'RISK-FREE r',`${(q.risk_free_rate*100).toFixed(2)}%`,D.t1,null,
      ],[
        'DIV YIELD q',`${(q.dividend_yield*100).toFixed(2)}%`,D.t1,null,
      ],[
        'MKT CAP',q.market_cap>1e12?`$${(q.market_cap/1e12).toFixed(2)}T`:q.market_cap>1e9?`$${(q.market_cap/1e9).toFixed(1)}B`:'—',D.t0,null,
      ],[
        'SECTOR',q.sector||'—',D.t1,null,
      ]].map(([k,v,c,tip])=>(
        <div key={k} style={{padding:'0 18px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${D.b0}`}}>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:3}}>
            {tip?<Annotated tip={tip} color={c}>{k}</Annotated>:k}
          </div>
          <div style={{fontFamily:MONO,fontSize:12,color:c,letterSpacing:.3}}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MODEL PRICE CARD
═══════════════════════════════════════════════════ */
function ModelCard({id,label,sub,color,price,delta,active,onClick,tipKey}){
  const p=useAnim(price,300);
  return(
    <div onClick={onClick} style={{flex:1,padding:'14px 16px',cursor:'pointer',
      background:active?`${color}10`:D.s2,border:`1px solid ${active?color:D.b1}`,
      borderTop:`2px solid ${active?color:'transparent'}`,transition:'all .2s',
      backgroundImage:active?`linear-gradient(160deg,${color}08,transparent 60%)`:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
        <div style={{fontFamily:MONO,fontSize:7,color,letterSpacing:2}}>
          <Annotated tip={TOOLTIPS[tipKey]||''} color={color}>{label}</Annotated>
        </div>
        {active&&<div style={{width:5,height:5,borderRadius:'50%',background:color,boxShadow:`0 0 8px ${color}`}}/>}
      </div>
      <div style={{fontFamily:DISPLAY,fontSize:21,color:D.t0,fontWeight:'bold',letterSpacing:.5,marginBottom:2}}>
        ${p.toFixed(4)}
      </div>
      <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginBottom:delta!=null?4:0}}>{sub}</div>
      {delta!=null&&<div style={{fontFamily:MONO,fontSize:8,color}}>Δ {delta>=0?'+':''}{delta.toFixed(4)}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   3D VOL SURFACE (Three.js)
═══════════════════════════════════════════════════ */
function VolSurface3D({data}){
  const ref=useRef(null);
  const frameRef=useRef(null);
  useEffect(()=>{
    if(!data||!ref.current)return;
    const w=ref.current.clientWidth,h=ref.current.clientHeight||420;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(w,h);renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setClearColor(0x000000,0);
    ref.current.innerHTML='';ref.current.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(45,w/h,0.1,1000);
    camera.position.set(2.2,1.6,2.2);camera.lookAt(0,0,0);

    // Build surface geometry from data
    const expiries=data.expiries||[];
    const strikes=data.strikes||[];
    const ivGrid=data.iv_grid||[];
    if(!expiries.length||!strikes.length)return;
    const nx=strikes.length,ny=expiries.length;
    const geo=new THREE.BufferGeometry();
    const positions=[],colors=[],indices=[];
    const ivFlat=ivGrid.flat().filter(v=>v&&!isNaN(v));
    const ivMin=Math.min(...ivFlat),ivMax=Math.max(...ivFlat);

    // Color map: low IV = deep blue, ATM dip = green, high IV = red/amber
    function ivColor(iv){
      const t=Math.max(0,Math.min(1,(iv-ivMin)/(ivMax-ivMin||1)));
      if(t<0.25){const s=t/0.25;return new THREE.Color(0.05+s*0.1,0.2+s*0.4,0.6+s*0.3);}
      if(t<0.5){const s=(t-0.25)/0.25;return new THREE.Color(0.15+s*0.2,0.6-s*0.1,0.9-s*0.5);}
      if(t<0.75){const s=(t-0.5)/0.25;return new THREE.Color(0.35+s*0.5,0.5-s*0.4,0.4-s*0.3);}
      const s=(t-0.75)/0.25;return new THREE.Color(0.85+s*0.1,0.1+s*0.1,0.1);
    }

    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const x=(i/(nx-1)-0.5)*2;
      const z=(j/(ny-1)-0.5)*2;
      const iv=ivGrid[j]&&ivGrid[j][i]!=null?ivGrid[j][i]:ivMin;
      const y=(iv-ivMin)/(ivMax-ivMin||1)*1.2;
      positions.push(x,y,z);
      const c=ivColor(iv);colors.push(c.r,c.g,c.b);
    }
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const a=j*nx+i,b=a+1,c=a+nx,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();

    const mat=new THREE.MeshPhongMaterial({vertexColors:true,side:THREE.DoubleSide,shininess:40,opacity:.92,transparent:true});
    const mesh=new THREE.Mesh(geo,mat);scene.add(mesh);

    // Wireframe overlay
    const wMat=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,opacity:.06,transparent:true});
    scene.add(new THREE.Mesh(geo,wMat));

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff,0.5));
    const dl=new THREE.DirectionalLight(0xaaccff,1.2);dl.position.set(2,3,2);scene.add(dl);
    const dl2=new THREE.DirectionalLight(0xff8844,0.4);dl2.position.set(-2,-1,-2);scene.add(dl2);

    // Axes
    const axMat=new THREE.LineBasicMaterial({color:0x334466});
    [[[-1,0,0],[1,0,0]],[[0,0,-1],[0,0,1]],[[0,0,0],[0,1.3,0]]].forEach(([a,b])=>{
      const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);
      scene.add(new THREE.Line(g,axMat));
    });

    // Auto-rotate
    let rX=0.4,rY=0,isDragging=false,lastX=0,lastY=0;
    const onDown=e=>{isDragging=true;lastX=e.clientX||e.touches?.[0]?.clientX||0;lastY=e.clientY||e.touches?.[0]?.clientY||0;};
    const onUp=()=>isDragging=false;
    const onMove=e=>{if(!isDragging)return;const cx=e.clientX||e.touches?.[0]?.clientX||0,cy=e.clientY||e.touches?.[0]?.clientY||0;rY+=(cx-lastX)*0.01;rX+=(cy-lastY)*0.005;lastX=cx;lastY=cy;};
    renderer.domElement.addEventListener('mousedown',onDown);renderer.domElement.addEventListener('touchstart',onDown);
    window.addEventListener('mouseup',onUp);window.addEventListener('touchend',onUp);
    window.addEventListener('mousemove',onMove);window.addEventListener('touchmove',onMove);

    const animate=()=>{
      frameRef.current=requestAnimationFrame(animate);
      if(!isDragging)rY+=0.004;
      mesh.rotation.y=rY;mesh.rotation.x=rX;
      wMat.clone&&(scene.children.find(c=>c.material===wMat)&&(scene.children.find(c=>c.material===wMat).rotation.y=rY,scene.children.find(c=>c.material===wMat).rotation.x=rX));
      scene.children.filter(c=>c.isMesh).forEach(m=>{m.rotation.y=rY;m.rotation.x=rX;});
      renderer.render(scene,camera);
    };
    animate();
    return()=>{cancelAnimationFrame(frameRef.current);renderer.dispose();window.removeEventListener('mouseup',onUp);window.removeEventListener('mousemove',onMove);window.removeEventListener('touchend',onUp);window.removeEventListener('touchmove',onMove);};
  },[data]);
  return <div ref={ref} style={{width:'100%',height:420,cursor:'grab'}}/>;
}

/* ═══════════════════════════════════════════════════
   2D HEATMAP (canvas)
═══════════════════════════════════════════════════ */
function VolHeatmap({data}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!data||!ref.current)return;
    const{expiries=[],strikes=[],iv_grid=[]}=data;
    if(!expiries.length)return;
    const canvas=ref.current,ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    const padL=60,padB=40,padT=20,padR=20;
    const cW=W-padL-padR,cH=H-padT-padB;
    ctx.clearRect(0,0,W,H);
    const ivFlat=iv_grid.flat().filter(v=>v&&!isNaN(v));
    const ivMin=Math.min(...ivFlat),ivMax=Math.max(...ivFlat);
    const cw=cW/strikes.length,ch=cH/expiries.length;
    function ivToColor(iv){
      const t=Math.max(0,Math.min(1,(iv-ivMin)/(ivMax-ivMin||1)));
      if(t<0.2)return`rgb(${Math.round(10+t*5*20)},${Math.round(30+t*5*60)},${Math.round(120+t*5*80)})`;
      if(t<0.45){const s=(t-0.2)/0.25;return`rgb(${Math.round(20+s*80)},${Math.round(150-s*20)},${Math.round(200-s*160)})`;}
      if(t<0.7){const s=(t-0.45)/0.25;return`rgb(${Math.round(100+s*150)},${Math.round(130-s*100)},${Math.round(40-s*20)})`;}
      const s=(t-0.7)/0.3;return`rgb(${Math.round(250)},${Math.round(30+s*10)},${Math.round(20)})`;
    }
    for(let j=0;j<expiries.length;j++){
      for(let i=0;i<strikes.length;i++){
        const iv=iv_grid[j]&&iv_grid[j][i];
        if(iv==null||isNaN(iv))continue;
        ctx.fillStyle=ivToColor(iv);
        ctx.fillRect(padL+i*cw,padT+j*ch,cw+1,ch+1);
      }
    }
    // Grid lines
    ctx.strokeStyle='rgba(30,60,90,0.4)';ctx.lineWidth=0.5;
    strikes.forEach((_,i)=>{ctx.beginPath();ctx.moveTo(padL+i*cw,padT);ctx.lineTo(padL+i*cw,padT+cH);ctx.stroke();});
    expiries.forEach((_,j)=>{ctx.beginPath();ctx.moveTo(padL,padT+j*ch);ctx.lineTo(padL+cW,padT+j*ch);ctx.stroke();});
    // Axis labels
    ctx.fillStyle='#4a6880';ctx.font=`9px ${MONO}`;ctx.textAlign='center';
    const sStep=Math.max(1,Math.floor(strikes.length/8));
    strikes.forEach((s,i)=>{if(i%sStep===0)ctx.fillText(`$${s}`,padL+i*cw+cw/2,H-8);});
    ctx.textAlign='right';ctx.textBaseline='middle';
    expiries.forEach((e,j)=>{ctx.fillText(e,padL-4,padT+j*ch+ch/2);});
    // Color legend
    const gx=padL,gy=padT+cH+22,gw=cW,gh=6;
    const grad=ctx.createLinearGradient(gx,0,gx+gw,0);
    grad.addColorStop(0,'rgb(10,30,120)');grad.addColorStop(0.35,'rgb(20,150,200)');
    grad.addColorStop(0.6,'rgb(200,100,20)');grad.addColorStop(1,'rgb(250,30,20)');
    ctx.fillStyle=grad;ctx.fillRect(gx,gy,gw,gh);
    ctx.fillStyle='#4a6880';ctx.font=`8px ${MONO}`;ctx.textAlign='left';ctx.fillText(`${ivMin.toFixed(0)}%`,gx,gy+gh+10);
    ctx.textAlign='right';ctx.fillText(`${ivMax.toFixed(0)}%`,gx+gw,gy+gh+10);
    ctx.textAlign='center';ctx.fillText('IMPLIED VOLATILITY',gx+gw/2,gy+gh+10);
  },[data]);
  return <canvas ref={ref} width={800} height={500} style={{width:'100%',height:'auto'}}/>;
}

/* ═══════════════════════════════════════════════════
   VOL SURFACE TAB
═══════════════════════════════════════════════════ */
function VolSurfacePanel({ticker}){
  const{data,loading,error}=useFetch(ticker?`${API}/api/surface/${ticker}`:null);
  const[mode,setMode]=useState('3d');
  if(loading)return <Spin label="BUILDING VOL SURFACE — FETCHING ALL EXPIRIES"/>;
  if(error)return <Err msg={error}/>;
  if(!data)return null;
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:3,marginBottom:3}}>
            <Annotated tip={TOOLTIPS.surface} color={D.orange}>IMPLIED VOLATILITY SURFACE</Annotated>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t2}}>
            {ticker} · {data.expiries?.length} expiries · {data.strikes?.length} strikes per expiry · colour = IV level
          </div>
        </div>
        <div style={{display:'flex',gap:1}}>
          {[['3d','3D SURFACE'],['heatmap','HEATMAP']].map(([id,label])=>(
            <button key={id} onClick={()=>setMode(id)} style={{
              fontFamily:MONO,fontSize:8,padding:'6px 14px',cursor:'pointer',letterSpacing:1.5,
              background:mode===id?D.orange:`${D.orange}10`,border:`1px solid ${mode===id?D.orange:D.b2}`,
              color:mode===id?D.bg:D.t3,fontWeight:mode===id?'bold':'normal',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <ContextBar text={`Vol surface shows implied volatility (colour) across all available strikes (x-axis) and expiries (y-axis). A flat surface = BS is perfect. The real surface is a skew/smile — OTM puts carry higher IV (crash risk premium). 3D view: drag to rotate.`} color={D.orange}/>
      <div style={{background:D.s2,border:`1px solid ${D.b1}`,overflow:'hidden'}}>
        {mode==='3d'?<VolSurface3D data={data}/>:<VolHeatmap data={data}/>}
      </div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:D.b0}}>
        {[
          ['EXPIRIES LOADED',data.expiries?.length,D.t0],
          ['STRIKE RANGE',`$${data.strikes?.[0]}–$${data.strikes?.[data.strikes.length-1]}`,D.t1],
          ['IV RANGE',`${Math.min(...(data.iv_grid||[[]]).flat().filter(Boolean)).toFixed(1)}%–${Math.max(...(data.iv_grid||[[]]).flat().filter(Boolean)).toFixed(1)}%`,D.orange],
          ['ATM SKEW',data.atm_skew!=null?`${data.atm_skew.toFixed(1)}% 25Δ Put–Call`:'—',data.atm_skew>0?D.red:D.green],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:D.s2,padding:'12px 16px'}}>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:4}}>{k}</div>
            <div style={{fontFamily:DISPLAY,fontSize:16,color:c,fontWeight:'bold'}}>{v??'—'}</div>
          </div>
        ))}
      </div>
      <div style={{padding:'14px 16px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
        <div style={{fontFamily:MONO,fontSize:8,color:D.t2,lineHeight:2}}>
          <strong style={{color:D.t0}}>Why the surface matters:</strong> Black-Scholes assumes one constant σ for all strikes and expiries — a flat surface. Real markets show a <em style={{color:D.orange}}>skew</em> (puts price higher than calls, same expiry) and <em style={{color:D.orange}}>term structure</em> (near-term vol ≠ long-term vol). Practitioners fit local vol or stochastic vol models (Heston, SABR) to match this surface. The surface is the market's true view of risk.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MODEL PRICER PANEL (Left)
═══════════════════════════════════════════════════ */
function ModelPricer({defaultS,defaultR,defaultQ,selectedContract}){
  const[S,setS]=useState(defaultS||185);
  const[K,setK]=useState(defaultS||185);
  const[Td,setTd]=useState(45);
  const[r,setR]=useState((defaultR||0.0525)*100);
  const[σ,setσ]=useState(28);
  const[q,setQ]=useState((defaultQ||0.005)*100);
  const[type,setType]=useState('call');
  const[activeModel,setActiveModel]=useState('bs');
  const[tab,setTab]=useState('greeks');

  useEffect(()=>{if(defaultS){setS(parseFloat(defaultS.toFixed(2)));setK(parseFloat(defaultS.toFixed(2)));}if(defaultR)setR(parseFloat((defaultR*100).toFixed(3)));if(defaultQ)setQ(parseFloat((defaultQ*100).toFixed(3)));},[defaultS,defaultR,defaultQ]);
  useEffect(()=>{if(!selectedContract)return;setK(selectedContract.strike);setType(selectedContract.type);if(selectedContract.T)setTd(Math.round(selectedContract.T*365));},[selectedContract]);

  const Ty=Td/365,ry=r/100,sy=σ/100,qy=q/100;
  const bsR=bs(S,K,Ty,ry,sy,qy,type);
  const binomR=useMemo(()=>binomCRR(S,K,Ty,ry,sy,qy,type,150),[S,K,Ty,ry,sy,qy,type]);
  const mcR=useMemo(()=>mc(S,K,Ty,ry,sy,qy,type,20000),[S,K,Ty,ry,sy,qy,type]);
  const convData=useMemo(()=>binomConv(S,K,Ty,ry,sy,qy,type),[S,K,Ty,ry,sy,qy,type]);
  const intrinsic=Math.max(type==='call'?S-K:K-S,0);
  const moneyness=type==='call'?(S>K*1.005?'ITM':S<K*0.995?'OTM':'ATM'):(K>S*1.005?'ITM':K<S*0.995?'OTM':'ATM');
  const mCol=moneyness==='ITM'?D.green:moneyness==='OTM'?D.red:D.amber;
  const mktPrice=selectedContract?.mid||null;
  const alpha=mktPrice?bsR.price-mktPrice:null;

  const Slider=({label,val,set,min,max,step,fmt})=>(
    <div style={{marginBottom:13}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
        <span style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2}}>{label}</span>
        <span style={{fontFamily:MONO,fontSize:11,color:D.t0,fontWeight:'bold'}}>{fmt(val)}</span>
      </div>
      <div style={{position:'relative'}}>
        <div style={{height:2,background:D.s4,borderRadius:1}}>
          <div style={{height:'100%',background:D.cyan,borderRadius:1,width:`${((val-min)/(max-min))*100}%`,transition:'width .05s'}}/>
        </div>
        <input type="range" min={min} max={max} step={step} value={val}
          onChange={e=>set(parseFloat(e.target.value))}
          style={{position:'absolute',top:'-6px',left:0,width:'100%',height:14,
            appearance:'none',WebkitAppearance:'none',background:'transparent',cursor:'pointer'}}/>
      </div>
    </div>
  );

  const GREEKS=[
    ['Δ DELTA',  bsR.delta,  D.cyan,   TOOLTIPS.delta,  'Rate of price change vs spot'],
    ['Γ GAMMA',  bsR.gamma,  D.green,  TOOLTIPS.gamma,  'Rate of Delta change'],
    ['ν VEGA',   bsR.vega,   D.orange, TOOLTIPS.vega,   'Per 1% vol move'],
    ['Θ THETA',  bsR.theta,  D.red,    TOOLTIPS.theta,  'Per calendar day'],
    ['ρ RHO',    bsR.rho,    D.purple, TOOLTIPS.rho,    'Per 1% rate move'],
    ['N(d₂)',    bsR.Nd2,    D.amber,  TOOLTIPS.nd2,    'Risk-neutral ITM prob'],
  ];

  return(
    <div style={{width:340,flexShrink:0,display:'flex',flexDirection:'column',
      borderRight:`1px solid ${D.b1}`,background:D.s1,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${D.b1}`,
        background:`linear-gradient(90deg,${D.cyan}08,transparent)`,flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontFamily:MONO,fontSize:8,color:D.cyan,letterSpacing:3}}>MODEL PRICER</span>
          {selectedContract&&<Badge color={D.amber}>← CHAIN CONTRACT LOADED</Badge>}
        </div>
        <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginTop:3,lineHeight:1.5}}>
          {selectedContract
            ? `K=$${selectedContract.strike} · ${selectedContract.expiry} · ${selectedContract.type?.toUpperCase()} — adjust parameters below`
            : 'Click any row in the Options Chain to load a live contract'}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:16}}>
        {/* Call/Put toggle */}
        <div style={{display:'flex',gap:1,marginBottom:16}}>
          {['call','put'].map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{flex:1,padding:'10px 0',cursor:'pointer',
              fontFamily:DISPLAY,fontSize:12,letterSpacing:3,
              background:type===t?(t==='call'?`${D.cyan}18`:`${D.red}18`):'transparent',
              borderBottom:type===t?`2px solid ${t==='call'?D.cyan:D.red}`:'2px solid transparent',
              color:type===t?(t==='call'?D.cyan:D.red):D.t3,border:`1px solid ${type===t?(t==='call'?D.cyan:D.red):D.b1}`}}>{t.toUpperCase()}</button>
          ))}
        </div>
        {/* 3 model cards */}
        <div style={{display:'flex',gap:2,marginBottom:14}}>
          <ModelCard id="bs"    label="BLACK-SCHOLES" sub="Analytical · Exact"   color={D.mBS}    price={bsR.price}   delta={bsR.delta} active={activeModel==='bs'}    onClick={()=>setActiveModel('bs')}    tipKey="bs"/>
          <ModelCard id="binom" label="BINOMIAL CRR"  sub="150-step · American" color={D.mBinom}  price={binomR.price} delta={null}      active={activeModel==='binom'} onClick={()=>setActiveModel('binom')} tipKey="binom"/>
          <ModelCard id="mc"    label="MONTE CARLO"   sub="20K sims · Antithetic" color={D.mMC}  price={mcR.price}   delta={null}      active={activeModel==='mc'}    onClick={()=>setActiveModel('mc')}    tipKey="mcarlo"/>
        </div>
        {/* Market price + alpha */}
        {mktPrice&&(
          <div style={{display:'flex',gap:2,marginBottom:14}}>
            <div style={{flex:1,padding:'10px 12px',background:`${D.amber}0c`,border:`1px solid ${D.amber}28`,borderTop:`2px solid ${D.amber}`}}>
              <div style={{fontFamily:MONO,fontSize:7,color:D.amber,letterSpacing:2,marginBottom:4}}>MARKET PRICE (MID)</div>
              <div style={{fontFamily:DISPLAY,fontSize:18,color:D.amber,fontWeight:'bold'}}>${mktPrice.toFixed(4)}</div>
              <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginTop:4}}>Live bid/ask midpoint</div>
            </div>
            <div style={{flex:1,padding:'10px 12px',
              background:`${alpha>0?D.green:D.red}08`,
              border:`1px solid ${(alpha>0?D.green:D.red)}25`,
              borderTop:`2px solid ${alpha>0?D.green:D.red}`}}>
              <div style={{fontFamily:MONO,fontSize:7,color:alpha>0?D.green:D.red,letterSpacing:2,marginBottom:4}}>
                <Annotated tip={TOOLTIPS.alpha} color={alpha>0?D.green:D.red}>α EDGE (BS−MKT)</Annotated>
              </div>
              <div style={{fontFamily:DISPLAY,fontSize:18,color:alpha>0?D.green:D.red,fontWeight:'bold'}}>{alpha>0?'+':''}{alpha.toFixed(4)}</div>
              <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginTop:4}}>{alpha>0?'Model overprices':'Market charges premium'}</div>
            </div>
          </div>
        )}
        {/* Moneyness + decomp */}
        <div style={{display:'flex',gap:2,marginBottom:14}}>
          <div style={{flex:1,padding:'8px 10px',background:D.s2,borderLeft:`2px solid ${mCol}`}}>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:2}}>MONEYNESS</div>
            <div style={{fontFamily:DISPLAY,fontSize:14,color:mCol,fontWeight:'bold'}}>{moneyness}</div>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3}}>S/K = {(S/K).toFixed(4)}</div>
          </div>
          <div style={{flex:1,padding:'8px 10px',background:D.s2,borderLeft:`2px solid ${D.t4}`}}>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:2}}>PRICE DECOMP</div>
            <div style={{fontFamily:MONO,fontSize:10,color:D.t0}}>Intr <span style={{color:D.t0}}>${intrinsic.toFixed(3)}</span></div>
            <div style={{fontFamily:MONO,fontSize:10,color:D.cyan}}>Time <span style={{color:D.cyan}}>${Math.max(bsR.price-intrinsic,0).toFixed(3)}</span></div>
          </div>
        </div>
        {/* MC CI bar */}
        <div style={{padding:'10px 12px',background:D.s2,borderLeft:`2px solid ${D.orange}`,marginBottom:16}}>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:5}}>
            <Annotated tip={TOOLTIPS.mcarlo} color={D.orange}>MONTE CARLO 95% CI</Annotated>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontFamily:MONO,fontSize:8,color:D.orange}}>[${mcR.ci95[0].toFixed(4)}, ${mcR.ci95[1].toFixed(4)}]</span>
            <span style={{fontFamily:MONO,fontSize:7,color:D.t3}}>σ={mcR.stderr.toFixed(5)}</span>
          </div>
          <div style={{height:4,background:D.s4,borderRadius:2,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',left:'10%',right:'10%',height:'100%',background:`${D.orange}40`,borderRadius:2}}/>
            <div style={{position:'absolute',left:'50%',top:0,width:2,height:'100%',background:D.cyan,transform:'translateX(-50%)'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
            <span style={{fontFamily:MONO,fontSize:7,color:D.t4}}>Lower 95%</span>
            <span style={{fontFamily:MONO,fontSize:7,color:D.cyan}}>↑ BS</span>
            <span style={{fontFamily:MONO,fontSize:7,color:D.t4}}>Upper 95%</span>
          </div>
        </div>
        {/* Sub-tabs */}
        <div style={{display:'flex',marginBottom:12,gap:1}}>
          {[['greeks','GREEKS'],['convergence','CONVERGENCE'],['payoff','PAYOFF']].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'6px 0',cursor:'pointer',
              fontFamily:MONO,fontSize:7,letterSpacing:1,
              background:tab===id?`${D.cyan}15`:D.s2,
              borderBottom:tab===id?`2px solid ${D.cyan}`:'2px solid transparent',
              color:tab===id?D.cyan:D.t3,border:`1px solid ${D.b1}`}}>{label}</button>
          ))}
        </div>
        {tab==='greeks'&&(
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <div style={{display:'flex',gap:3}}>
              {GREEKS.slice(0,2).map(([k,v,c,tip,d])=>(
                <div key={k} style={{flex:1,padding:'9px 10px',background:D.s2,borderLeft:`2px solid ${c}`}}>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginBottom:2}}>
                    <Annotated tip={tip} color={c}>{k}</Annotated>
                  </div>
                  <div style={{fontFamily:DISPLAY,fontSize:14,color:c,fontWeight:'bold'}}>{v>=0&&k!=='Θ THETA'?'+':''}{v.toFixed(5)}</div>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t4,marginTop:1}}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:3}}>
              {GREEKS.slice(2,4).map(([k,v,c,tip,d])=>(
                <div key={k} style={{flex:1,padding:'9px 10px',background:D.s2,borderLeft:`2px solid ${c}`}}>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginBottom:2}}>
                    <Annotated tip={tip} color={c}>{k}</Annotated>
                  </div>
                  <div style={{fontFamily:DISPLAY,fontSize:14,color:c,fontWeight:'bold'}}>{v>=0&&k!=='Θ THETA'?'+':''}{v.toFixed(5)}</div>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t4,marginTop:1}}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:3}}>
              {GREEKS.slice(4,6).map(([k,v,c,tip,d])=>(
                <div key={k} style={{flex:1,padding:'9px 10px',background:D.s2,borderLeft:`2px solid ${c}`}}>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t3,marginBottom:2}}>
                    <Annotated tip={tip} color={c}>{k}</Annotated>
                  </div>
                  <div style={{fontFamily:DISPLAY,fontSize:14,color:c,fontWeight:'bold'}}>{v.toFixed(5)}</div>
                  <div style={{fontFamily:MONO,fontSize:7,color:D.t4,marginTop:1}}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{padding:'8px 10px',background:D.s2,fontFamily:MONO,fontSize:8,color:D.t3,marginTop:2,lineHeight:1.8}}>
              d₁ <span style={{color:D.t1}}>{bsR.d1.toFixed(5)}</span>{'   '}d₂ <span style={{color:D.t1}}>{bsR.d2.toFixed(5)}</span>
            </div>
          </div>
        )}
        {tab==='convergence'&&(
          <div>
            <ContextBar text="Binomial tree converges to BS as steps → ∞. Gap above BS = American early exercise premium." color={D.mBinom}/>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={convData} margin={{top:8,right:8,left:0,bottom:4}}>
                <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.5}/>
                <XAxis dataKey="steps" stroke={D.t3} tick={{fontFamily:MONO,fontSize:7,fill:D.t3}} label={{value:'Steps n',fill:D.t3,fontFamily:MONO,fontSize:7,position:'insideBottom',offset:-2}}/>
                <YAxis stroke={D.t3} tick={{fontFamily:MONO,fontSize:7,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(2)}`} width={46}/>
                <Tooltip contentStyle={TTP} formatter={v=>[`$${v.toFixed(5)}`]}/>
                <ReferenceLine y={bsR.price} stroke={D.mBS} strokeDasharray="4 2" strokeWidth={1.5}
                  label={{value:'BS',fill:D.mBS,fontFamily:MONO,fontSize:8,position:'right'}}/>
                <Line type="monotone" dataKey="price" stroke={D.mBinom} strokeWidth={2} dot={{r:3,fill:D.mBinom}} name="Binomial"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {tab==='payoff'&&(
          <div>
            <ContextBar text="Net P&L at expiry assuming you paid the BS price. Break-even where line crosses zero." color={D.green}/>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={Array.from({length:80},(_,i)=>{const s=S*0.4+S*1.6*(i/79);const payoff=type==='call'?Math.max(s-K,0):Math.max(K-s,0);return{S:parseFloat(s.toFixed(1)),pnl:parseFloat((payoff-bsR.price).toFixed(3))};})}>
                <defs><linearGradient id="pgg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={D.green} stopOpacity={0.35}/><stop offset="95%" stopColor={D.green} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.4}/>
                <XAxis dataKey="S" stroke={D.t3} tick={{fontFamily:MONO,fontSize:7,fill:D.t3}} tickFormatter={v=>`$${v}`}/>
                <YAxis stroke={D.t3} tick={{fontFamily:MONO,fontSize:7,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(0)}`} width={38}/>
                <Tooltip contentStyle={TTP} formatter={v=>[`$${v.toFixed(3)}`,'P&L']} labelFormatter={v=>`S=$${v}`}/>
                <ReferenceLine y={0} stroke={D.b3} strokeWidth={1.5}/>
                <ReferenceLine x={K} stroke={D.amber} strokeDasharray="3 2" label={{value:'K',fill:D.amber,fontFamily:MONO,fontSize:8}}/>
                <ReferenceLine x={S} stroke={D.t3} strokeDasharray="2 2" label={{value:'S',fill:D.t3,fontFamily:MONO,fontSize:8}}/>
                <Area type="monotone" dataKey="pnl" stroke={D.green} fill="url(#pgg)" strokeWidth={2} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Parameter sliders */}
        <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${D.b1}`}}>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:3,marginBottom:14}}>PARAMETERS — drag to adjust</div>
          <Slider label="SPOT  S"       val={S}  set={setS}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}/>
          <Slider label="STRIKE  K"     val={K}  set={setK}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}/>
          <Slider label="EXPIRY  T"     val={Td} set={setTd} min={1}   max={730}  step={1}    fmt={v=>`${v}d`}/>
          <Slider label="VOLATILITY  σ" val={σ}  set={setσ}  min={1}   max={200}  step={0.5}  fmt={v=>`${v.toFixed(1)}%`}/>
          <Slider label="RISK-FREE  r"  val={r}  set={setR}  min={0}   max={20}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}/>
          <Slider label="DIVIDEND  q"   val={q}  set={setQ}  min={0}   max={15}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}/>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   OPTIONS CHAIN
═══════════════════════════════════════════════════ */
function ChainTable({chainData,loading,error,spot,expiry,setExpiry,onSelect}){
  const[side,setSide]=useState('calls'),[sortKey,setSort]=useState('strike'),[sortDir,setSortDir]=useState(1),[selRow,setSelRow]=useState(null);
  const toggleSort=k=>{if(sortKey===k)setSortDir(d=>-d);else{setSort(k);setSortDir(1);}};
  if(loading)return <Spin label="FETCHING OPTIONS CHAIN"/>;
  if(error)return <Err msg={error}/>;
  if(!chainData)return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:12}}>
      <div style={{fontFamily:MONO,fontSize:24,color:D.t4}}>⬡</div>
      <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:2}}>LOAD A TICKER TO SEE LIVE OPTIONS</div>
      <Badge color={D.cyan}>TRY: AAPL · TSLA · NVDA · MSFT</Badge>
    </div>
  );
  const contracts=(side==='calls'?chainData.calls:chainData.puts)||[];
  const sorted=[...contracts].sort((a,b)=>(a[sortKey]>b[sortKey]?1:-1)*sortDir);
  const cols=[
    {key:'strike',       label:'STRIKE',  fmt:v=>v.toFixed(2),align:'left',w:75},
    {key:'bid',          label:'BID',     fmt:v=>v.toFixed(2),w:60},
    {key:'ask',          label:'ASK',     fmt:v=>v.toFixed(2),w:60},
    {key:'mid',          label:'MID',     fmt:v=>v.toFixed(2),w:60},
    {key:'iv',           label:'IV %',    fmt:v=>v!=null?`${v.toFixed(1)}%`:'—',w:55,tip:TOOLTIPS.iv},
    {key:'bs_price',     label:'BS PRICE',fmt:v=>v.toFixed(3),w:72,tip:TOOLTIPS.bs},
    {key:'mispricing',   label:'α EDGE',  fmt:v=>`${v>0?'+':''}${v.toFixed(3)}`,w:70,tip:TOOLTIPS.alpha},
    {key:'greek_delta',  label:'Δ',       fmt:v=>`${v>0?'+':''}${v.toFixed(4)}`,w:68,tip:TOOLTIPS.delta},
    {key:'greek_gamma',  label:'Γ',       fmt:v=>v.toFixed(5),w:68,tip:TOOLTIPS.gamma},
    {key:'greek_theta',  label:'Θ/d',     fmt:v=>v.toFixed(5),w:68,tip:TOOLTIPS.theta},
    {key:'volume',       label:'VOL',     fmt:v=>v.toLocaleString(),w:60},
    {key:'open_interest',label:'OI',      fmt:v=>v.toLocaleString(),w:60},
    {key:'moneyness',    label:'',        fmt:v=>v,w:36},
  ];
  const rowBg=(row,isSel)=>{
    if(isSel)return`${D.cyan}18`;
    if(row.moneyness==='ITM')return`${D.green}07`;
    if(row.moneyness==='ATM')return`${D.amber}08`;
    return'transparent';
  };
  const cellCol=(c,row)=>{
    if(c.key==='strike')return Math.abs(row.strike-(spot||0))<(spot||1)*0.005?D.amber:D.t0;
    if(c.key==='iv')return D.orange;
    if(c.key==='mispricing')return row.mispricing>0.05?D.green:row.mispricing<-0.05?D.red:D.t3;
    if(c.key==='greek_delta')return side==='calls'?D.cyan:D.red;
    if(c.key==='bs_price')return D.cyan;
    if(c.key==='moneyness')return row.moneyness==='ITM'?D.green:row.moneyness==='ATM'?D.amber:D.t4;
    return D.t2;
  };
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
      <ContextBar text={`Click any row to load that contract into the Model Pricer (left panel). Colors: Green = ITM, Gold = ATM ±0.5%, Dim = OTM. α Edge = BS price minus market price — positive means BS overprices.`} color={D.cyan}/>
      {/* Expiry bar */}
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,padding:'7px 16px',
        borderBottom:`1px solid ${D.b0}`,background:D.s2,flexShrink:0}}>
        <span style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginRight:4}}>EXPIRY</span>
        {chainData.all_expiries?.slice(0,8).map(e=>(
          <button key={e} onClick={()=>setExpiry(e)} style={{fontFamily:MONO,fontSize:7,padding:'3px 8px',
            cursor:'pointer',background:(expiry||chainData.expiry)===e?`${D.cyan}18`:'transparent',
            border:`1px solid ${(expiry||chainData.expiry)===e?D.cyan:D.b1}`,
            color:(expiry||chainData.expiry)===e?D.cyan:D.t3}}>{e}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:10,fontFamily:MONO,fontSize:7,color:D.t3}}>
          <span>T={chainData.T}yr · S=${chainData.spot} · r={(chainData.r*100).toFixed(2)}%</span>
          <Badge color={D.green}>LIVE</Badge>
        </div>
      </div>
      {/* Call/put */}
      <div style={{display:'flex',borderBottom:`1px solid ${D.b1}`,flexShrink:0}}>
        {['calls','puts'].map(s=>(
          <button key={s} onClick={()=>setSide(s)} style={{flex:1,padding:'9px 0',cursor:'pointer',
            fontFamily:DISPLAY,fontSize:11,letterSpacing:3,
            background:side===s?(s==='calls'?`${D.cyan}10`:`${D.red}10`):'transparent',
            borderBottom:side===s?`2px solid ${s==='calls'?D.cyan:D.red}`:'2px solid transparent',
            color:side===s?(s==='calls'?D.cyan:D.red):D.t3,border:`1px solid ${D.b0}`}}>
            {s.toUpperCase()} ({(s==='calls'?chainData.calls:chainData.puts)?.length||0})
          </button>
        ))}
      </div>
      {/* Table */}
      <div style={{flex:1,overflowY:'auto',overflowX:'auto',minHeight:0}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:MONO}}>
          <thead>
            <tr style={{background:D.s3,position:'sticky',top:0,zIndex:2}}>
              {cols.map(c=>(
                <th key={c.key} onClick={()=>toggleSort(c.key)} style={{
                  padding:'7px 10px',textAlign:c.align||'right',cursor:'pointer',
                  fontWeight:'normal',fontSize:7,letterSpacing:1.5,
                  color:sortKey===c.key?D.cyan:D.t3,
                  borderBottom:`1px solid ${D.b2}`,whiteSpace:'nowrap',width:c.w,
                }}>
                  {c.tip?<Annotated tip={c.tip} color={D.cyan}>{c.label}</Annotated>:c.label}
                  {sortKey===c.key?(sortDir===1?' ↑':' ↓'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row,i)=>{
              const isSel=selRow===i;
              return(
                <tr key={i} onClick={()=>{setSelRow(i);onSelect({...row,T:chainData.T,expiry:chainData.expiry});}}
                  style={{background:rowBg(row,isSel),borderBottom:`1px solid ${D.b0}`,cursor:'pointer'}}
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=`${D.cyan}0a`;}}
                  onMouseLeave={e=>{e.currentTarget.style.background=rowBg(row,isSel);}}>
                  {cols.map(c=>(
                    <td key={c.key} style={{padding:'5px 10px',textAlign:c.align||'right',
                      color:cellCol(c,row),fontWeight:c.key==='strike'?'bold':'normal'}}>
                      {row[c.key]!=null?c.fmt(row[c.key]):'—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{padding:'5px 16px',borderTop:`1px solid ${D.b0}`,
        display:'flex',gap:16,fontFamily:MONO,fontSize:7,color:D.t3,flexShrink:0}}>
        <span><span style={{color:D.green}}>■</span> ITM  <span style={{color:D.amber,marginLeft:6}}>■</span> ATM ±0.5%</span>
        <span style={{marginLeft:'auto'}}>{sorted.length} contracts · {side}</span>
      </div>
    </div>
  );
}

function IVSmile({data,loading,error,ticker}){
  if(loading)return <Spin label="COMPUTING IV SMILE"/>;
  if(error)return <Err msg={error}/>;
  if(!data)return null;
  const calls=data.calls.filter(c=>c.iv!=null).map(c=>({strike:c.strike,iv:c.iv}));
  const puts=data.puts.filter(c=>c.iv!=null).map(c=>({strike:c.strike,iv:c.iv}));
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:3,marginBottom:3}}>
            <Annotated tip={TOOLTIPS.iv} color={D.orange}>LIVE IMPLIED VOLATILITY SMILE</Annotated>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t2}}>{ticker} · {data.expiry} · Newton-Raphson IV solver</div>
        </div>
        <Badge color={D.orange}>LIVE IV</Badge>
      </div>
      <ContextBar text="Each dot = one live option contract. IV solved from market price using Newton-Raphson. The smile/skew shows OTM puts pricing higher IV than OTM calls — crash risk premium. A flat smile = BS is correct." color={D.orange}/>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{top:10,right:30,left:0,bottom:20}}>
          <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.5}/>
          <XAxis dataKey="strike" stroke={D.t3} name="Strike" tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`$${v}`} label={{value:'Strike Price ($)',fill:D.t3,fontFamily:MONO,fontSize:8,position:'insideBottom',offset:-10}}/>
          <YAxis dataKey="iv" stroke={D.t3} name="IV %" tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`${v}%`} label={{value:'Implied Volatility (%)',fill:D.t3,fontFamily:MONO,fontSize:8,angle:-90,position:'insideLeft',offset:10}}/>
          <Tooltip contentStyle={TTP} formatter={(v,n)=>[typeof v==='number'?`${v.toFixed(2)}%`:v,n]} labelFormatter={v=>`Strike $${v}`}/>
          <ReferenceLine x={data.spot} stroke={D.amber} strokeDasharray="4 2"
            label={{value:`Spot $${data.spot}`,fill:D.amber,fontFamily:MONO,fontSize:8}}/>
          <Scatter data={calls} name="Call IV" fill={D.cyan}  opacity={0.9} r={4}/>
          <Scatter data={puts}  name="Put IV"  fill={D.red}   opacity={0.9} r={4}/>
          <Legend wrapperStyle={{fontFamily:MONO,fontSize:9,paddingTop:12}}/>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{padding:'14px 16px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
        <div style={{fontFamily:MONO,fontSize:8,color:D.t2,lineHeight:2}}>
          <strong style={{color:D.t0}}>The skew tells a story:</strong> OTM puts (left side) carry higher IV because institutional players buy downside protection — the market prices in tail/crash risk asymmetrically. BS assumes one flat vol — this is exactly where it fails. Practitioners use local vol or SABR to fit the surface.
        </div>
      </div>
    </div>
  );
}

function AlphaEdge({data,loading,error,ticker}){
  if(loading)return <Spin label="COMPUTING α EDGE"/>;
  if(error)return <Err msg={error}/>;
  if(!data)return null;
  const calls=data.contracts.filter(c=>c.type==='call');
  const puts=data.contracts.filter(c=>c.type==='put');
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:3,marginBottom:3}}>
            <Annotated tip={TOOLTIPS.alpha} color={D.amber}>MODEL vs MARKET · α EDGE</Annotated>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t2}}>{ticker} · {data.expiry} · BS price − market mid</div>
        </div>
        <Badge color={D.amber}>MISPRICING</Badge>
      </div>
      <ContextBar text="α Edge = how much BS overprices (+) or underprices (−) each contract vs live market. A systematic pattern = vol skew — the market knows BS is wrong and prices accordingly." color={D.amber}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:D.b0}}>
        {[
          ['CONTRACTS', `${data.summary.total_contracts}`, D.t0],
          ['AVG α EDGE',`$${data.summary.avg_mispricing}`, Math.abs(data.summary.avg_mispricing)<0.05?D.t3:D.amber],
          ['MAX OVERPRICED', `$${data.summary.max_overpriced}`, D.green],
          ['MAX UNDERPRICED',`$${data.summary.max_underpriced}`,D.red],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:D.s2,padding:'12px 16px'}}>
            <div style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:2,marginBottom:4}}>{k}</div>
            <div style={{fontFamily:DISPLAY,fontSize:19,color:c,fontWeight:'bold'}}>{v}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{top:10,right:30,left:0,bottom:20}}>
          <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.4}/>
          <XAxis dataKey="strike" stroke={D.t3} name="Strike" tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`$${v}`} label={{value:'Strike Price ($)',fill:D.t3,fontFamily:MONO,fontSize:8,position:'insideBottom',offset:-10}}/>
          <YAxis dataKey="mispricing" stroke={D.t3} name="α Edge" tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(2)}`} label={{value:'α Edge ($)',fill:D.t3,fontFamily:MONO,fontSize:8,angle:-90,position:'insideLeft',offset:10}}/>
          <Tooltip contentStyle={TTP} formatter={(v,n)=>[typeof v==='number'?`$${v.toFixed(4)}`:v,n]} labelFormatter={v=>`Strike $${v}`}/>
          <ReferenceLine y={0} stroke={D.b3} strokeWidth={2}
            label={{value:'Fair Value (α = 0)',fill:D.t2,fontFamily:MONO,fontSize:8,position:'insideTopLeft'}}/>
          <ReferenceLine x={data.spot} stroke={D.amber} strokeDasharray="4 2"
            label={{value:'Spot',fill:D.amber,fontFamily:MONO,fontSize:8}}/>
          <Scatter data={calls} name="Calls α" fill={D.cyan} opacity={0.85} r={4}/>
          <Scatter data={puts}  name="Puts α"  fill={D.red}  opacity={0.85} r={4}/>
          <Legend wrapperStyle={{fontFamily:MONO,fontSize:9,paddingTop:12}}/>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════ */
export default function App(){
  const[ticker,setTicker]=useState('AAPL');
  const[tab,setTab]=useState('chain');
  const[apiLive,setApiLive]=useState(false);
  const[time,setTime]=useState('');
  const[expiry,setExpiry]=useState(null);
  const[selected,setSelected]=useState(null);

  useEffect(()=>{const f=()=>setTime(new Date().toLocaleTimeString('en-GB',{hour12:false})+' UTC');f();const t=setInterval(f,1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const check=()=>fetch(`${API}/health`).then(()=>setApiLive(true)).catch(()=>setApiLive(false));check();const t=setInterval(check,15000);return()=>clearInterval(t);},[]);
  useEffect(()=>{setExpiry(null);setSelected(null);},[ticker]);

  const{data:quote,loading:qLoad}=useFetch(ticker?`${API}/api/quote/${ticker}`:null);
  const chainUrl=ticker?(expiry?`${API}/api/chain/${ticker}?expiry=${expiry}`:`${API}/api/chain/${ticker}`):null;
  const{data:chain,loading:cLoad,error:cErr}=useFetch(chainUrl);
  const{data:cmpData,loading:mpLoad,error:mpErr}=useFetch(ticker?`${API}/api/compare/${ticker}`:null);

  const TABS=[
    {id:'chain',   label:'OPTIONS CHAIN',   color:D.cyan,  desc:'Live contracts with BS price, Greeks & α edge'},
    {id:'smile',   label:'IV SMILE',        color:D.orange,desc:'Implied volatility across strikes'},
    {id:'surface', label:'VOL SURFACE ✦',   color:D.orange,desc:'3D / heatmap view across all expiries'},
    {id:'alpha',   label:'α EDGE',          color:D.amber, desc:'Model vs market mispricing analysis'},
  ];

  return(
    <div style={{height:'100vh',width:'100vw',overflow:'hidden',
      background:D.bg,color:D.t0,fontFamily:MONO,display:'flex',flexDirection:'column'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${D.bg};}
        *{box-sizing:border-box;}
        input[type=range]{cursor:pointer;border:none;background:transparent;display:block;width:100%;height:14px;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:${D.cyan};border:2px solid ${D.bg};box-shadow:0 0 8px ${D.cyan}90;cursor:pointer;margin-top:-6px;}
        input[type=range]::-webkit-slider-runnable-track{height:2px;background:transparent;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes glow{0%,100%{box-shadow:0 0 6px ${D.green}80}50%{box-shadow:0 0 14px ${D.green}}}
        ::-webkit-scrollbar{width:4px;height:4px;background:${D.bg}}
        ::-webkit-scrollbar-thumb{background:${D.b2};border-radius:2px}
        button{outline:none;border:1px solid transparent;}
        input{outline:none;}
        tr{transition:background .08s;}
        th{user-select:none;}
        em{font-style:normal;}
      `}</style>

      <TopBar ticker={ticker} onLoad={t=>{setTicker(t);setTab('chain');}} apiLive={apiLive} time={time}/>
      <QuoteStrip q={quote} loading={qLoad}/>

      <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden'}}>
        {/* LEFT — always-visible model pricer */}
        <ModelPricer
          defaultS={quote?.price} defaultR={quote?.risk_free_rate} defaultQ={quote?.dividend_yield}
          selectedContract={selected}/>

        {/* RIGHT — tabbed market data */}
        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Tab bar */}
          <div style={{display:'flex',alignItems:'stretch',background:D.s2,
            borderBottom:`1px solid ${D.b1}`,flexShrink:0,height:44}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:'0 20px',cursor:'pointer',border:'none',
                fontFamily:MONO,fontSize:8,letterSpacing:1.5,background:'transparent',
                borderBottom:tab===t.id?`2px solid ${t.color}`:'2px solid transparent',
                color:tab===t.id?t.color:D.t3,display:'flex',alignItems:'center',
              }}>{t.label}</button>
            ))}
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12,padding:'0 16px'}}>
              {chain&&<span style={{fontFamily:MONO,fontSize:7,color:D.t3}}>{chain.total_contracts} contracts · {chain.expiry}</span>}
              {quote&&<Badge color={D.green}>LIVE · {ticker}</Badge>}
            </div>
          </div>
          {/* Context bar for active tab */}
          <div style={{flex:1,minHeight:0,overflow:'auto',display:'flex',flexDirection:'column'}}>
            <div style={{flex:1,minHeight:0,overflow:'auto'}}>
              {tab==='chain'&&<ChainTable chainData={chain} loading={cLoad} error={cErr} spot={quote?.price} expiry={expiry} setExpiry={setExpiry} onSelect={setSelected}/>}
              {tab==='smile'&&<IVSmile data={chain} loading={cLoad} error={cErr} ticker={ticker}/>}
              {tab==='surface'&&<VolSurfacePanel ticker={ticker}/>}
              {tab==='alpha'&&<AlphaEdge data={cmpData} loading={mpLoad} error={mpErr} ticker={ticker}/>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
