import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ScatterChart, Scatter
} from "recharts";

/* ============================================================
   BLACK-SCHOLES ENGINE — Pure JS implementation
   Mirrors the Python engine exactly
   ============================================================ */

function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0/(1.0+p*x);
  const y = 1.0-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}

function normCDF(x) { return 0.5*(1+erf(x/Math.sqrt(2))); }
function normPDF(x) { return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); }

function bsD1D2(S,K,T,r,sigma,q=0) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K)+(r-q+0.5*sigma*sigma)*T)/(sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  return {d1,d2};
}

function bsPrice(S,K,T,r,sigma,q=0,type='call') {
  if(T<=0) return Math.max(type==='call'?S-K:K-S, 0);
  const {d1,d2} = bsD1D2(S,K,T,r,sigma,q);
  const expQ = Math.exp(-q*T), expR = Math.exp(-r*T);
  if(type==='call') return S*expQ*normCDF(d1)-K*expR*normCDF(d2);
  return K*expR*normCDF(-d2)-S*expQ*normCDF(-d1);
}

function bsGreeks(S,K,T,r,sigma,q=0,type='call') {
  if(T<=0.0001) return {delta:type==='call'?(S>K?1:0):(S<K?-1:0),gamma:0,vega:0,theta:0,rho:0};
  const {d1,d2} = bsD1D2(S,K,T,r,sigma,q);
  const sqrtT=Math.sqrt(T), expQ=Math.exp(-q*T), expR=Math.exp(-r*T);
  const nd1=normPDF(d1);
  const delta = type==='call' ? expQ*normCDF(d1) : expQ*(normCDF(d1)-1);
  const gamma = expQ*nd1/(S*sigma*sqrtT);
  const vega  = S*expQ*nd1*sqrtT/100;
  const t1    = -(S*expQ*nd1*sigma)/(2*sqrtT);
  const t2    = type==='call'
    ? q*S*expQ*normCDF(d1)-r*K*expR*normCDF(d2)
    : -q*S*expQ*normCDF(-d1)+r*K*expR*normCDF(-d2);
  const theta = (t1+t2)/365;
  const rho   = type==='call'
    ? K*T*expR*normCDF(d2)/100
    : -K*T*expR*normCDF(-d2)/100;
  return {delta,gamma,vega,theta,rho};
}

/* ── Binomial Tree (CRR) ─────────────────────────────────── */
function binomialPrice(S,K,T,r,sigma,q=0,type='call',steps=150,style='european') {
  const dt=T/steps, u=Math.exp(sigma*Math.sqrt(dt)), d=1/u;
  const disc=Math.exp(-r*dt), p=(Math.exp((r-q)*dt)-d)/(u-d);
  let V=[];
  for(let j=0;j<=steps;j++) {
    const St=S*Math.pow(u,j)*Math.pow(d,steps-j);
    V.push(Math.max(type==='call'?St-K:K-St, 0));
  }
  let V2,V1;
  for(let i=steps-1;i>=0;i--) {
    const newV=[];
    for(let j=0;j<=i;j++) {
      let val=disc*(p*V[j+1]+(1-p)*V[j]);
      if(style==='american') {
        const St=S*Math.pow(u,j)*Math.pow(d,i-j);
        val=Math.max(val,type==='call'?Math.max(St-K,0):Math.max(K-St,0));
      }
      newV.push(val);
    }
    if(i===2) V2=[...newV];
    if(i===1) V1=[...newV];
    V=newV;
  }
  const price=V[0];
  const Su=S*u, Sd=S*d;
  const delta=(V1[1]-V1[0])/(Su-Sd);
  const Suu=S*u*u,Sdd=S*d*d;
  const dU=(V2[2]-V2[1])/(Suu-S), dD=(V2[1]-V2[0])/(S-Sdd);
  const gamma=(dU-dD)/(0.5*(Suu-Sdd));
  const theta=(V2[1]-price)/(2*dt)/365;
  return {price,delta,gamma,theta};
}

/* ── Monte Carlo (seeded LCG for reproducibility) ───────── */
function mulberry32(seed) {
  return function() {
    seed|=0; seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  }
}
function boxMuller(rand) {
  const u1=rand(), u2=rand();
  return Math.sqrt(-2*Math.log(u1+1e-10))*Math.cos(2*Math.PI*u2);
}

