import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from "recharts";

/* ═══════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════ */
const API = "https://optionval-api.onrender.com";

/* ═══════════════════════════════════════════════════
   MATH ENGINE — Three models, fully client-side
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
function mcSim(S,K,T,r,σ,q,type,sims=20000){
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
// Cache layer — avoids hammering the API with duplicate requests
const fetchCache = new Map();
function useFetch(url){
  const[data,setD]=useState(null),[loading,setL]=useState(false),[error,setE]=useState(null);
  const ctrl=useRef(null);
  useEffect(()=>{
    if(!url){setD(null);setL(false);setE(null);return;}
    // Return cached data immediately if available
    if(fetchCache.has(url)){setD(fetchCache.get(url));setL(false);return;}
    ctrl.current?.abort();ctrl.current=new AbortController();
    setL(true);setE(null);
    fetch(url,{signal:ctrl.current.signal})
      .then(r=>r.ok?r.json():r.json().then(e=>{const msg=typeof e.detail==='object'?JSON.stringify(e.detail):(e.detail||'API error');throw new Error(msg);}))
      .then(d=>{console.log('API response:',url,d);if(d?.detail)console.log('API error detail:',d.detail);fetchCache.set(url,d);setD(d);setL(false);})
      .catch(e=>{if(e.name!=='AbortError'){setE(e.message);setL(false);}});
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
   DESIGN TOKENS
═══════════════════════════════════════════════════ */
const D = {
  bg:'#0a0f1a', s1:'#0d1424', s2:'#111b2e', s3:'#162238', s4:'#1c2d47',
  b0:'#1a2d44', b1:'#223852', b2:'#2d4d6e', b3:'#3d6488',
  t0:'#eaf4ff', t1:'#bdd6f2', t2:'#84aace', t3:'#506e88', t4:'#2d4560',
  cyan:'#1ab8e8', green:'#00d68f', red:'#ff4d6d', amber:'#f0b429', orange:'#ff7b39', purple:'#a78bfa',
  mBS:'#1ab8e8', mBinom:'#00d68f', mMC:'#ff7b39', mMkt:'#f0b429',
};
const MONO    = '"JetBrains Mono","Fira Code","Consolas",monospace';
const DISPLAY = '"Share Tech Mono","Courier New",monospace';
const TTP = {background:D.s1,border:`1px solid ${D.b2}`,fontFamily:MONO,fontSize:11,color:D.t0,borderRadius:2,padding:'8px 12px'};

/* ═══════════════════════════════════════════════════
   TOOLTIP SYSTEM
═══════════════════════════════════════════════════ */
const TIPS = {
  delta:'Δ Delta: How much the option price changes per $1 move in the stock. Call Δ ∈ [0,1]. Put Δ ∈ [-1,0]. ATM options have Δ ≈ ±0.5.',
  gamma:'Γ Gamma: Rate of change of Delta. High near expiry and ATM — a $1 stock move causes a large Δ shift.',
  vega:'ν Vega: Price change per 1% rise in implied volatility. All long options have positive Vega.',
  theta:'Θ Theta: Price decay per calendar day. Long options lose value as time passes — always negative for buyers.',
  rho:'ρ Rho: Price change per 1% rise in the risk-free rate. Calls benefit, puts suffer when rates rise.',
  nd2:'N(d₂): Risk-neutral probability the option expires in-the-money. Not the same as the real-world probability.',
  iv:'Implied Vol: The volatility σ that makes the BS formula match the market price. Higher IV = more expensive option = more fear.',
  alpha:'α Edge: BS theoretical price minus market mid price. Positive = BS says option is cheap. Negative = market charges a premium BS cannot explain.',
  bs:'Black-Scholes-Merton (1973): Closed-form analytical solution. Assumes constant vol, continuous trading, no jumps. Nobel Prize 1997.',
  binom:'CRR Binomial Tree (Cox-Ross-Rubinstein 1979): Discrete price lattice. Supports American early exercise. Converges to BS as steps → ∞.',
  mc:'Monte Carlo (Boyle 1977): Simulates 20,000 GBM price paths with antithetic variance reduction. 95% CI shows simulation uncertainty.',
  surface:'Vol Surface: Implied vol plotted across all strikes and expiries. A flat surface = BS is correct. Reality shows a skew/smile revealing crash risk and term structure.',
  eep:'Early Exercise Premium: The extra value of being able to exercise before expiry (American vs European). Only Binomial captures this. Positive = exercise early has value.',
};