function monteCarloPrice(S,K,T,r,sigma,q=0,type='call',N=50000) {
  const rand=mulberry32(42);
  const drift=(r-q-0.5*sigma*sigma)*T, vol=sigma*Math.sqrt(T);
  let sum=0, sum2=0;
  const disc=Math.exp(-r*T);
  for(let i=0;i<N/2;i++) {
    const z=boxMuller(rand);
    for(const sign of [1,-1]) {
      const ST=S*Math.exp(drift+vol*sign*z);
      const pay=Math.max(type==='call'?ST-K:K-ST,0)*disc;
      sum+=pay; sum2+=pay*pay;
    }
  }
  const price=sum/N;
  const variance=sum2/N-price*price;
  const se=Math.sqrt(variance/N);
  return {price, se, ci:[price-1.96*se, price+1.96*se]};
}

/* ── Implied Vol solver (Newton-Raphson) ─────────────────── */
function impliedVol(marketPrice,S,K,T,r,q=0,type='call') {
  let sigma=Math.sqrt(2*Math.PI/T)*(marketPrice/S);
  sigma=Math.max(0.01,Math.min(sigma,5));
  for(let i=0;i<100;i++) {
    const price=bsPrice(S,K,T,r,sigma,q,type);
    const vega=bsGreeks(S,K,T,r,sigma,q,type).vega*100;
    const err=price-marketPrice;
    if(Math.abs(err)<1e-7) return sigma;
    if(Math.abs(vega)<1e-12) break;
    sigma-=err/vega;
    sigma=Math.max(0.001,sigma);
  }
  return sigma;
}

/* ============================================================
   STYLE CONSTANTS
   ============================================================ */
const C = {
  bg:       '#04080f',
  panel:    '#080e1a',
  panel2:   '#0a1628',
  border:   '#0d2137',
  border2:  '#1a3a5c',
  bs:       '#00d4ff',
  binom:    '#00ff88',
  mc:       '#ff6b35',
  amer:     '#c084fc',
  text:     '#e2f0ff',
  muted:    '#4a7fa5',
  dim:      '#1e3a52',
  call:     '#00d4ff',
  put:      '#ff4f7b',
  gold:     '#ffd700',
  green:    '#00ff88',
  red:      '#ff4444',
};

const fontMono = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
const fontDisplay = '"Share Tech Mono", "Courier New", monospace';

/* ============================================================
   TICK ANIMATION HOOK
   ============================================================ */
function useAnimatedValue(target, duration=400) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current, end = target, startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now-startTime)/duration,1);
      const ease = p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      setDisplay(start+(end-start)*ease);
      if(p<1) requestAnimationFrame(tick);
      else prev.current=end;
    };
    requestAnimationFrame(tick);
  }, [target]);
  return display;
}

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */

function ScanlineOverlay() {
  return (
    <div style={{
      position:'fixed',top:0,left:0,right:0,bottom:0,
      pointerEvents:'none',zIndex:9999,
      background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)',
    }}/>
  );
}

function GridBg() {
  return (
    <div style={{
      position:'fixed',top:0,left:0,right:0,bottom:0,
      pointerEvents:'none',zIndex:0,
      backgroundImage:`
        linear-gradient(rgba(0,100,200,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,100,200,0.04) 1px, transparent 1px)`,
      backgroundSize:'40px 40px',
    }}/>
  );
}

function HeaderBar() {
  const [time, setTime] = useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);
  return (
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'10px 24px',borderBottom:`1px solid ${C.border2}`,
      background:`linear-gradient(90deg,${C.bg},${C.panel2},${C.bg})`,
      position:'relative',zIndex:10,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{
          width:8,height:8,borderRadius:'50%',background:C.bs,
          boxShadow:`0 0 12px ${C.bs}`,animation:'pulse 2s infinite'
        }}/>
        <span style={{fontFamily:fontDisplay,fontSize:11,color:C.muted,letterSpacing:4}}>
          OPTIONS VALUATION ENGINE
        </span>
        <span style={{fontFamily:fontMono,fontSize:9,color:C.dim,letterSpacing:2}}>
          v2.0 · PHASE I
        </span>
      </div>
      <div style={{display:'flex',gap:24,alignItems:'center'}}>
        {['BS·ACTIVE','CRR·ACTIVE','MC·ACTIVE'].map((s,i)=>(
          <span key={i} style={{
            fontFamily:fontMono,fontSize:9,letterSpacing:2,
            color:[C.bs,C.binom,C.mc][i],
          }}>⬤ {s}</span>
        ))}
        <span style={{fontFamily:fontMono,fontSize:10,color:C.muted}}>
          {time.toLocaleTimeString('en-GB',{hour12:false})} UTC
        </span>
      </div>
    </div>
  );
}

function ParamSlider({label, value, min, max, step, onChange, fmt, unit='', formula}) {
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontFamily:fontMono,fontSize:10,color:C.muted,letterSpacing:2}}>{label}</span>
        <div style={{display:'flex',alignItems:'baseline',gap:4}}>
          <span style={{fontFamily:fontMono,fontSize:14,color:C.text,fontWeight:'bold'}}>
            {fmt ? fmt(value) : value}
          </span>
          {unit && <span style={{fontFamily:fontMono,fontSize:9,color:C.muted}}>{unit}</span>}
        </div>
      </div>
      <div style={{position:'relative'}}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(parseFloat(e.target.value))}
          style={{
            width:'100%',appearance:'none',height:3,
            background:`linear-gradient(90deg, ${C.bs} ${((value-min)/(max-min))*100}%, ${C.dim} 0%)`,
            outline:'none',cursor:'pointer',
            WebkitAppearance:'none',
          }}
        />
      </div>
      {formula && <div style={{fontFamily:fontMono,fontSize:8,color:C.dim,marginTop:2}}>{formula}</div>}
    </div>
  );
}

function GreekCard({symbol, name, value, desc, color=C.bs, anomaly}) {
  const anim = useAnimatedValue(value||0);
  const isPos = anim >= 0;
  return (
    <div style={{
      background:C.panel,border:`1px solid ${C.border}`,borderTop:`2px solid ${color}`,
      padding:'12px 14px',position:'relative',overflow:'hidden',
    }}>
      <div style={{
        position:'absolute',top:0,right:0,width:40,height:40,
        background:`radial-gradient(circle at top right, ${color}15, transparent)`,
      }}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontFamily:fontDisplay,fontSize:18,color,fontWeight:'bold'}}>
            {symbol}
          </div>
          <div style={{fontFamily:fontMono,fontSize:8,color:C.muted,letterSpacing:2,marginTop:1}}>{name}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{
            fontFamily:fontMono,fontSize:16,fontWeight:'bold',
            color: anomaly ? C.gold : (isPos ? C.text : C.put),
          }}>
            {value != null ? (isPos&&value>0?'+':'')+anim.toFixed(5) : '—'}
          </div>
        </div>
      </div>
      <div style={{fontFamily:fontMono,fontSize:8,color:C.dim,marginTop:8,lineHeight:1.5}}>{desc}</div>
    </div>
  );
}

function ModelPriceCard({model, price, error, se, ci, extra, color, formula, detail}) {
  const anim = useAnimatedValue(price||0);
  return (
    <div style={{
      background:C.panel,border:`1px solid ${color}40`,
      borderLeft:`3px solid ${color}`,padding:'16px 18px',
      position:'relative',overflow:'hidden',flex:1,minWidth:0,
    }}>
      <div style={{
        position:'absolute',inset:0,
        background:`radial-gradient(ellipse at top left, ${color}08, transparent 60%)`,
        pointerEvents:'none',
      }}/>
      <div style={{fontFamily:fontMono,fontSize:8,color,letterSpacing:3,marginBottom:8}}>{model}</div>
      <div style={{fontFamily:fontDisplay,fontSize:26,color:C.text,fontWeight:'bold',marginBottom:4}}>
        ${anim.toFixed(4)}
      </div>
      {formula && <div style={{fontFamily:fontMono,fontSize:8,color:C.dim,marginBottom:8}}>{formula}</div>}
      {error != null && (
        <div style={{fontFamily:fontMono,fontSize:9,color:C.muted}}>
          Δ vs BS: <span style={{color:Math.abs(error)<0.01?C.green:C.gold}}>${Math.abs(error).toFixed(4)}</span>
        </div>
      )}
      {se != null && (
        <div style={{fontFamily:fontMono,fontSize:9,color:C.muted}}>
          SE: <span style={{color:C.mc}}>±${se.toFixed(4)}</span>
          {ci && <span style={{color:C.dim}}> · 95%CI [{ci[0].toFixed(3)}, {ci[1].toFixed(3)}]</span>}
        </div>
      )}
      {extra && <div style={{fontFamily:fontMono,fontSize:9,color:C.amer,marginTop:4}}>{extra}</div>}
      {detail && <div style={{fontFamily:fontMono,fontSize:8,color:C.dim,marginTop:4}}>{detail}</div>}
    </div>
  );
}