function Tip({children,tip,color=D.cyan}){
  const[show,setShow]=useState(false),[pos,setPos]=useState({x:0,y:0});
  return(
    <span style={{position:'relative',display:'inline-flex',alignItems:'center',gap:4}}
      onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setPos({x:Math.min(r.left,window.innerWidth-300),y:r.bottom+8});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      {children}
      <span style={{width:14,height:14,borderRadius:'50%',background:`${color}20`,border:`1px solid ${color}45`,
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        fontFamily:MONO,fontSize:8,color,cursor:'help',flexShrink:0}}>?</span>
      {show&&(
        <div style={{position:'fixed',left:pos.x,top:pos.y,width:280,padding:'12px 14px',
          background:D.s1,border:`1px solid ${color}50`,
          boxShadow:`0 12px 40px #000a, 0 0 0 1px ${color}20`,
          fontFamily:MONO,fontSize:10,color:D.t1,lineHeight:1.8,zIndex:9999,pointerEvents:'none'}}>
          <div style={{color,fontSize:9,letterSpacing:1,marginBottom:6,borderBottom:`1px solid ${color}30`,paddingBottom:4}}>{tip.split(':')[0]}</div>
          {tip.split(':').slice(1).join(':')}
        </div>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════════════ */
function Badge({children,color=D.cyan,size=9}){
  return <span style={{fontFamily:MONO,fontSize:size-2,padding:'3px 8px',letterSpacing:1.5,
    background:`${color}18`,color,border:`1px solid ${color}38`,textTransform:'uppercase'}}>{children}</span>;
}
function CtxBar({text,color=D.t3}){
  return <div style={{padding:'7px 18px',background:`${color}08`,borderBottom:`1px solid ${color}18`,
    fontFamily:MONO,fontSize:10,color,letterSpacing:.3,lineHeight:1.7}}>{text}</div>;
}
function Spin({label='LOADING'}){
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:64,flexDirection:'column'}}>
    <div style={{width:36,height:36,border:`2px solid ${D.b2}`,borderTop:`2px solid ${D.cyan}`,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
    <span style={{fontFamily:MONO,fontSize:10,color:D.t3,letterSpacing:3}}>{label}</span>
  </div>;
}
function Err({msg,retry}){
  const msgStr=typeof msg==='object'?JSON.stringify(msg):msg;
  return <div style={{margin:16,padding:'14px 18px',fontFamily:MONO,fontSize:10,color:D.red,
    background:`${D.red}0c`,border:`1px solid ${D.red}28`,lineHeight:1.8}}>
    <div style={{marginBottom:6}}>⚠ {msgStr}</div>
    {msg?.includes('Too Many Requests')&&(
      <div style={{color:D.t2,fontSize:9}}>Data unavailable. Try again in a moment, or try a different ticker (AAPL, MSFT, TSLA).</div>
    )}
    {retry&&<button onClick={retry} style={{marginTop:8,fontFamily:MONO,fontSize:9,padding:'4px 12px',
      background:`${D.cyan}15`,border:`1px solid ${D.cyan}40`,color:D.cyan,cursor:'pointer'}}>↺ RETRY</button>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   NUMERIC INPUT — slider + clickable number
═══════════════════════════════════════════════════ */
function NumInput({label,val,set,min,max,step,fmt,color=D.cyan}){
  const[editing,setEditing]=useState(false);
  const[raw,setRaw]=useState('');
  const pct=((val-min)/(max-min)*100).toFixed(1);

  const commit=str=>{
    const n=parseFloat(str);
    if(!isNaN(n))set(Math.min(max,Math.max(min,n)));
    setEditing(false);
  };

  return(
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{fontFamily:MONO,fontSize:10,color:D.t2,letterSpacing:1}}>{label}</span>
        {editing?(
          <input autoFocus value={raw}
            onChange={e=>setRaw(e.target.value)}
            onBlur={e=>commit(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')commit(e.target.value);if(e.key==='Escape')setEditing(false);}}
            style={{fontFamily:MONO,fontSize:12,color:color,background:D.s3,
              border:`1px solid ${color}`,padding:'2px 8px',width:90,textAlign:'right',outline:'none'}}/>
        ):(
          <span onClick={()=>{setRaw(String(val));setEditing(true);}}
            style={{fontFamily:MONO,fontSize:13,color:D.t0,fontWeight:'bold',cursor:'text',
              padding:'2px 8px',borderBottom:`1px dashed ${D.b2}`,letterSpacing:.5,
              transition:'border-color .15s'}}
            onMouseEnter={e=>e.target.style.borderColor=color}
            onMouseLeave={e=>e.target.style.borderColor=D.b2}
            title="Click to type exact value">
            {fmt(val)}
          </span>
        )}
      </div>
      <div style={{position:'relative',height:3,background:D.s4,borderRadius:2,marginBottom:2}}>
        <div style={{height:'100%',background:`linear-gradient(90deg,${color}80,${color})`,
          borderRadius:2,width:`${pct}%`,transition:'width .05s'}}/>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{width:'100%',appearance:'none',WebkitAppearance:'none',
          height:3,background:'transparent',cursor:'pointer',display:'block',marginTop:-3,position:'relative'}}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TOP BAR
═══════════════════════════════════════════════════ */
function TopBar({ticker,onLoad,apiLive,time}){
  const[q,setQ]=useState(ticker),[sugg,setSugg]=useState([]),[open,setOpen]=useState(false);
  useEffect(()=>{
    if(!q||q.toUpperCase()===ticker){setSugg([]);return;}
    fetch(`${API}/api/search?q=${q}`).then(r=>r.json()).then(d=>setSugg(d.results||[])).catch(()=>{});
  },[q]);
  const go=t=>{const u=t.toUpperCase();onLoad(u);setQ(u);setOpen(false);setSugg([]);};
  return(
    <div style={{height:50,display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'0 24px',background:D.s1,borderBottom:`1px solid ${D.b1}`,
      position:'relative',zIndex:100,flexShrink:0}}>
      {/* Brand */}
      <div style={{display:'flex',alignItems:'center',gap:18}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{position:'relative',width:24,height:24,flexShrink:0}}>
            <div style={{position:'absolute',inset:0,border:`1.5px solid ${D.cyan}60`,transform:'rotate(45deg)'}}/>
            <div style={{position:'absolute',inset:5,background:D.cyan,transform:'rotate(45deg)'}}/>
          </div>
          <div>
            <div style={{fontFamily:DISPLAY,fontSize:13,color:D.t0,letterSpacing:5,lineHeight:1}}>OPTIONVAL</div>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:2}}>QUANTITATIVE PRICING ENGINE</div>
          </div>
        </div>
        <div style={{width:1,height:26,background:D.b1}}/>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:apiLive?D.green:D.red,
            boxShadow:apiLive?`0 0 10px ${D.green}90`:'none',animation:apiLive?'glow 2s infinite':'none'}}/>
          <span style={{fontFamily:MONO,fontSize:9,color:apiLive?D.green:D.red,letterSpacing:.5}}>
            {apiLive?'LIVE MARKET DATA':'API OFFLINE'}
          </span>
        </div>
      </div>
      {/* Search */}
      <div style={{position:'relative',display:'flex',alignItems:'center'}}>
        <span style={{fontFamily:MONO,fontSize:9,color:D.t3,padding:'0 12px',letterSpacing:2}}>TICKER</span>
        <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}}
          onKeyDown={e=>e.key==='Enter'&&go(q)} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),180)}
          placeholder="AAPL · TSLA · NVDA · MSFT"
          style={{fontFamily:DISPLAY,fontSize:15,color:D.t0,background:D.s2,
            border:`1px solid ${D.b2}`,borderRight:'none',padding:'9px 14px',width:240,letterSpacing:1.5}}/>
        <button onClick={()=>go(q)} style={{fontFamily:MONO,fontSize:9,padding:'9px 22px',cursor:'pointer',
          background:D.cyan,border:'none',color:D.bg,letterSpacing:2,fontWeight:'bold'}}
          onMouseEnter={e=>e.target.style.opacity='.85'} onMouseLeave={e=>e.target.style.opacity='1'}>
          LOAD ▶
        </button>
        {open&&sugg.length>0&&(
          <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,
            background:D.s1,border:`1px solid ${D.b2}`,zIndex:200,boxShadow:`0 16px 48px #000a`}}>
            {sugg.map(s=>(
              <div key={s.ticker} onMouseDown={()=>go(s.ticker)}
                style={{padding:'10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,borderBottom:`1px solid ${D.b0}`}}
                onMouseEnter={e=>e.currentTarget.style.background=D.s3}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontFamily:DISPLAY,fontSize:14,color:D.cyan,minWidth:90}}>{s.ticker}</span>
                <span style={{fontFamily:MONO,fontSize:9,color:D.t2,flex:1}}>{s.name}</span>
                <Badge color={D.amber}>{s.market}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2}}>
        <span style={{fontFamily:MONO,fontSize:9,color:D.t3}}>{time}</span>
        <span style={{fontFamily:MONO,fontSize:8,color:D.t4,letterSpacing:.5}}>🇺🇸 US stocks only — international markets coming soon</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   QUOTE STRIP
═══════════════════════════════════════════════════ */
function QuoteStrip({q,loading,onRetry}){
  const price=useAnim(q?.price||0);
  if(loading)return <div style={{height:68,background:D.s1,borderBottom:`1px solid ${D.b1}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}><Spin label="FETCHING MARKET DATA"/></div>;
  if(!q)return(
    <div style={{padding:'14px 24px',background:D.s1,borderBottom:`1px solid ${D.b1}`,flexShrink:0,
      display:'flex',alignItems:'center',gap:14}}>
      <span style={{fontFamily:MONO,fontSize:10,color:D.t3,letterSpacing:1}}>
        ↑ Load any ticker to see live market data and options chain
      </span>
      {['AAPL','TSLA','NVDA','MSFT'].map(t=>(
        <button key={t} onClick={()=>onRetry(t)} style={{fontFamily:MONO,fontSize:9,padding:'4px 10px',
          cursor:'pointer',background:`${D.cyan}12`,border:`1px solid ${D.cyan}30`,color:D.cyan,letterSpacing:1}}>{t}</button>
      ))}
    </div>
  );
  const up=q.change>=0;
  return(
    <div style={{display:'flex',alignItems:'stretch',background:D.s1,borderBottom:`1px solid ${D.b1}`,height:68,flexShrink:0,
      backgroundImage:`linear-gradient(135deg,${D.cyan}07 0%,transparent 40%)`}}>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',
        borderRight:`1px solid ${D.b1}`,minWidth:230}}>
        <div style={{fontFamily:DISPLAY,fontSize:21,color:D.t0,letterSpacing:3}}>{q.ticker}</div>
        <div style={{fontFamily:MONO,fontSize:9,color:D.t2,marginTop:2}}>{q.flag} {q.exchange} · {q.name}</div>
      </div>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${D.b1}`}}>
        <div style={{fontFamily:DISPLAY,fontSize:28,color:D.t0,letterSpacing:1}}>{q.currency==='INR'?'₹':'$'}{price.toFixed(2)}</div>
        <div style={{fontFamily:MONO,fontSize:11,color:up?D.green:D.red,marginTop:1}}>
          {up?'▲':'▼'} {Math.abs(q.change).toFixed(2)} ({Math.abs(q.change_pct).toFixed(2)}%) TODAY
        </div>
      </div>
      {[
        ['30D HIST VOL',`${(q.hist_vol_30d*100).toFixed(1)}%`,D.orange,TIPS.iv],
        ['RISK-FREE r',`${(q.risk_free_rate*100).toFixed(2)}%`,D.t1,null],
        ['DIV YIELD q',`${(q.dividend_yield*100).toFixed(2)}%`,D.t1,null],
        ['MKT CAP',(()=>{const mc=q.market_cap;if(!mc||mc===0)return'N/A';if(mc>=1e12)return`$${(mc/1e12).toFixed(2)}T`;if(mc>=1e9)return`$${(mc/1e9).toFixed(1)}B`;if(mc>=1e6)return`$${(mc/1e6).toFixed(0)}M`;return`$${mc.toLocaleString()}`;})(),D.t0,null],
        ['SECTOR',q.sector||'—',D.t1,null],
      ].map(([k,v,c,tip])=>(
        <div key={k} style={{padding:'0 18px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${D.b0}`}}>
          <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:1.5,marginBottom:4}}>
            {tip?<Tip tip={tip} color={c}>{k}</Tip>:k}
          </div>
          <div style={{fontFamily:MONO,fontSize:13,color:c}}>{v}</div>
        </div>
      ))}
    </div>
  );
}


function VolHeatmap({data}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!data||!ref.current)return;
    const{expiries=[],strikes=[],iv_grid=[]}=data;
    if(!expiries.length)return;
    const canvas=ref.current,ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height,pL=70,pB=50,pT=20,pR=20;
    const cW=W-pL-pR,cH=H-pT-pB;
    ctx.clearRect(0,0,W,H);
    const ivFlat=iv_grid.flat().filter(v=>v&&!isNaN(v));
    const ivMin=Math.min(...ivFlat),ivMax=Math.max(...ivFlat);
    const cw=cW/strikes.length,ch=cH/expiries.length;
    function ivCol(iv){
      const t=Math.max(0,Math.min(1,(iv-ivMin)/(ivMax-ivMin||1)));
      if(t<0.25)return`rgb(${Math.round(10+t*4*20)},${Math.round(30+t*4*80)},${Math.round(130+t*4*70)})`;
      if(t<0.5){const s=(t-.25)/.25;return`rgb(${Math.round(20+s*100)},${Math.round(150-s*20)},${Math.round(200-s*160)})`;}
      if(t<0.75){const s=(t-.5)/.25;return`rgb(${Math.round(120+s*120)},${Math.round(130-s*100)},${Math.round(40)})`;}
      const s=(t-.75)/.25;return`rgb(240,${Math.round(30+s*10)},20)`;
    }
    for(let j=0;j<expiries.length;j++)for(let i=0;i<strikes.length;i++){
      const iv=iv_grid[j]&&iv_grid[j][i];if(iv==null||isNaN(iv))continue;
      ctx.fillStyle=ivCol(iv);ctx.fillRect(pL+i*cw,pT+j*ch,cw+1,ch+1);
    }
    ctx.strokeStyle='rgba(20,50,80,0.3)';ctx.lineWidth=.5;
    strikes.forEach((_,i)=>{ctx.beginPath();ctx.moveTo(pL+i*cw,pT);ctx.lineTo(pL+i*cw,pT+cH);ctx.stroke();});
    expiries.forEach((_,j)=>{ctx.beginPath();ctx.moveTo(pL,pT+j*ch);ctx.lineTo(pL+cW,pT+j*ch);ctx.stroke();});
    ctx.fillStyle='#6090b0';ctx.font=`10px ${MONO}`;ctx.textAlign='center';
    const sStep=Math.max(1,Math.floor(strikes.length/7));
    strikes.forEach((s,i)=>{if(i%sStep===0)ctx.fillText(`$${s}`,pL+i*cw+cw/2,H-14);});
    ctx.textAlign='right';ctx.textBaseline='middle';
    expiries.forEach((e,j)=>{ctx.fillText(e,pL-6,pT+j*ch+ch/2);});
    const gx=pL,gy=pT+cH+28,gw=cW,gh=7;
    const grad=ctx.createLinearGradient(gx,0,gx+gw,0);
    grad.addColorStop(0,'rgb(10,30,130)');grad.addColorStop(.35,'rgb(20,150,200)');
    grad.addColorStop(.65,'rgb(200,100,20)');grad.addColorStop(1,'rgb(240,30,20)');
    ctx.fillStyle=grad;ctx.fillRect(gx,gy,gw,gh);
    ctx.fillStyle='#6090b0';ctx.font=`9px ${MONO}`;ctx.textBaseline='top';
    ctx.textAlign='left';ctx.fillText(`${ivMin.toFixed(0)}% LOW IV`,gx,gy+gh+4);
    ctx.textAlign='right';ctx.fillText(`HIGH IV ${ivMax.toFixed(0)}%`,gx+gw,gy+gh+4);
    ctx.textAlign='center';ctx.fillText('← STRIKE PRICE →',gx+gw/2,gy+gh+4);
  },[data]);
  return <canvas ref={ref} width={800} height={520} style={{width:'100%',height:'auto'}}/>;
}