const TOOLTIP_STYLE = {
  background:C.panel2, border:`1px solid ${C.border2}`,
  fontFamily:fontMono, fontSize:10, color:C.text,
};

/* ============================================================
   PAYOFF CHART
   ============================================================ */
function PayoffChart({S,K,T,r,sigma,q,type,bsP,binomP,mcP}) {
  const data = [];
  const lo = S*0.45, hi = S*1.85;
  for(let i=0;i<=80;i++) {
    const st = lo+(hi-lo)*(i/80);
    const payoff = type==='call' ? Math.max(st-K,0) : Math.max(K-st,0);
    data.push({
      S: parseFloat(st.toFixed(2)),
      payoff: parseFloat(payoff.toFixed(4)),
      pnl_bs:    parseFloat((payoff-bsP).toFixed(4)),
      pnl_binom: parseFloat((payoff-binomP).toFixed(4)),
      pnl_mc:    parseFloat((payoff-mcP).toFixed(4)),
    });
  }
  return (
    <div>
      <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:12}}>
        PAYOFF DIAGRAM — NET P&L AT EXPIRY
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{top:5,right:10,left:0,bottom:5}}>
          <defs>
            <linearGradient id="gBS" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.bs} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={C.bs} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
          <XAxis dataKey="S" stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`$${v.toFixed(0)}`}/>
          <YAxis stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`$${v.toFixed(1)}`}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v,n)=>[`$${v.toFixed(3)}`,n]} labelFormatter={v=>`S = $${v}`}/>
          <ReferenceLine y={0} stroke={C.dim} strokeWidth={1}/>
          <ReferenceLine x={K} stroke={C.gold} strokeDasharray="4 2" strokeWidth={1}
            label={{value:`K=$${K}`,fill:C.gold,fontFamily:fontMono,fontSize:8,position:'top'}}/>
          <ReferenceLine x={S} stroke={C.muted} strokeDasharray="2 2" strokeWidth={1}
            label={{value:`S=$${S}`,fill:C.muted,fontFamily:fontMono,fontSize:8,position:'insideTopRight'}}/>
          <Area type="monotone" dataKey="pnl_bs" stroke={C.bs} fill="url(#gBS)"
            strokeWidth={2} dot={false} name="P&L (BS)"/>
          <Line type="monotone" dataKey="pnl_binom" stroke={C.binom}
            strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="P&L (Binom)"/>
          <Line type="monotone" dataKey="pnl_mc" stroke={C.mc}
            strokeWidth={1.5} dot={false} strokeDasharray="2 3" name="P&L (MC)"/>
          <Legend wrapperStyle={{fontFamily:fontMono,fontSize:9,color:C.muted}}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   GREEKS vs SPOT CHART
   ============================================================ */
function GreeksChart({S,K,T,r,sigma,q,type}) {
  const [activeGreek, setActiveGreek] = useState('delta');
  const data = [];
  for(let i=0;i<=60;i++) {
    const s = S*0.5+S*i*(1.2/60);
    const g = bsGreeks(s,K,T,r,sigma,q,type);
    data.push({S:parseFloat(s.toFixed(2)), delta:parseFloat(g.delta.toFixed(5)),
      gamma:parseFloat(g.gamma.toFixed(5)), vega:parseFloat(g.vega.toFixed(5)),
      theta:parseFloat(g.theta.toFixed(5))});
  }
  const greekDefs = [
    {key:'delta',sym:'Δ',color:C.bs},
    {key:'gamma',sym:'Γ',color:C.binom},
    {key:'vega', sym:'ν',color:C.mc},
    {key:'theta',sym:'Θ',color:C.put},
  ];
  const gd = greekDefs.find(g=>g.key===activeGreek);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3}}>GREEKS vs SPOT PRICE</div>
        <div style={{display:'flex',gap:8}}>
          {greekDefs.map(g=>(
            <button key={g.key} onClick={()=>setActiveGreek(g.key)} style={{
              fontFamily:fontMono,fontSize:9,padding:'3px 8px',cursor:'pointer',border:'none',
              background:activeGreek===g.key?g.color+'30':'transparent',
              color:activeGreek===g.key?g.color:C.dim,
              borderBottom:activeGreek===g.key?`1px solid ${g.color}`:'1px solid transparent',
            }}>{g.sym} {g.key}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{top:5,right:10,left:0,bottom:5}}>
          <defs>
            <linearGradient id="gGreek" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gd.color} stopOpacity={0.25}/>
              <stop offset="95%" stopColor={gd.color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
          <XAxis dataKey="S" stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`$${v.toFixed(0)}`}/>
          <YAxis stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>v.toFixed(3)}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v,n)=>[v.toFixed(5),n]} labelFormatter={v=>`S = $${v}`}/>
          <ReferenceLine y={0} stroke={C.dim}/>
          <ReferenceLine x={K} stroke={C.gold} strokeDasharray="4 2" strokeWidth={1}/>
          <ReferenceLine x={S} stroke={C.muted} strokeDasharray="2 2" strokeWidth={1}/>
          <Area type="monotone" dataKey={activeGreek} stroke={gd.color}
            fill="url(#gGreek)" strokeWidth={2} dot={false} name={gd.sym}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   VOL SMILE CHART
   ============================================================ */
function VolSmileChart({S,T,r,q,type}) {
  const data = [];
  for(let i=0;i<=40;i++) {
    const k = S*0.7+S*0.6*(i/40);
    // Synthetic vol smile: flat BS + skew + smile curvature
    const m = Math.log(k/S);
    const baseVol = 0.22;
    const skew = -0.08*m;        // Negative skew (equity smile)
    const smile = 0.06*m*m;     // Convexity
    const implVol = baseVol+skew+smile;
    data.push({
      K: parseFloat(k.toFixed(1)),
      IV: parseFloat((implVol*100).toFixed(2)),
      ATM: parseFloat((baseVol*100).toFixed(2)),
    });
  }
  return (
    <div>
      <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:12}}>
        IMPLIED VOLATILITY SMILE · ln(K/S) PARAMETRISATION
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{top:5,right:10,left:0,bottom:5}}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
          <XAxis dataKey="K" stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`$${v}`}/>
          <YAxis stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`${v}%`}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v,n)=>[`${v.toFixed(2)}%`,n]} labelFormatter={v=>`K=$${v}`}/>
          <ReferenceLine x={S} stroke={C.gold} strokeDasharray="4 2" strokeWidth={1}
            label={{value:'ATM',fill:C.gold,fontFamily:fontMono,fontSize:8}}/>
          <Line type="monotone" dataKey="IV" stroke={C.bs} strokeWidth={2.5} dot={false} name="IV Smile"/>
          <Line type="monotone" dataKey="ATM" stroke={C.dim} strokeWidth={1}
            strokeDasharray="4 2" dot={false} name="Flat Vol"/>
        </LineChart>
      </ResponsiveContainer>
      <div style={{fontFamily:fontMono,fontSize:8,color:C.dim,marginTop:6}}>
        ⚠ Synthetic smile shown · Phase 3 will plot live market IV surface from options chain
      </div>
    </div>
  );
}

/* ============================================================
   CONVERGENCE CHART
   ============================================================ */