/* ═══════════════════════════════════════════════════
   ERROR BOUNDARY — prevents chart crash from white-screening the app
═══════════════════════════════════════════════════ */
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(error){return{hasError:true,error};}
  render(){
    if(this.state.hasError){
      return(
        <div style={{padding:'40px',color:'#ff6b6b',fontFamily:'"JetBrains Mono","Fira Code","Consolas",monospace'}}>
          <p>⚠ Chart render error: {this.state.error?.message}</p>
          <p style={{color:'#666',fontSize:'12px'}}>Try selecting a different expiry with more time remaining.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════════
   VOL SURFACE PANEL
═══════════════════════════════════════════════════ */
function VolSurfacePanel({ticker}){
  const{data,loading,error}=useFetch(ticker?`${API}/api/surface/${ticker}`:null);
  const[mode,setMode]=useState('heatmap');
  if(loading)return <Spin label="FETCHING ALL EXPIRIES — BUILDING SURFACE"/>;
  if(error)return <Err msg={error}/>;
  if(!data)return null;

  // Guard: empty after near-expiry filtering (backend sets surface=[] with message field)
  const validPoints=(data.surface||[]).filter(p=>p.days>0&&p.T>=0.003);
  if(validPoints.length===0){
    return(
      <div style={{padding:'40px',textAlign:'center',fontFamily:D.MONO||'"JetBrains Mono",monospace'}}>
        <p style={{color:D.amber,fontSize:13}}>Vol Surface requires options with more than 1 day to expiry.</p>
        <p style={{color:D.t3,fontSize:11}}>Select a later expiry to view the surface.</p>
        {data.message&&<p style={{color:D.t4,fontSize:10,marginTop:8}}>{data.message}</p>}
      </div>
    );
  }

  const ivFlat=(data.iv_grid||[[]]).flat().filter(Boolean);
  const ivMin=ivFlat.length?Math.min(...ivFlat).toFixed(1):'—';
  const ivMax=ivFlat.length?Math.max(...ivFlat).toFixed(1):'—';
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:3,marginBottom:4}}>
            <Tip tip={TIPS.surface} color={D.orange}>IMPLIED VOLATILITY SURFACE</Tip>
          </div>
          <div style={{fontFamily:MONO,fontSize:11,color:D.t1}}>
            {ticker} · {data.expiries?.length} expiries · {data.strikes?.length} strikes · colour = IV level
          </div>
        </div>
        <div style={{display:'flex',gap:2}}>
          {[['heatmap','⊞ HEATMAP']].map(([id,label])=>(
            <button key={id} onClick={()=>setMode(id)} style={{
              fontFamily:MONO,fontSize:9,padding:'7px 14px',cursor:'pointer',letterSpacing:1,
              background:mode===id?D.orange:`transparent`,border:`1px solid ${mode===id?D.orange:D.b2}`,
              color:mode===id?D.bg:D.t3,fontWeight:mode===id?'bold':'normal'}}>{label}</button>
          ))}
        </div>
      </div>
      <CtxBar text="Strike (x) × Expiry (y) × Implied Vol (colour). A flat surface = BS is correct. The skew you see — OTM puts higher than OTM calls — is the market pricing crash risk that BS ignores." color={D.orange}/>
      <div style={{background:D.s2,border:`1px solid ${D.b1}`,overflow:'hidden'}}>
        <ErrorBoundary>
          <VolHeatmap data={data}/>
        </ErrorBoundary>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:D.b0}}>
        {[
          ['EXPIRIES LOADED',data.expiries?.length,D.t0],
          ['STRIKE RANGE',`$${data.strikes?.[0]}–$${data.strikes?.[data.strikes.length-1]}`,D.t1],
          ['IV RANGE',`${ivMin}%–${ivMax}%`,D.orange],
          ['SKEW TYPE','Put > Call IV',D.red],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:D.s2,padding:'14px 18px'}}>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:2,marginBottom:5}}>{k}</div>
            <div style={{fontFamily:DISPLAY,fontSize:17,color:c,fontWeight:'bold'}}>{v??'—'}</div>
          </div>
        ))}
      </div>
      <div style={{padding:'16px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
        <div style={{fontFamily:MONO,fontSize:10,color:D.t2,lineHeight:2}}>
          <strong style={{color:D.t0}}>Why the surface matters:</strong> BS assumes one flat σ for all strikes and expiries. Real markets show a <strong style={{color:D.orange}}>skew</strong> (OTM puts price higher IV — crash premium) and <strong style={{color:D.orange}}>term structure</strong> (short-term vol ≠ long-term vol). Practitioners use Heston or SABR stochastic vol models to fit this surface exactly.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   METHODOLOGY PANEL
═══════════════════════════════════════════════════ */
function Methodology(){
  const Section=({color=D.t3,label,children})=>(
    <div style={{marginBottom:4}}>
      <div style={{fontFamily:MONO,fontSize:8,color,letterSpacing:3,marginBottom:10,paddingBottom:6,borderBottom:`1px solid ${D.b1}`}}>{label}</div>
      {children}
    </div>
  );
  return(
    <div style={{padding:24,display:'flex',flexDirection:'column',gap:24,maxWidth:960,overflowY:'auto'}}>

      {/* ── OVERVIEW ── */}
      <Section color={D.cyan} label="01 · OVERVIEW">
        <div style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.cyan}`}}>
          <div style={{fontFamily:MONO,fontSize:11,color:D.t1,lineHeight:2,marginBottom:10}}>
            OptionVal is a full-stack options valuation engine. Live market data flows from the Massive.com REST API through a FastAPI backend into a React frontend where three pricing models run entirely client-side — no round-trips needed for model prices.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1,background:D.b0}}>
            {[
              ['ARCHITECTURE','FastAPI (Python) · React · Vercel · Render'],
              ['MODELS','Black-Scholes · Binomial CRR · Monte Carlo GBM'],
              ['IV SOLVER','Newton-Raphson · Brenner-Subrahmanyam seed'],
            ].map(([k,v])=>(
              <div key={k} style={{background:D.s2,padding:'10px 14px'}}>
                <div style={{fontFamily:MONO,fontSize:8,color:D.t4,letterSpacing:2,marginBottom:4}}>{k}</div>
                <div style={{fontFamily:MONO,fontSize:9,color:D.t2,lineHeight:1.7}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── DATA SOURCES ── */}
      <Section color={D.green} label="02 · DATA SOURCES">
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[
            {badge:'🟢 LIVE',color:D.green,title:'Market Quotes & Options Chain',
              desc:'Stock price, OHLC, volume, and 30-day historical volatility fetched from Massive.com REST API (real-time snapshot + daily bars). Option strikes and expiry dates sourced from Massive.com options reference contracts. Data is cached server-side (60s for quotes, 45s for chains).'},
            {badge:'🟡 THEORETICAL',color:D.amber,title:'Model Prices (BS / Binomial / MC)',
              desc:'Black-Scholes, Binomial CRR, and Monte Carlo prices are computed client-side in real time using the live spot, implied volatility, risk-free rate and time to expiry. They are not sourced from any exchange.'},
            {badge:'⚪ NOT AVAILABLE',color:D.t4,title:'Real-Time Tick Data · Level II Order Book',
              desc:'Intraday tick data and full order book depth require paid exchange subscriptions (Bloomberg Terminal, Refinitiv, CBOE DataShop). This engine uses free end-of-day / delayed quotes only.'},
          ].map(({badge,color,title,desc})=>(
            <div key={title} style={{padding:'12px 16px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${color}`,display:'flex',gap:14,alignItems:'flex-start'}}>
              <span style={{fontFamily:MONO,fontSize:8,color,background:`${color}12`,padding:'3px 8px',whiteSpace:'nowrap',marginTop:1,letterSpacing:1}}>{badge}</span>
              <div>
                <div style={{fontFamily:MONO,fontSize:10,color:D.t1,marginBottom:4,fontWeight:600}}>{title}</div>
                <div style={{fontFamily:MONO,fontSize:9,color:D.t3,lineHeight:1.8}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── PRICING MODELS ── */}
      <Section color={D.mBS} label="03 · PRICING MODELS">
        {[
          {color:D.mBS,label:'BLACK-SCHOLES-MERTON (1973)',
            ref:'Black, F. & Scholes, M. (1973). The Pricing of Options and Corporate Liabilities. Journal of Political Economy. Nobel Prize 1997.',
            formula:'C = S·e^(−qT)·N(d₁) − K·e^(−rT)·N(d₂)',
            points:['Closed-form analytical solution — exact for European-style options on dividend-paying stocks','Assumes constant volatility, log-normal returns, continuous frictionless trading','All five Greeks (Δ Γ ν Θ ρ) are derived analytically from the same formula','Key limitation: one flat σ for all strikes and expiries — the observed vol skew proves this wrong']},
          {color:D.mBinom,label:'COX-ROSS-RUBINSTEIN BINOMIAL TREE (1979)',
            ref:'Cox, J., Ross, S., Rubinstein, M. (1979). Option Pricing: A Simplified Approach. Journal of Financial Economics.',
            formula:'u = e^(σ√Δt),  d = 1/u,  p* = (e^((r−q)Δt) − d) / (u − d)',
            points:['Discrete recombining lattice with 150 time steps in this implementation','At each node, American early exercise is checked — value = max(intrinsic, continuation)','Converges to Black-Scholes price as steps → ∞ for European options','Early Exercise Premium (EEP) = Binomial − BS when positive; meaningful for deep ITM puts or high-dividend calls']},
          {color:D.mMC,label:'MONTE CARLO SIMULATION (Boyle 1977)',
            ref:'Boyle, P. (1977). Options: A Monte Carlo Approach. Journal of Financial Economics.',
            formula:'S(T) = S₀ · exp((r − q − σ²/2)T + σ√T · Z),  Z ~ N(0,1)',
            points:['20,000 Geometric Brownian Motion paths with antithetic variates (halves variance at zero cost)','95% confidence interval and standard error shown — direct measure of simulation uncertainty','Convergence rate: std error ∝ 1/√N — 4× paths halves the error band','Natural extension to path-dependent payoffs: barrier, Asian (average price), lookback options']},
        ].map(m=>(
          <div key={m.label} style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${m.color}`,marginBottom:8}}>
            <div style={{fontFamily:MONO,fontSize:9,color:m.color,letterSpacing:2,marginBottom:4}}>{m.label}</div>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t4,marginBottom:10,lineHeight:1.6}}>{m.ref}</div>
            <div style={{fontFamily:MONO,fontSize:10,color:D.amber,marginBottom:10,padding:'6px 10px',background:`${D.amber}08`,border:`1px solid ${D.amber}20`}}>{m.formula}</div>
            <ul style={{margin:0,paddingLeft:16}}>
              {m.points.map(p=><li key={p} style={{fontFamily:MONO,fontSize:9,color:D.t2,marginBottom:5,lineHeight:1.7}}>{p}</li>)}
            </ul>
          </div>
        ))}
      </Section>

      {/* ── THE GREEKS ── */}
      <Section color={D.cyan} label="04 · THE GREEKS">
        <div style={{fontFamily:MONO,fontSize:9,color:D.t3,marginBottom:12,lineHeight:1.8}}>
          Greeks measure sensitivity of an option's price to changes in inputs. All values are computed analytically from Black-Scholes — exact, not approximated. They are recomputed instantly as you move any slider.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
          {[
            {g:'Δ DELTA',c:D.cyan,   formula:'∂C/∂S',  range:'0 to 1 (call) · −1 to 0 (put)',
              explain:'How much the option price changes for a $1 move in the stock. Delta ≈ probability the option expires ITM (risk-neutral). ATM options ≈ 0.50. Deep ITM → 1.0. Deep OTM → 0.'},
            {g:'Γ GAMMA',c:D.green,  formula:'∂²C/∂S²',range:'Always positive · peaks ATM',
              explain:'Rate of change of Delta. Highest near expiry for ATM options — the option becomes most sensitive to stock moves. Gamma risk is the core risk for option sellers.'},
            {g:'ν VEGA', c:D.orange, formula:'∂C/∂σ',  range:'Always positive (long options)',
              explain:'Price change per 1% increase in implied volatility. Long options always benefit from rising vol. Quoted per 100 vol points in practice. Highest for ATM long-dated options.'},
            {g:'Θ THETA',c:D.red,    formula:'∂C/∂t',  range:'Usually negative (long options)',
              explain:'Time decay — how much the option loses per calendar day as expiry approaches. Shown per day. Theta and Gamma are a natural trade-off: high Gamma means fast Theta bleed.'},
            {g:'ρ RHO',  c:D.purple, formula:'∂C/∂r',  range:'Positive (call) · Negative (put)',
              explain:'Price sensitivity to interest rates. Rho matters most for long-dated options and when rate moves are large. Less relevant for short-dated contracts and near-zero rate environments.'},
            {g:'N(d₂)', c:D.amber,  formula:'Φ(d₂)',   range:'0 to 1',
              explain:'Risk-neutral probability the option expires in-the-money. Not the same as the real-world probability — it uses the risk-free rate as the drift, not the expected stock return.'},
          ].map(({g,c,formula,range,explain})=>(
            <div key={g} style={{padding:'12px 14px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`2px solid ${c}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontFamily:MONO,fontSize:10,color:c,fontWeight:600}}>{g}</span>
                <span style={{fontFamily:MONO,fontSize:9,color:D.amber,background:`${D.amber}10`,padding:'2px 7px'}}>{formula}</span>
              </div>
              <div style={{fontFamily:MONO,fontSize:8,color:D.t4,marginBottom:5,letterSpacing:0.5}}>{range}</div>
              <div style={{fontFamily:MONO,fontSize:9,color:D.t3,lineHeight:1.7}}>{explain}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── VOLATILITY ── */}
      <Section color={D.orange} label="05 · VOLATILITY & THE SMILE">
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.orange,letterSpacing:2,marginBottom:8}}>IMPLIED VOLATILITY (IV)</div>
            <div style={{fontFamily:MONO,fontSize:9,color:D.t2,lineHeight:1.9}}>
              IV is the market's forecast of future volatility — it is not observed directly but <em>solved for</em> by inverting the Black-Scholes formula given the market option price. This engine uses a Newton-Raphson solver seeded with the Brenner-Subrahmanyam approximation, converging in typically 3–5 iterations to 10⁻¹¹ precision.
            </div>
          </div>
          <div style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.orange,letterSpacing:2,marginBottom:8}}>THE VOL SMILE & SKEW</div>
            <div style={{fontFamily:MONO,fontSize:9,color:D.t2,lineHeight:1.9}}>
              Black-Scholes assumes one constant σ for all strikes. Real markets show a <strong style={{color:D.orange}}>skew</strong>: OTM puts trade at higher IV than OTM calls. This reflects crash risk asymmetry — institutions pay a premium for downside protection. The 3D surface tab shows this across all expiries simultaneously.
            </div>
          </div>
          <div style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.orange,letterSpacing:2,marginBottom:8}}>TERM STRUCTURE</div>
            <div style={{fontFamily:MONO,fontSize:9,color:D.t2,lineHeight:1.9}}>
              Short-dated IV ≠ long-dated IV. Near-term vol rises around earnings or events (event vol). Long-dated vol tends to mean-revert toward a long-run average. The vol surface captures both dimensions: strike (skew) and time (term structure). Practitioners use Heston or SABR stochastic-vol models to fit this surface exactly.
            </div>
          </div>
        </div>
      </Section>

      {/* ── LIMITATIONS & ROADMAP ── */}
      <Section color={D.red} label="06 · LIMITATIONS & ROADMAP">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div style={{padding:'14px 18px',background:`${D.red}08`,border:`1px solid ${D.red}28`,borderLeft:`3px solid ${D.red}`}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.red,letterSpacing:2,marginBottom:10}}>CURRENT LIMITATIONS</div>
            <ul style={{margin:0,paddingLeft:16}}>
              {[
                'Massive.com data is based on previous-day close (end-of-day snapshot)',
                'Black-Scholes assumes constant vol — the skew shows this is wrong',
                'No path-dependent payoffs (barrier, Asian, lookback) in live chain',
                'IV solver returns null for deep OTM / very short-dated options where Newton-Raphson diverges',
                'No real-time streaming — prices update on page load or manual refresh',
                'US equities only — no FX, rates, or commodity options',
              ].map(p=><li key={p} style={{fontFamily:MONO,fontSize:9,color:D.t2,marginBottom:5,lineHeight:1.7}}>{p}</li>)}
            </ul>
          </div>
          <div style={{padding:'14px 18px',background:`${D.green}08`,border:`1px solid ${D.green}28`,borderLeft:`3px solid ${D.green}`}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.green,letterSpacing:2,marginBottom:10}}>ROADMAP</div>
            <ul style={{margin:0,paddingLeft:16}}>
              {[
                'Heston stochastic-vol model to fit the full IV surface',
                'SABR model for smile interpolation and extrapolation',
                'Bjerksund-Stensland closed-form American option approximation',
                'Portfolio Greeks aggregation across multiple contracts',
                'WebSocket streaming for real-time price updates',
                'Earnings IV term structure spike detection',
              ].map(p=><li key={p} style={{fontFamily:MONO,fontSize:9,color:D.t2,marginBottom:5,lineHeight:1.7}}>{p}</li>)}
            </ul>
          </div>
        </div>
        {/* Validation */}
        <div style={{marginTop:8,padding:'14px 18px',background:`${D.green}0c`,border:`1px solid ${D.green}28`,borderLeft:`3px solid ${D.green}`}}>
          <div style={{fontFamily:MONO,fontSize:9,color:D.green,letterSpacing:2,marginBottom:10}}>✓ VALIDATED RESULTS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[
              ['Hull Example 19.1','Reproduced to 4 decimal places — S=$42, K=$40, T=0.5yr, r=10%, σ=20%'],
              ['Put-Call Parity','Parity error: 3.55×10⁻¹⁵ — essentially machine precision'],
              ['IV Round-Trip','Solve IV from BS price, reprice — error: 1.13×10⁻¹¹'],
              ['Binomial Convergence','150-step CRR converges to BS within 0.01% for European options'],
            ].map(([k,v])=>(
              <div key={k} style={{padding:'10px 14px',background:D.s2}}>
                <div style={{fontFamily:MONO,fontSize:9,color:D.green,marginBottom:3}}>{k}</div>
                <div style={{fontFamily:MONO,fontSize:9,color:D.t2,lineHeight:1.6}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Stack */}
        <div style={{marginTop:8,padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`}}>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:2,marginBottom:10}}>TECHNICAL STACK</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {[
              ['Python Engine','Black-Scholes · Binomial CRR · Monte Carlo · Newton-Raphson IV solver · math.erf norm_cdf (no scipy)'],
              ['FastAPI Backend','Massive.com REST API · reference contracts endpoint · 60s quote cache · 45s chain cache · full error logging'],
              ['React Frontend','Client-side BS engine · Three.js vol surface · Recharts · Deployed on Vercel'],
            ].map(([k,v])=>(
              <div key={k} style={{padding:'10px 14px',background:D.s3}}>
                <div style={{fontFamily:MONO,fontSize:9,color:D.cyan,marginBottom:4}}>{k}</div>
                <div style={{fontFamily:MONO,fontSize:9,color:D.t3,lineHeight:1.7}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MODEL PRICER (Left Panel)
═══════════════════════════════════════════════════ */
function computeFreshT(expiryStr){
  // Options expire at 4:00 PM Eastern — use 21:00 UTC as conservative estimate
  const[year,month,day]=expiryStr.split('-').map(Number);
  const expiry=new Date(Date.UTC(year,month-1,day,21,0,0));
  return Math.max((expiry-Date.now())/(365.25*24*60*60*1000),0.0001);
}

function ModelPricer({defaultS,defaultR,defaultQ,selectedContract,onLoad}){
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
  useEffect(()=>{
    if(!selectedContract)return;
    setK(selectedContract.strike);
    setType(selectedContract.type);
    if(selectedContract.expiry){
      // Recompute T fresh from current time — avoids stale T causing $0.0000 prices/Greeks
      const freshT=computeFreshT(selectedContract.expiry);
      setTd(Math.max(Math.round(freshT*365),1));
    }else if(selectedContract.T){
      setTd(Math.round(selectedContract.T*365));
    }
  },[selectedContract]);

  const renderFreshT=selectedContract?.expiry?computeFreshT(selectedContract.expiry):null;
  const nearExpiry=renderFreshT!=null&&renderFreshT<0.003;

  const Ty=Td/365,ry=r/100,sy=σ/100,qy=q/100;
  const bsR=bs(S,K,Ty,ry,sy,qy,type);
  const binomR=useMemo(()=>binomCRR(S,K,Ty,ry,sy,qy,type,150),[S,K,Ty,ry,sy,qy,type]);
  const mcR=useMemo(()=>mcSim(S,K,Ty,ry,sy,qy,type,20000),[S,K,Ty,ry,sy,qy,type]);
  const convData=useMemo(()=>binomConv(S,K,Ty,ry,sy,qy,type),[S,K,Ty,ry,sy,qy,type]);

  const intrinsic=Math.max(type==='call'?S-K:K-S,0);
  const moneyness=type==='call'?(S>K*1.005?'ITM':S<K*0.995?'OTM':'ATM'):(K>S*1.005?'ITM':K<S*0.995?'OTM':'ATM');
  const mCol=moneyness==='ITM'?D.green:moneyness==='OTM'?D.red:D.amber;
  const mktPrice=selectedContract?.mid||null;
  const alpha=mktPrice!=null?bsR.price-mktPrice:null;
  const eep=binomR.price-bsR.price; // Early Exercise Premium

  const MODELS=[
    {id:'bs',    label:'BLACK-SCHOLES', sub:'Analytical · European', color:D.mBS,   price:bsR.price,   delta:bsR.delta, tip:'bs'},
    {id:'binom', label:'BINOMIAL CRR',  sub:'150-step · American',   color:D.mBinom,price:binomR.price, delta:null,      tip:'binom'},
    {id:'mc',    label:'MONTE CARLO',   sub:'20K paths · Antithetic',color:D.mMC,   price:mcR.price,   delta:null,      tip:'mc'},
  ];

  const GREEKS=[
    ['Δ DELTA', bsR.delta, D.cyan,   TIPS.delta, 'Price change / $1 stock move'],
    ['Γ GAMMA', bsR.gamma, D.green,  TIPS.gamma, 'Delta change rate'],
    ['ν VEGA',  bsR.vega,  D.orange, TIPS.vega,  'Price change / 1% vol'],
    ['Θ THETA', bsR.theta, D.red,    TIPS.theta, 'Price decay / day'],
    ['ρ RHO',   bsR.rho,   D.purple, TIPS.rho,   'Price change / 1% rate'],
    ['N(d₂)',   bsR.Nd2,   D.amber,  TIPS.nd2,   'Risk-neutral ITM prob'],
  ];

  return(
    <div style={{width:380,flexShrink:0,display:'flex',flexDirection:'column',
      borderRight:`1px solid ${D.b1}`,background:D.s1,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'11px 18px',borderBottom:`1px solid ${D.b1}`,
        background:`linear-gradient(90deg,${D.cyan}08,transparent)`,flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontFamily:MONO,fontSize:10,color:D.cyan,letterSpacing:3}}>MODEL PRICER</span>
          {selectedContract&&<Badge color={D.amber} size={9}>← CHAIN CONTRACT</Badge>}
        </div>
        <div style={{fontFamily:MONO,fontSize:9,color:D.t3,marginTop:3}}>
          {selectedContract
            ?`K=$${selectedContract.strike} · ${selectedContract.expiry} · ${selectedContract.type?.toUpperCase()}`
            :'Click any row in the Options Chain →'}
        </div>
        {nearExpiry&&(<span style={{fontSize:10,color:D.amber,border:`1px solid ${D.amber}`,padding:'2px 6px',marginLeft:'8px',fontFamily:MONO,display:'inline-block',marginTop:4}}>⚠ EXPIRING TODAY — Greeks unreliable</span>)}
      </div>

      <div style={{flex:1,overflowY:'auto',padding:16}}>
        {/* Call/Put */}
        <div style={{display:'flex',gap:2,marginBottom:16}}>
          {['call','put'].map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{flex:1,padding:'11px 0',cursor:'pointer',
              fontFamily:DISPLAY,fontSize:13,letterSpacing:3,
              background:type===t?(t==='call'?`${D.cyan}18`:`${D.red}18`):'transparent',
              borderBottom:type===t?`2px solid ${t==='call'?D.cyan:D.red}`:'2px solid transparent',
              color:type===t?(t==='call'?D.cyan:D.red):D.t3,
              border:`1px solid ${type===t?(t==='call'?D.cyan:D.red):D.b1}`}}>{t.toUpperCase()}</button>
          ))}
        </div>

        {/* Three model prices — stacked rows */}
        <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:14}}>
          {MODELS.map(m=>{
            const p=m.price;
            const anim=useAnim(p,300);
            return(
              <div key={m.id} onClick={()=>setActiveModel(m.id)} style={{
                padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',
                background:activeModel===m.id?`${m.color}10`:D.s2,
                border:`1px solid ${activeModel===m.id?m.color:D.b1}`,
                borderLeft:`3px solid ${m.color}`,transition:'all .2s'}}>
                <div>
                  <div style={{fontFamily:MONO,fontSize:9,color:m.color,letterSpacing:1.5,marginBottom:2}}>
                    <Tip tip={TIPS[m.tip]} color={m.color}>{m.label}</Tip>
                  </div>
                  <div style={{fontFamily:MONO,fontSize:9,color:D.t3}}>{m.sub}</div>
                  {m.delta!=null&&<div style={{fontFamily:MONO,fontSize:9,color:m.color,marginTop:3}}>Δ {m.delta>=0?'+':''}{m.delta.toFixed(4)}</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:DISPLAY,fontSize:22,color:D.t0,fontWeight:'bold'}}>${anim.toFixed(4)}</div>
                  {activeModel===m.id&&<div style={{fontFamily:MONO,fontSize:8,color:m.color,marginTop:2,letterSpacing:1}}>● SELECTED</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Early Exercise Premium */}
        {eep>0.005&&(
          <div style={{padding:'10px 14px',background:`${D.green}0c`,border:`1px solid ${D.green}28`,
            borderLeft:`3px solid ${D.green}`,marginBottom:14}}>
            <div style={{fontFamily:MONO,fontSize:9,color:D.green,letterSpacing:1,marginBottom:2}}>
              <Tip tip={TIPS.eep} color={D.green}>↑ EARLY EXERCISE PREMIUM</Tip>
            </div>
            <div style={{fontFamily:DISPLAY,fontSize:18,color:D.green,fontWeight:'bold'}}>+${eep.toFixed(4)}</div>
            <div style={{fontFamily:MONO,fontSize:9,color:D.t3,marginTop:2}}>Binomial captures American value that BS cannot</div>
          </div>
        )}

        {/* Market price + alpha */}
        {mktPrice!=null&&(
          <div style={{display:'flex',gap:2,marginBottom:14}}>
            <div style={{flex:1,padding:'10px 12px',background:`${D.amber}0c`,border:`1px solid ${D.amber}28`,borderTop:`2px solid ${D.amber}`}}>
              <div style={{fontFamily:MONO,fontSize:8,color:D.amber,letterSpacing:1.5,marginBottom:3}}>MARKET MID</div>
              <div style={{fontFamily:DISPLAY,fontSize:19,color:D.amber,fontWeight:'bold'}}>${mktPrice.toFixed(4)}</div>
              <div style={{fontFamily:MONO,fontSize:8,color:D.t3,marginTop:2}}>Live bid/ask midpoint</div>
            </div>
            <div style={{flex:1,padding:'10px 12px',
              background:`${alpha>0?D.green:D.red}08`,
              border:`1px solid ${(alpha>0?D.green:D.red)}25`,borderTop:`2px solid ${alpha>0?D.green:D.red}`}}>
              <div style={{fontFamily:MONO,fontSize:8,color:alpha>0?D.green:D.red,letterSpacing:1.5,marginBottom:3}}>
                <Tip tip={TIPS.alpha} color={alpha>0?D.green:D.red}>α EDGE</Tip>
              </div>
              <div style={{fontFamily:DISPLAY,fontSize:19,color:alpha>0?D.green:D.red,fontWeight:'bold'}}>{alpha>0?'+':''}{alpha.toFixed(4)}</div>
              <div style={{fontFamily:MONO,fontSize:8,color:D.t3,marginTop:2}}>{alpha>0?'BS overprices':'Mkt charges premium'}</div>
            </div>
          </div>
        )}

        {/* Moneyness + decomp */}
        <div style={{display:'flex',gap:2,marginBottom:14}}>
          <div style={{flex:1,padding:'9px 12px',background:D.s2,borderLeft:`2px solid ${mCol}`}}>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:1.5,marginBottom:3}}>MONEYNESS</div>
            <div style={{fontFamily:DISPLAY,fontSize:16,color:mCol,fontWeight:'bold'}}>{moneyness}</div>
            <div style={{fontFamily:MONO,fontSize:9,color:D.t3}}>S/K = {(S/K).toFixed(4)}</div>
          </div>
          <div style={{flex:1,padding:'9px 12px',background:D.s2,borderLeft:`2px solid ${D.t4}`}}>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:1.5,marginBottom:3}}>DECOMPOSITION</div>
            <div style={{fontFamily:MONO,fontSize:11,color:D.t1}}>Intr <span style={{color:D.t0}}>${intrinsic.toFixed(3)}</span></div>
            <div style={{fontFamily:MONO,fontSize:11,color:D.cyan}}>Time <span style={{color:D.cyan}}>${Math.max(bsR.price-intrinsic,0).toFixed(3)}</span></div>
          </div>
        </div>

        {/* MC CI */}
        <div style={{padding:'10px 14px',background:D.s2,borderLeft:`2px solid ${D.orange}`,marginBottom:16}}>
          <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:1.5,marginBottom:5}}>
            <Tip tip={TIPS.mc} color={D.orange}>MONTE CARLO 95% CI</Tip>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontFamily:MONO,fontSize:10,color:D.orange}}>[${mcR.ci95[0].toFixed(3)}, ${mcR.ci95[1].toFixed(3)}]</span>
            <span style={{fontFamily:MONO,fontSize:9,color:D.t3}}>σ={mcR.stderr.toFixed(4)}</span>
          </div>
          <div style={{height:4,background:D.s4,borderRadius:2,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',left:'15%',right:'15%',height:'100%',background:`${D.orange}45`,borderRadius:2}}/>
            <div style={{position:'absolute',left:'50%',top:0,width:2,height:'100%',background:D.cyan,transform:'translateX(-50%)'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
            <span style={{fontFamily:MONO,fontSize:8,color:D.t4}}>Lower 95%</span>
            <span style={{fontFamily:MONO,fontSize:8,color:D.cyan}}>↑ BS exact</span>
            <span style={{fontFamily:MONO,fontSize:8,color:D.t4}}>Upper 95%</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{display:'flex',marginBottom:12,gap:1}}>
          {[['greeks','GREEKS'],['convergence','CONVERGENCE'],['payoff','PAYOFF']].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'7px 0',cursor:'pointer',
              fontFamily:MONO,fontSize:9,letterSpacing:1,
              background:tab===id?`${D.cyan}15`:D.s2,
              borderBottom:tab===id?`2px solid ${D.cyan}`:'2px solid transparent',
              color:tab===id?D.cyan:D.t3,border:`1px solid ${D.b1}`}}>{label}</button>
          ))}
        </div>

        {/* GREEKS */}
        {tab==='greeks'&&(
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t4,letterSpacing:1.5,marginBottom:4}}>Computed · Black-Scholes analytical</div>
            {[[0,1],[2,3],[4,5]].map((pair,pi)=>(
              <div key={pi} style={{display:'flex',gap:3}}>
                {pair.map(gi=>{
                  const[k,v,c,tip,d]=GREEKS[gi];
                  return(
                    <div key={k} style={{flex:1,padding:'10px 12px',background:D.s2,borderLeft:`2px solid ${c}`}}>
                      <div style={{fontFamily:MONO,fontSize:8,color:D.t3,marginBottom:3}}>
                        <Tip tip={tip} color={c}>{k}</Tip>
                      </div>
                      <div style={{fontFamily:DISPLAY,fontSize:15,color:c,fontWeight:'bold'}}>{v.toFixed(5)}</div>
                      <div style={{fontFamily:MONO,fontSize:8,color:D.t4,marginTop:2}}>{d}</div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{padding:'9px 12px',background:D.s2,fontFamily:MONO,fontSize:9,color:D.t3,lineHeight:2}}>
              d₁ = <span style={{color:D.t1}}>{bsR.d1.toFixed(5)}</span>{'   '}d₂ = <span style={{color:D.t1}}>{bsR.d2.toFixed(5)}</span>
            </div>
          </div>
        )}

        {/* CONVERGENCE */}
        {tab==='convergence'&&(
          <div>
            <CtxBar text="Binomial → BS as steps → ∞. Gap above BS line = American early exercise premium." color={D.mBinom}/>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={convData} margin={{top:8,right:12,left:0,bottom:4}}>
                <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.5}/>
                <XAxis dataKey="steps" stroke={D.t3} tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} label={{value:'Steps n',fill:D.t3,fontFamily:MONO,fontSize:8,position:'insideBottom',offset:-2}}/>
                <YAxis stroke={D.t3} tick={{fontFamily:MONO,fontSize:9,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(2)}`} width={50}/>
                <Tooltip contentStyle={TTP} formatter={v=>[`$${v.toFixed(5)}`]}/>
                <ReferenceLine y={bsR.price} stroke={D.mBS} strokeDasharray="4 2" strokeWidth={1.5}
                  label={{value:'BS',fill:D.mBS,fontFamily:MONO,fontSize:9,position:'right'}}/>
                <Line type="monotone" dataKey="price" stroke={D.mBinom} strokeWidth={2} dot={{r:3,fill:D.mBinom}} name="Binomial"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* PAYOFF */}
        {tab==='payoff'&&(
          <div>
            <CtxBar text="Net P&L at expiry. Break-even = where line crosses zero." color={D.green}/>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={Array.from({length:80},(_,i)=>{const s=S*0.4+S*1.6*(i/79);return{S:parseFloat(s.toFixed(1)),pnl:parseFloat(((type==='call'?Math.max(s-K,0):Math.max(K-s,0))-bsR.price).toFixed(3))};})}>
                <defs><linearGradient id="pg7" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={D.green} stopOpacity={0.3}/><stop offset="95%" stopColor={D.green} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.4}/>
                <XAxis dataKey="S" stroke={D.t3} tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`$${v}`}/>
                <YAxis stroke={D.t3} tick={{fontFamily:MONO,fontSize:8,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(0)}`} width={40}/>
                <Tooltip contentStyle={TTP} formatter={v=>[`$${v.toFixed(3)}`,'P&L']} labelFormatter={v=>`S=$${v}`}/>
                <ReferenceLine y={0} stroke={D.b3} strokeWidth={1.5}/>
                <ReferenceLine x={K} stroke={D.amber} strokeDasharray="3 2" label={{value:'K',fill:D.amber,fontFamily:MONO,fontSize:9}}/>
                <ReferenceLine x={S} stroke={D.t3} strokeDasharray="2 2" label={{value:'S',fill:D.t3,fontFamily:MONO,fontSize:9}}/>
                <Area type="monotone" dataKey="pnl" stroke={D.green} fill="url(#pg7)" strokeWidth={2} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Parameters */}
        <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${D.b1}`}}>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:2,marginBottom:14}}>
            PARAMETERS — drag slider or click value to type
          </div>
          <NumInput label="SPOT  S"        val={S}  set={setS}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}  color={D.cyan}/>
          <NumInput label="STRIKE  K"      val={K}  set={setK}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}  color={D.cyan}/>
          <NumInput label="EXPIRY  T"      val={Td} set={setTd} min={1}   max={730}  step={1}    fmt={v=>`${v}d`}             color={D.amber}/>
          <NumInput label="VOLATILITY  σ"  val={σ}  set={setσ}  min={1}   max={200}  step={0.5}  fmt={v=>`${v.toFixed(1)}%`}  color={D.orange}/>
          <NumInput label="RISK-FREE  r"   val={r}  set={setR}  min={0}   max={20}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}  color={D.t1}/>
          <NumInput label="DIVIDEND  q"    val={q}  set={setQ}  min={0}   max={15}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}  color={D.t1}/>
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
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:14}}>
      <div style={{fontFamily:MONO,fontSize:32,color:D.t4,opacity:.5}}>⬡</div>
      <div style={{fontFamily:MONO,fontSize:11,color:D.t3,letterSpacing:2}}>LOAD A TICKER TO SEE LIVE OPTIONS</div>
      <div style={{fontFamily:MONO,fontSize:10,color:D.t4}}>Try: AAPL · TSLA · NVDA · MSFT · SPY</div>
    </div>
  );
  if(!chainData?.calls||!chainData?.puts)return <Err msg={`Unexpected response shape: ${JSON.stringify(chainData).slice(0,200)}`}/>;
  const contracts=(side==='calls'?chainData.calls:chainData.puts)||[];
  const sorted=[...contracts].sort((a,b)=>(a[sortKey]>b[sortKey]?1:-1)*sortDir);
  const cols=[
    {key:'strike',       label:'STRIKE',   fmt:v=>v.toFixed(2),align:'left',w:80},
    {key:'bid',          label:'BID',      fmt:v=>v.toFixed(2),w:65},
    {key:'ask',          label:'ASK',      fmt:v=>v.toFixed(2),w:65},
    {key:'mid',          label:'MID',      fmt:v=>v.toFixed(2),w:65},
    {key:'iv',           label:'IV %',     fmt:v=>v!=null?`${v.toFixed(1)}%`:'—',w:60,tip:TIPS.iv},
    {key:'bs_price',     label:'BS PRICE', fmt:v=>v.toFixed(3),w:80,tip:TIPS.bs},
    {key:'mispricing',   label:'α EDGE',   fmt:v=>`${v>0?'+':''}${v.toFixed(3)}`,w:76,tip:TIPS.alpha},
    {key:'greek_delta',  label:'Δ',        fmt:v=>`${v>0?'+':''}${v.toFixed(4)}`,w:74,tip:TIPS.delta},
    {key:'greek_gamma',  label:'Γ',        fmt:v=>v.toFixed(5),w:74,tip:TIPS.gamma},
    {key:'greek_theta',  label:'Θ/d',      fmt:v=>v.toFixed(5),w:74,tip:TIPS.theta},
    {key:'volume',       label:'VOL',      fmt:v=>v.toLocaleString(),w:66},
    {key:'open_interest',label:'OI',       fmt:v=>v.toLocaleString(),w:66},
    {key:'moneyness',    label:'',         fmt:v=>v,w:38},
  ];
  const rowBg=(row,isSel)=>{
    if(isSel)return`${D.cyan}18`;
    if(row.moneyness==='ITM')return`${D.green}07`;
    if(row.moneyness==='ATM')return`${D.amber}09`;
    return'transparent';
  };
  const cellCol=(c,row)=>{
    if(c.key==='strike')return Math.abs(row.strike-(spot||0))<(spot||1)*.005?D.amber:D.t0;
    if(c.key==='iv')return D.orange;
    if(c.key==='mispricing')return row.mispricing>.05?D.green:row.mispricing<-.05?D.red:D.t3;
    if(c.key==='greek_delta')return side==='calls'?D.cyan:D.red;
    if(c.key==='bs_price')return D.cyan;
    if(c.key==='moneyness')return row.moneyness==='ITM'?D.green:row.moneyness==='ATM'?D.amber:D.t4;
    return D.t2;
  };
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
      <CtxBar text="Click any row to load that contract into the Model Pricer. Compare BS price vs market — the α edge reveals where models agree or disagree with the market." color={D.cyan}/>
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,padding:'7px 18px',
        borderBottom:`1px solid ${D.b0}`,background:D.s2,flexShrink:0}}>
        <span style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:2,marginRight:4}}>EXPIRY</span>
        {chainData.all_expiries?.slice(0,8).map(e=>(
          <button key={e} onClick={()=>setExpiry(e)} style={{fontFamily:MONO,fontSize:8,padding:'3px 9px',
            cursor:'pointer',background:(expiry||chainData.expiry)===e?`${D.cyan}18`:'transparent',
            border:`1px solid ${(expiry||chainData.expiry)===e?D.cyan:D.b1}`,
            color:(expiry||chainData.expiry)===e?D.cyan:D.t3}}>{e}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:12,fontFamily:MONO,fontSize:9,color:D.t3}}>
          <span>T={chainData.T}yr · S=${chainData.spot} · r={(chainData.r*100).toFixed(2)}%</span>
          <Badge color={D.green} size={9}>LIVE</Badge>
        </div>
      </div>
      <div style={{padding:'6px 18px',background:`${D.amber}06`,borderBottom:`1px solid ${D.b0}`,
        fontFamily:MONO,fontSize:9,color:D.t3,flexShrink:0,lineHeight:1.8}}>
        <span style={{color:D.amber,fontWeight:600}}>BS PRICE</span> and <span style={{color:D.amber,fontWeight:600}}>α EDGE</span> are <span style={{color:D.amber,fontWeight:600}}>theoretical</span> — computed from Black-Scholes using live spot &amp; IV.{'  '}<span style={{color:D.t2,fontWeight:600}}>BID / ASK / MID</span> are live market quotes.
      </div>
      <div style={{display:'flex',borderBottom:`1px solid ${D.b1}`,flexShrink:0}}>
        {['calls','puts'].map(s=>(
          <button key={s} onClick={()=>setSide(s)} style={{flex:1,padding:'10px 0',cursor:'pointer',
            fontFamily:DISPLAY,fontSize:12,letterSpacing:3,
            background:side===s?(s==='calls'?`${D.cyan}10`:`${D.red}10`):'transparent',
            borderBottom:side===s?`2px solid ${s==='calls'?D.cyan:D.red}`:'2px solid transparent',
            color:side===s?(s==='calls'?D.cyan:D.red):D.t3,
            border:`1px solid ${D.b0}`}}>
            {s.toUpperCase()} ({(s==='calls'?chainData.calls:chainData.puts)?.length||0})
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',overflowX:'auto',minHeight:0}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:MONO}}>
          <thead>
            <tr style={{background:D.s3,position:'sticky',top:0,zIndex:2}}>
              {cols.map(c=>(
                <th key={c.key} onClick={()=>toggleSort(c.key)} style={{
                  padding:'8px 10px',textAlign:c.align||'right',cursor:'pointer',
                  fontWeight:'normal',fontSize:8,letterSpacing:1.5,
                  color:sortKey===c.key?D.cyan:D.t3,
                  borderBottom:`1px solid ${D.b2}`,whiteSpace:'nowrap',width:c.w}}>
                  {c.tip?<Tip tip={c.tip} color={D.cyan}>{c.label}</Tip>:c.label}
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
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=`${D.cyan}0b`;}}
                  onMouseLeave={e=>{e.currentTarget.style.background=rowBg(row,isSel);}}>
                  {cols.map(c=>(
                    <td key={c.key} style={{padding:'6px 10px',textAlign:c.align||'right',
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
      <div style={{padding:'6px 18px',borderTop:`1px solid ${D.b0}`,
        display:'flex',gap:16,fontFamily:MONO,fontSize:9,color:D.t3,flexShrink:0}}>
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
  const hasIVData=calls.length>0||puts.length>0;
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:3,marginBottom:4}}>
            <Tip tip={TIPS.iv} color={D.orange}>LIVE IMPLIED VOLATILITY SMILE</Tip>
          </div>
          <div style={{fontFamily:MONO,fontSize:11,color:D.t1}}>{ticker} · {data.expiry} · Newton-Raphson IV solver from bid/ask mid</div>
        </div>
        <Badge color={D.orange} size={9}>LIVE IV</Badge>
      </div>
      <CtxBar text="Each dot = one live contract. The smile/skew shows OTM puts pricing higher IV than OTM calls — crash risk premium. A flat line = BS is correct. Reality never is." color={D.orange}/>
      {!hasIVData?(
        <div style={{padding:'32px',background:`${D.amber}0a`,border:`1px solid ${D.amber}25`,fontFamily:MONO}}>
          <p style={{color:D.amber,margin:'0 0 8px 0',fontSize:11}}>⚠ THEORETICAL MODE — No market quotes available</p>
          <p style={{color:'#888',fontSize:10,margin:'0 0 4px 0',lineHeight:1.8}}>
            IV Smile requires live bid/ask quotes to compute implied volatility per strike.
            The free tier provides theoretical BS pricing only.
          </p>
          <p style={{color:'#888',fontSize:10,margin:'16px 0 0 0',lineHeight:1.8}}>
            In a live market, the smile would show OTM puts priced at higher IV than
            OTM calls — the crash risk premium that flat-vol Black-Scholes cannot capture.
            This skew is the foundation of local vol and stochastic vol models.
          </p>
        </div>
      ):(
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{top:10,right:30,left:0,bottom:25}}>
          <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.4}/>
          <XAxis dataKey="strike" stroke={D.t3} name="Strike" tick={{fontFamily:MONO,fontSize:9,fill:D.t3}} tickFormatter={v=>`$${v}`} label={{value:'Strike Price ($)',fill:D.t3,fontFamily:MONO,fontSize:9,position:'insideBottom',offset:-12}}/>
          <YAxis dataKey="iv" stroke={D.t3} name="IV %" tick={{fontFamily:MONO,fontSize:9,fill:D.t3}} tickFormatter={v=>`${v}%`} label={{value:'Implied Volatility (%)',fill:D.t3,fontFamily:MONO,fontSize:9,angle:-90,position:'insideLeft',offset:12}}/>
          <Tooltip contentStyle={TTP} formatter={(v,n)=>[typeof v==='number'?`${v.toFixed(2)}%`:v,n]} labelFormatter={v=>`Strike $${v}`}/>
          <ReferenceLine x={data.spot} stroke={D.amber} strokeDasharray="4 2"
            label={{value:`Spot $${data.spot}`,fill:D.amber,fontFamily:MONO,fontSize:9}}/>
          <Scatter data={calls} name="Call IV" fill={D.cyan}  opacity={0.9} r={5}/>
          <Scatter data={puts}  name="Put IV"  fill={D.red}   opacity={0.9} r={5}/>
          <Legend wrapperStyle={{fontFamily:MONO,fontSize:10,paddingTop:12}}/>
        </ScatterChart>
      </ResponsiveContainer>
      )}
      <div style={{padding:'14px 18px',background:D.s2,border:`1px solid ${D.b1}`,borderLeft:`3px solid ${D.orange}`}}>
        <div style={{fontFamily:MONO,fontSize:10,color:D.t2,lineHeight:2}}>
          <strong style={{color:D.t0}}>The skew:</strong> OTM puts price higher IV because institutional hedgers buy downside protection — crash risk is asymmetric. BS assumes one flat σ. This chart shows exactly where that assumption breaks down.
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
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:9,color:D.t3,letterSpacing:3,marginBottom:4}}>
            <Tip tip={TIPS.alpha} color={D.amber}>MODEL vs MARKET · α EDGE</Tip>
          </div>
          <div style={{fontFamily:MONO,fontSize:11,color:D.t1}}>{ticker} · {data.expiry} · BS price − market mid</div>
        </div>
        <Badge color={D.amber} size={9}>MISPRICING</Badge>
      </div>
      <CtxBar text="Positive α = BS overprices this contract. Negative α = market charges more than BS predicts. The systematic pattern across strikes reveals the vol skew." color={D.amber}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:D.b0}}>
        {[
          ['CONTRACTS',`${data.summary.total_contracts}`,D.t0],
          ['AVG α EDGE',`$${data.summary.avg_mispricing}`,Math.abs(data.summary.avg_mispricing)<.05?D.t3:D.amber],
          ['MAX OVERPRICED',`$${data.summary.max_overpriced}`,D.green],
          ['MAX UNDERPRICED',`$${data.summary.max_underpriced}`,D.red],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:D.s2,padding:'14px 18px'}}>
            <div style={{fontFamily:MONO,fontSize:8,color:D.t3,letterSpacing:2,marginBottom:5}}>{k}</div>
            <div style={{fontFamily:DISPLAY,fontSize:19,color:c,fontWeight:'bold'}}>{v}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{top:10,right:30,left:0,bottom:25}}>
          <CartesianGrid stroke={D.b0} strokeDasharray="2 4" opacity={0.4}/>
          <XAxis dataKey="strike" stroke={D.t3} name="Strike" tick={{fontFamily:MONO,fontSize:9,fill:D.t3}} tickFormatter={v=>`$${v}`} label={{value:'Strike Price ($)',fill:D.t3,fontFamily:MONO,fontSize:9,position:'insideBottom',offset:-12}}/>
          <YAxis dataKey="mispricing" stroke={D.t3} name="α Edge" tick={{fontFamily:MONO,fontSize:9,fill:D.t3}} tickFormatter={v=>`$${v.toFixed(2)}`} label={{value:'α Edge ($)',fill:D.t3,fontFamily:MONO,fontSize:9,angle:-90,position:'insideLeft',offset:12}}/>
          <Tooltip contentStyle={TTP} formatter={(v,n)=>[typeof v==='number'?`$${v.toFixed(4)}`:v,n]} labelFormatter={v=>`Strike $${v}`}/>
          <ReferenceLine y={0} stroke={D.b3} strokeWidth={2} label={{value:'Fair Value α=0',fill:D.t2,fontFamily:MONO,fontSize:9,position:'insideTopLeft'}}/>
          <ReferenceLine x={data.spot} stroke={D.amber} strokeDasharray="4 2" label={{value:'Spot',fill:D.amber,fontFamily:MONO,fontSize:9}}/>
          <Scatter data={calls} name="Calls α" fill={D.cyan} opacity={0.85} r={5}/>
          <Scatter data={puts}  name="Puts α"  fill={D.red}  opacity={0.85} r={5}/>
          <Legend wrapperStyle={{fontFamily:MONO,fontSize:10,paddingTop:12}}/>
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
  useEffect(()=>{setExpiry(null);setSelected(null);fetchCache.clear();},[ticker]);

  const{data:quote,loading:qLoad,error:qErr}=useFetch(ticker?`${API}/api/quote/${ticker}`:null);
  const chainUrl=ticker?(expiry?`${API}/api/chain/${ticker}?expiry=${expiry}`:`${API}/api/chain/${ticker}`):null;
  const{data:chain,loading:cLoad,error:cErr}=useFetch(chainUrl);
  const{data:cmpData,loading:mpLoad,error:mpErr}=useFetch(ticker?`${API}/api/compare/${ticker}`:null);

  const TABS=[
    {id:'chain',   label:'OPTIONS CHAIN',  color:D.cyan,  desc:'Live contracts · BS price · Greeks · α edge'},
    {id:'smile',   label:'IV SMILE',       color:D.orange,desc:'Implied vol smile across strikes'},
    {id:'surface', label:'VOL SURFACE ✦',  color:D.orange,desc:'3D / heatmap across all expiries'},
    {id:'alpha',   label:'α EDGE',         color:D.amber, desc:'Model vs market mispricing'},
    {id:'about',   label:'METHODOLOGY',    color:D.t2,    desc:'How it was built · validation · references'},
  ];

  return(
    <div style={{height:'100vh',width:'100vw',overflow:'hidden',
      background:D.bg,color:D.t0,fontFamily:MONO,display:'flex',flexDirection:'column'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${D.bg};}
        *{box-sizing:border-box;}
        input[type=range]{cursor:pointer;border:none;background:transparent;display:block;width:100%;height:14px;margin:0;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:${D.cyan};border:2px solid ${D.bg};box-shadow:0 0 8px ${D.cyan}90;cursor:pointer;margin-top:-6px;}
        input[type=range]::-webkit-slider-runnable-track{height:2px;background:transparent;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glow{0%,100%{box-shadow:0 0 6px ${D.green}80}50%{box-shadow:0 0 16px ${D.green}}}
        ::-webkit-scrollbar{width:4px;height:4px;background:${D.bg}}
        ::-webkit-scrollbar-thumb{background:${D.b2};border-radius:3px}
        button{outline:none;border:1px solid transparent;background:transparent;}
        input{outline:none;}
        tr{transition:background .08s;}
        th{user-select:none;}
        strong{font-weight:600;}
        em{font-style:normal;}
        ul{padding-left:18px;}
      `}</style>

      <TopBar ticker={ticker} onLoad={t=>{setTicker(t);setTab('chain');}} apiLive={apiLive} time={time}/>
      <QuoteStrip q={quote} loading={qLoad} onRetry={t=>{setTicker(t);setTab('chain');}}/>

      {/* Data Status Bar */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 18px',
        background:D.s1,borderBottom:`1px solid ${D.b0}`,flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:7,color:D.t4,letterSpacing:2,marginRight:4}}>DATA</span>
        {[
          {dot:'🟢',label:'LIVE',desc:'Stock quotes & option reference contracts from Massive.com REST API'},
          {dot:'🟡',label:'THEORETICAL',desc:'BS / Binomial / Monte Carlo model prices'},
          {dot:'⚪',label:'REQUIRES SUBSCRIPTION',desc:'Level II order book · real-time tick data'},
        ].map(({dot,label,desc})=>(
          <div key={label} title={desc} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 9px',
            background:D.s2,border:`1px solid ${D.b1}`,cursor:'default'}}>
            <span style={{fontSize:8}}>{dot}</span>
            <span style={{fontFamily:MONO,fontSize:7,color:D.t3,letterSpacing:1}}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden'}}>
        {/* LEFT — always-visible model pricer */}
        <ModelPricer
          defaultS={quote?.price} defaultR={quote?.risk_free_rate} defaultQ={quote?.dividend_yield}
          selectedContract={selected} onLoad={setTicker}/>

        {/* RIGHT — tabbed market data */}
        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'stretch',background:D.s2,borderBottom:`1px solid ${D.b1}`,flexShrink:0,height:46}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:'0 18px',cursor:'pointer',fontFamily:MONO,fontSize:9,letterSpacing:1.5,
                background:'transparent',
                borderTop:'none',borderLeft:'none',borderRight:'none',
                borderBottom:tab===t.id?`2px solid ${t.color}`:'2px solid transparent',
                color:tab===t.id?t.color:D.t3,display:'flex',alignItems:'center',gap:6,
              }}>
                {t.label}
              </button>
            ))}
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12,padding:'0 18px'}}>
              {chain&&<span style={{fontFamily:MONO,fontSize:8,color:D.t3}}>{chain.total_contracts} contracts · {chain.expiry}</span>}
              {quote&&<Badge color={D.green} size={9}>LIVE · {ticker}</Badge>}
            </div>
          </div>
          <div style={{flex:1,minHeight:0,overflow:'auto'}}>
            {tab==='chain'&&<ChainTable chainData={chain} loading={cLoad} error={cErr} spot={quote?.price} expiry={expiry} setExpiry={setExpiry} onSelect={setSelected}/>}
            {tab==='smile'&&<IVSmile data={chain} loading={cLoad} error={cErr} ticker={ticker}/>}
            {tab==='surface'&&<VolSurfacePanel ticker={ticker}/>}
            {tab==='alpha'&&<AlphaEdge data={cmpData} loading={mpLoad} error={mpErr} ticker={ticker}/>}
            {tab==='about'&&<Methodology/>}
          </div>
        </div>
      </div>
    </div>
  );
}