function ConvergenceChart({S,K,T,r,sigma,q,type}) {
  const bsRef = bsPrice(S,K,T,r,sigma,q,type);
  const data = [];
  for(let n=5;n<=200;n+=5) {
    const bin = binomialPrice(S,K,T,r,sigma,q,type,n,'european');
    data.push({
      N: n,
      Binomial: parseFloat(bin.price.toFixed(5)),
      BS: parseFloat(bsRef.toFixed(5)),
    });
  }
  return (
    <div>
      <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:12}}>
        BINOMIAL CONVERGENCE · N-STEP CRR → BLACK-SCHOLES
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{top:5,right:10,left:0,bottom:5}}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
          <XAxis dataKey="N" stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            label={{value:'Steps (N)',position:'insideBottom',fill:C.muted,fontFamily:fontMono,fontSize:8,offset:-2}}/>
          <YAxis stroke={C.muted} tick={{fontFamily:fontMono,fontSize:8,fill:C.muted}}
            tickFormatter={v=>`$${v.toFixed(2)}`} domain={['auto','auto']}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v,n)=>[`$${v.toFixed(5)}`,n]} labelFormatter={v=>`N = ${v} steps`}/>
          <Line type="monotone" dataKey="Binomial" stroke={C.binom} strokeWidth={1.5} dot={false} name="CRR Binomial"/>
          <Line type="monotone" dataKey="BS" stroke={C.bs} strokeWidth={2} strokeDasharray="5 3" dot={false} name="Black-Scholes (exact)"/>
          <Legend wrapperStyle={{fontFamily:fontMono,fontSize:9,color:C.muted}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   FORMULA PANEL
   ============================================================ */
function FormulaPanel({d1,d2,S,K,T,r,sigma,q,type}) {
  const nd1=normCDF(d1), nd2=normCDF(d2);
  const expQ=Math.exp(-q*T), expR=Math.exp(-r*T);
  const rows = [
    ['d₁','(ln(S/K) + (r−q+½σ²)T) / σ√T', d1.toFixed(6)],
    ['d₂','d₁ − σ√T', d2.toFixed(6)],
    ['N(d₁)',type==='call'?'Delta-related hedge ratio':'1−N(d₁)', nd1.toFixed(6)],
    ['N(d₂)','Risk-neutral ITM probability', nd2.toFixed(6)],
    ['S·e^(−qT)','Dividend-adjusted spot', (S*expQ).toFixed(4)],
    ['K·e^(−rT)','PV of strike (discounted)', (K*expR).toFixed(4)],
    [type==='call'?'Call Price':'Put Price',
      type==='call'?'S·e^(−qT)·N(d₁) − K·e^(−rT)·N(d₂)':'K·e^(−rT)·N(−d₂) − S·e^(−qT)·N(−d₁)',
      bsPrice(S,K,T,r,sigma,q,type).toFixed(6)],
  ];
  return (
    <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:'16px'}}>
      <div style={{fontFamily:fontMono,fontSize:9,color:C.bs,letterSpacing:3,marginBottom:12}}>
        LIVE FORMULA COMPUTATION · BLACK-SCHOLES
      </div>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <tbody>
          {rows.map(([sym,formula,val],i)=>(
            <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
              <td style={{fontFamily:fontDisplay,fontSize:11,color:C.bs,padding:'6px 8px',width:80}}>{sym}</td>
              <td style={{fontFamily:fontMono,fontSize:9,color:C.muted,padding:'6px 8px'}}>{formula}</td>
              <td style={{fontFamily:fontMono,fontSize:11,color:C.text,padding:'6px 8px',textAlign:'right',whiteSpace:'nowrap'}}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */
export default function App() {
  const [S,     setS]     = useState(185);
  const [K,     setK]     = useState(185);
  const [T,     setT]     = useState(45);
  const [r,     setR]     = useState(5.25);
  const [sigma, setSigma] = useState(28);
  const [q,     setQ]     = useState(0.55);
  const [type,  setType]  = useState('call');

  const Ty = T/365, ry = r/100, sy = sigma/100, qy = q/100;

  // Compute all models
  const {d1,d2}    = bsD1D2(S,K,Ty,ry,sy,qy);
  const bsP        = bsPrice(S,K,Ty,ry,sy,qy,type);
  const bsG        = bsGreeks(S,K,Ty,ry,sy,qy,type);
  const binEuro    = binomialPrice(S,K,Ty,ry,sy,qy,type,150,'european');
  const binAmer    = binomialPrice(S,K,Ty,ry,sy,qy,type,150,'american');
  const mc         = monteCarloPrice(S,K,Ty,ry,sy,qy,type,30000);
  const intrinsic  = Math.max(type==='call'?S-K:K-S, 0);
  const extrinsic  = Math.max(bsP-intrinsic, 0);
  const eep        = Math.max(binAmer.price-binEuro.price, 0);
  const moneyness  = type==='call'
    ? (S>K*1.005?'ITM':S<K*0.995?'OTM':'ATM')
    : (S<K*0.995?'ITM':S>K*1.005?'OTM':'ATM');
  const mColor     = moneyness==='ITM'?C.green:moneyness==='OTM'?C.put:C.gold;

  return (
    <div style={{
      minHeight:'100vh', background:C.bg, color:C.text,
      fontFamily:fontMono, position:'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;700&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; }
        input[type=range] { cursor:pointer; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance:none; width:12px; height:12px;
          border-radius:50%; background:${C.bs};
          border:2px solid ${C.bg}; box-shadow:0 0 8px ${C.bs};
        }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px;background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border2}}
        button{outline:none;cursor:pointer;}
      `}</style>

      <ScanlineOverlay/>
      <GridBg/>

      <div style={{position:'relative',zIndex:1}}>
        <HeaderBar/>

        {/* ── MAIN LAYOUT ─────────────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:0,height:'calc(100vh - 45px)',overflow:'hidden'}}>

          {/* ── LEFT PANEL: INPUTS ───────────────────── */}
          <div style={{
            borderRight:`1px solid ${C.border2}`,
            background:C.panel,overflow:'auto',padding:20,
          }}>
            {/* Option type toggle */}
            <div style={{marginBottom:24}}>
              <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:10}}>
                OPTION TYPE
              </div>
              <div style={{display:'flex',gap:0}}>
                {['call','put'].map(t=>(
                  <button key={t} onClick={()=>setType(t)} style={{
                    flex:1,padding:'10px',border:'none',
                    background:type===t?(t==='call'?C.bs+'30':C.put+'30'):'transparent',
                    borderBottom:type===t?`2px solid ${t==='call'?C.bs:C.put}`:`2px solid ${C.border}`,
                    color:type===t?(t==='call'?C.bs:C.put):C.muted,
                    fontFamily:fontDisplay,fontSize:13,letterSpacing:2,
                    transition:'all 0.2s',
                  }}>{t.toUpperCase()}</button>
                ))}
              </div>
            </div>

            {/* Moneyness indicator */}
            <div style={{
              background:mColor+'15',border:`1px solid ${mColor}40`,
              padding:'8px 12px',marginBottom:20,display:'flex',
              justifyContent:'space-between',alignItems:'center',
            }}>
              <span style={{fontFamily:fontMono,fontSize:9,color:C.muted}}>MONEYNESS</span>
              <span style={{fontFamily:fontDisplay,fontSize:13,color:mColor,letterSpacing:2}}>
                {moneyness}  ·  {(S/K).toFixed(4)}×
              </span>
            </div>

            {/* Sliders */}
            <ParamSlider label="SPOT PRICE  S" value={S} min={50} max={500} step={0.5}
              onChange={setS} fmt={v=>`$${v.toFixed(2)}`} formula="Current stock price"/>
            <ParamSlider label="STRIKE PRICE  K" value={K} min={50} max={500} step={0.5}
              onChange={setK} fmt={v=>`$${v.toFixed(2)}`} formula="Agreed buy/sell price"/>
            <ParamSlider label="DAYS TO EXPIRY  T" value={T} min={1} max={365} step={1}
              onChange={setT} fmt={v=>`${v}d`} formula={`T = ${Ty.toFixed(4)} years`}/>
            <ParamSlider label="VOLATILITY  σ" value={sigma} min={1} max={150} step={0.5}
              onChange={setSigma} fmt={v=>`${v.toFixed(1)}%`} formula="Annualised implied vol"/>
            <ParamSlider label="RISK-FREE RATE  r" value={r} min={0} max={15} step={0.05}
              onChange={setR} fmt={v=>`${v.toFixed(2)}%`} formula="Continuously compounded"/>
            <ParamSlider label="DIVIDEND YIELD  q" value={q} min={0} max={10} step={0.05}
              onChange={setQ} fmt={v=>`${v.toFixed(2)}%`} formula="Merton (1973) extension"/>

            {/* Quick stats */}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,marginTop:8}}>
              <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:10}}>
                DECOMPOSITION
              </div>
              {[
                ['Intrinsic Value', `$${intrinsic.toFixed(4)}`, C.text],
                ['Extrinsic (Time)', `$${extrinsic.toFixed(4)}`, C.bs],
                ['d₁', d1.toFixed(5), C.muted],
                ['d₂', d2.toFixed(5), C.muted],
                ['N(d₁)', normCDF(d1).toFixed(5), C.muted],
                ['N(d₂) — ITM prob', normCDF(d2).toFixed(5), C.gold],
                ['Early Ex. Premium', `$${eep.toFixed(4)}`, eep>0?C.amer:C.dim],
              ].map(([k,v,c])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:9,color:C.muted}}>{k}</span>
                  <span style={{fontSize:10,color:c,fontWeight:'bold'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT PANEL: OUTPUT ─────────────────── */}
          <div style={{overflow:'auto',padding:20,display:'flex',flexDirection:'column',gap:20}}>

            {/* Model prices row */}
            <div style={{display:'flex',gap:12}}>
              <ModelPriceCard
                model="BLACK-SCHOLES · ANALYTICAL"
                price={bsP}
                color={C.bs}
                formula={type==='call'?"C = S·e^(−qT)·N(d₁) − K·e^(−rT)·N(d₂)":"P = K·e^(−rT)·N(−d₂) − S·e^(−qT)·N(−d₁)"}
                detail="Closed-form · Machine precision · European only"
              />
              <ModelPriceCard
                model="BINOMIAL TREE · CRR · 150 STEPS"
                price={binEuro.price}
                error={binEuro.price-bsP}
                color={C.binom}
                formula="V = e^(−rΔt)[p·Vᵤ + (1−p)·Vd]"
                extra={eep>0?`American: $${binAmer.price.toFixed(4)}  (EEP: +$${eep.toFixed(4)})`:`American: $${binAmer.price.toFixed(4)}`}
                detail="Backward induction · American exercise · Converges to BS"
              />
              <ModelPriceCard
                model="MONTE CARLO · ANTITHETIC · 30K"
                price={mc.price}
                error={mc.price-bsP}
                se={mc.se}
                ci={mc.ci}
                color={C.mc}
                formula="S_T = S·exp[(r−q−½σ²)T + σ√T·Z]"
                detail="GBM exact solution · Var reduction · Path-dependent ready"
              />
            </div>

            {/* Greeks row */}
            <div>
              <div style={{fontFamily:fontMono,fontSize:9,color:C.muted,letterSpacing:3,marginBottom:10}}>
                GREEKS — BLACK-SCHOLES ANALYTICAL
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
                <GreekCard symbol="Δ" name="DELTA" value={bsG.delta} color={C.bs}
                  desc={`Hedge ratio. Δ≈${bsG.delta.toFixed(2)} shares per option. ${type==='call'?'[0,1]':'[−1,0]'}`}/>
                <GreekCard symbol="Γ" name="GAMMA" value={bsG.gamma} color={C.binom}
                  desc="Rate of Δ change per $1 spot move. Same for calls & puts."/>
                <GreekCard symbol="ν" name="VEGA" value={bsG.vega} color={C.mc}
                  desc="Price change per 1% vol move. Always positive for long options."/>
                <GreekCard symbol="Θ" name="THETA" value={bsG.theta} color={C.put}
                  desc={`Daily decay: $${Math.abs(bsG.theta).toFixed(4)}/day. Enemy of option buyers.`}/>
                <GreekCard symbol="ρ" name="RHO" value={bsG.rho} color={C.amer}
                  desc={`Rate sensitivity per 1% rate move. ${type==='call'?'Positive':'Negative'} for ${type}s.`}/>
              </div>
            </div>

            {/* Charts grid */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16}}>
                <PayoffChart S={S} K={K} T={Ty} r={ry} sigma={sy} q={qy}
                  type={type} bsP={bsP} binomP={binEuro.price} mcP={mc.price}/>
              </div>
              <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16}}>
                <GreeksChart S={S} K={K} T={Ty} r={ry} sigma={sy} q={qy} type={type}/>
              </div>
              <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16}}>
                <ConvergenceChart S={S} K={K} T={Ty} r={ry} sigma={sy} q={qy} type={type}/>
              </div>
              <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:16}}>
                <VolSmileChart S={S} T={Ty} r={ry} q={qy} type={type}/>
              </div>
            </div>

            {/* Live formula panel */}
            <FormulaPanel d1={d1} d2={d2} S={S} K={K} T={Ty} r={ry} sigma={sy} q={qy} type={type}/>

          </div>
        </div>
      </div>
    </div>
  );
}
