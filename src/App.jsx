import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from "recharts";

const API = "https://optionval-api.onrender.com";

/* ── BS ENGINE ── */
function erf(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+p*x);return s*(1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));}
const N=x=>0.5*(1+erf(x/Math.sqrt(2)));
const nd=x=>Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);
function bs(S,K,T,r,σ,q,type){
  if(T<=0||σ<=0)return{price:Math.max(type==='call'?S-K:K-S,0),delta:type==='call'?1:0,gamma:0,vega:0,theta:0,rho:0,d1:0,d2:0,Nd1:type==='call'?1:0,Nd2:type==='call'?1:0};
  const sq=Math.sqrt(T),d1=(Math.log(S/K)+(r-q+.5*σ*σ)*T)/(σ*sq),d2=d1-σ*sq;
  const eq=Math.exp(-q*T),er=Math.exp(-r*T),n1=nd(d1);
  const price=type==='call'?S*eq*N(d1)-K*er*N(d2):K*er*N(-d2)-S*eq*N(-d1);
  const delta=type==='call'?eq*N(d1):eq*(N(d1)-1);
  const gamma=eq*n1/(S*σ*sq),vega=S*eq*n1*sq/100;
  const theta=(-(S*eq*n1*σ)/(2*sq)+(type==='call'?q*S*eq*N(d1)-r*K*er*N(d2):-q*S*eq*N(-d1)+r*K*er*N(-d2)))/365;
  const rho=type==='call'?K*T*er*N(d2)/100:-K*T*er*N(-d2)/100;
  return{price,delta,gamma,vega,theta,rho,d1,d2,Nd1:N(d1),Nd2:N(d2)};
}

/* ── HOOKS ── */
function useFetch(url){
  const[data,setData]=useState(null);
  const[loading,setL]=useState(false);
  const[error,setE]=useState(null);
  const ctrl=useRef(null);
  useEffect(()=>{
    if(!url){setData(null);setL(false);setE(null);return;}
    if(ctrl.current)ctrl.current.abort();
    ctrl.current=new AbortController();
    setL(true);setE(null);
    fetch(url,{signal:ctrl.current.signal})
      .then(r=>r.ok?r.json():r.json().then(e=>{throw new Error(e.detail||'API error')}))
      .then(d=>{setData(d);setL(false);})
      .catch(e=>{if(e.name!=='AbortError'){setE(e.message);setL(false);}});
    return()=>ctrl.current?.abort();
  },[url]);
  return{data,loading,error};
}

function useAnim(target,ms=400){
  const[v,setV]=useState(target);
  const ref=useRef(target);
  useEffect(()=>{
    const s=ref.current,t0=performance.now();
    const f=now=>{const p=Math.min((now-t0)/ms,1),e=1-Math.pow(1-p,3);setV(s+(target-s)*e);if(p<1)requestAnimationFrame(f);else ref.current=target;};
    requestAnimationFrame(f);
  },[target]);
  return v;
}

/* ── THEME ── */
const C={
  bg:'#05080e',s1:'#080d16',s2:'#0b1220',s3:'#0e1929',
  border:'#122236',b2:'#1a3352',b3:'#234870',
  text:'#c8dff5',text2:'#7aa5c8',muted:'#3d6080',dim:'#142030',
  cyan:'#00c8ff',green:'#00e676',red:'#ff3d5a',amber:'#ffb300',
  purple:'#b388ff',orange:'#ff7043',call:'#00c8ff',put:'#ff4f7b',
};
const MO='"JetBrains Mono","Fira Code",monospace';
const DI='"Share Tech Mono","Courier New",monospace';
const TT={background:C.s2,border:`1px solid ${C.b2}`,fontFamily:MO,fontSize:10,color:C.text};

/* ── ATOMS ── */
function Pill({children,color=C.cyan}){return<span style={{fontFamily:MO,fontSize:8,padding:'2px 7px',background:`${color}18`,color,border:`1px solid ${color}35`,letterSpacing:1}}>{children}</span>;}
function Spin(){return<div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40,gap:10}}><div style={{width:16,height:16,border:`2px solid ${C.b2}`,borderTop:`2px solid ${C.cyan}`,borderRadius:'50%',animation:'spin .7s linear infinite'}}/><span style={{fontFamily:MO,fontSize:9,color:C.muted}}>FETCHING...</span></div>;}
function Err({msg}){return<div style={{margin:12,padding:'10px 14px',fontFamily:MO,fontSize:9,color:C.red,background:`${C.red}0d`,border:`1px solid ${C.red}30`}}>⚠ {msg}</div>;}

/* ── TOP BAR ── */
function TopBar({ticker,onLoad,apiOnline,time}){
  const[q,setQ]=useState(ticker);
  const[sugg,setSugg]=useState([]);
  const[open,setOpen]=useState(false);
  useEffect(()=>{if(!q||q===ticker){setSugg([]);return;}fetch(`${API}/api/search?q=${q}`).then(r=>r.json()).then(d=>setSugg(d.results||[])).catch(()=>{});},[q]);
  const go=t=>{onLoad(t.toUpperCase());setQ(t.toUpperCase());setOpen(false);setSugg([]);};
  return(
    <div style={{height:44,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',background:C.s1,borderBottom:`1px solid ${C.b2}`,position:'relative',zIndex:50,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:C.cyan,boxShadow:`0 0 8px ${C.cyan}`,animation:'pulse 2s infinite'}}/>
          <span style={{fontFamily:DI,fontSize:10,color:C.text2,letterSpacing:5}}>OPTIONS VALUATION ENGINE</span>
          <span style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:2}}>v4.0</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:4,height:4,borderRadius:'50%',background:apiOnline?C.green:C.red,boxShadow:apiOnline?`0 0 6px ${C.green}`:'none'}}/>
          <span style={{fontFamily:MO,fontSize:8,color:apiOnline?C.green:C.red}}>{apiOnline?'LIVE':'OFFLINE'}</span>
        </div>
      </div>
      <div style={{position:'relative',display:'flex',alignItems:'center'}}>
        <div style={{fontFamily:MO,fontSize:8,color:C.muted,padding:'7px 10px',background:C.s3,border:`1px solid ${C.b2}`,borderRight:'none',letterSpacing:2}}>TICKER</div>
        <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onKeyDown={e=>e.key==='Enter'&&go(q)} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
          style={{fontFamily:DI,fontSize:14,color:C.text,background:C.s3,border:`1px solid ${C.b2}`,padding:'7px 12px',width:180,letterSpacing:2}}/>
        <button onClick={()=>go(q)} style={{fontFamily:MO,fontSize:8,padding:'7px 16px',cursor:'pointer',letterSpacing:2,background:`${C.cyan}18`,border:`1px solid ${C.cyan}35`,color:C.cyan}}>LOAD ▶</button>
        {open&&sugg.length>0&&(
          <div style={{position:'absolute',top:'100%',left:0,right:0,background:C.s2,border:`1px solid ${C.b2}`,zIndex:100,boxShadow:`0 8px 24px ${C.bg}`}}>
            {sugg.map(s=>(
              <div key={s.ticker} onMouseDown={()=>go(s.ticker)} style={{padding:'8px 12px',cursor:'pointer',display:'flex',justifyContent:'space-between',borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.s3} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontFamily:DI,fontSize:11,color:C.cyan}}>{s.ticker}</span>
                <span style={{fontFamily:MO,fontSize:8,color:C.muted}}>{s.name}</span>
                <span style={{fontFamily:MO,fontSize:8,color:C.amber}}>{s.market}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span style={{fontFamily:MO,fontSize:9,color:C.muted}}>{time}</span>
    </div>
  );
}

/* ── QUOTE STRIP ── */
function QuoteStrip({q,loading}){
  const price=useAnim(q?.price||0);
  if(loading)return<div style={{height:64,background:C.s1,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Spin/></div>;
  if(!q)return null;
  const up=q.change>=0;
  return(
    <div style={{display:'flex',alignItems:'stretch',background:C.s1,borderBottom:`1px solid ${C.b2}`,height:64,flexShrink:0,overflow:'hidden'}}>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${C.b2}`,minWidth:200,background:`linear-gradient(90deg,${C.cyan}08,transparent)`}}>
        <div style={{fontFamily:DI,fontSize:20,color:C.text,letterSpacing:2}}>{q.ticker}</div>
        <div style={{fontFamily:MO,fontSize:8,color:C.muted,marginTop:2}}>{q.flag} {q.exchange} · {q.name}</div>
      </div>
      <div style={{padding:'0 24px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${C.b2}`}}>
        <div style={{fontFamily:DI,fontSize:26,color:C.text,fontWeight:'bold'}}>{q.currency==='INR'?'₹':'$'}{price.toFixed(2)}</div>
        <div style={{fontFamily:MO,fontSize:10,color:up?C.green:C.red,marginTop:1}}>{up?'▲':'▼'} {Math.abs(q.change).toFixed(2)} ({Math.abs(q.change_pct).toFixed(2)}%)</div>
      </div>
      {[['30D VOL',`${(q.hist_vol_30d*100).toFixed(1)}%`,C.orange],['RISK-FREE r',`${(q.risk_free_rate*100).toFixed(2)}%`,C.text2],['DIV YIELD q',`${(q.dividend_yield*100).toFixed(2)}%`,C.text2],['MKT CAP',q.market_cap>1e12?`${(q.market_cap/1e12).toFixed(2)}T`:q.market_cap>1e9?`${(q.market_cap/1e9).toFixed(1)}B`:'—',C.text],['SECTOR',q.sector||'—',C.text2]].map(([k,v,c])=>(
        <div key={k} style={{padding:'0 18px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:`1px solid ${C.border}`}}>
          <div style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:2,marginBottom:3}}>{k}</div>
          <div style={{fontFamily:MO,fontSize:12,color:c}}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ── GREEKS STRIP ── */
function GreeksStrip({S,K,T_,r,σ,q,type}){
  const g=bs(S,K,T_,r,σ,q,type);
  return(
    <div style={{display:'flex',background:C.s2,borderBottom:`1px solid ${C.border}`,height:40,flexShrink:0}}>
      {[['Δ DELTA',g.delta,v=>v.toFixed(5),C.cyan],['Γ GAMMA',g.gamma,v=>v.toFixed(5),C.green],['ν VEGA',g.vega,v=>v.toFixed(5),C.orange],['Θ THETA',g.theta,v=>v.toFixed(5),C.put],['ρ RHO',g.rho,v=>v.toFixed(5),C.purple],['N(d₂)',g.Nd2,v=>`${(v*100).toFixed(2)}%`,C.amber]].map(([k,v,fmt,c])=>(
        <div key={k} style={{flex:1,display:'flex',alignItems:'center',gap:8,padding:'0 14px',borderRight:`1px solid ${C.border}`}}>
          <span style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:1,whiteSpace:'nowrap'}}>{k}</span>
          <span style={{fontFamily:DI,fontSize:12,color:c,fontWeight:'bold'}}>{fmt(v)}</span>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:16,padding:'0 16px'}}>
        <span style={{fontFamily:MO,fontSize:8,color:C.muted}}>d₁ <span style={{color:C.text2}}>{g.d1.toFixed(4)}</span></span>
        <span style={{fontFamily:MO,fontSize:8,color:C.muted}}>d₂ <span style={{color:C.text2}}>{g.d2.toFixed(4)}</span></span>
      </div>
    </div>
  );
}

/* ── PRICER DRAWER ── */
function PricerDrawer({open,defaultS,defaultR,defaultQ,onClose}){
  const[S,setS]=useState(defaultS||185);
  const[K,setK]=useState(defaultS||185);
  const[Td,setTd]=useState(45);
  const[r,setR]=useState((defaultR||0.0525)*100);
  const[σ,setσ]=useState(28);
  const[q,setq]=useState((defaultQ||0.005)*100);
  const[type,setType]=useState('call');
  useEffect(()=>{if(defaultS){setS(defaultS);setK(defaultS);}if(defaultR)setR(defaultR*100);if(defaultQ)setq(defaultQ*100);},[defaultS,defaultR,defaultQ]);
  const g=bs(S,K,Td/365,r/100,σ/100,q/100,type);
  const price=useAnim(g.price);
  const intr=Math.max(type==='call'?S-K:K-S,0);
  const mStr=S/K>1.005?'ITM':S/K<0.995?'OTM':'ATM';
  const mCol=mStr==='ITM'?C.green:mStr==='OTM'?C.red:C.amber;
  if(!open)return null;
  const Slider=({label,val,set,min,max,step,fmt})=>(
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontFamily:MO,fontSize:8,color:C.muted,letterSpacing:2}}>{label}</span>
        <span style={{fontFamily:MO,fontSize:11,color:C.text,fontWeight:'bold'}}>{fmt(val)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e=>set(parseFloat(e.target.value))}
        style={{width:'100%',appearance:'none',WebkitAppearance:'none',height:2,background:`linear-gradient(90deg,${C.cyan} ${((val-min)/(max-min))*100}%,${C.dim} 0%)`}}/>
    </div>
  );
  return(
    <div style={{position:'fixed',top:0,right:0,bottom:0,width:300,zIndex:200,background:C.s1,borderLeft:`1px solid ${C.b2}`,boxShadow:`-8px 0 32px #000a`,overflowY:'auto',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:`1px solid ${C.b2}`,flexShrink:0}}>
        <span style={{fontFamily:MO,fontSize:9,color:C.cyan,letterSpacing:3}}>MANUAL PRICER</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontFamily:MO,fontSize:16,lineHeight:1}}>✕</button>
      </div>
      <div style={{padding:16,flex:1}}>
        <div style={{display:'flex',gap:0,marginBottom:16}}>
          {['call','put'].map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{flex:1,padding:'8px 0',border:'none',cursor:'pointer',fontFamily:DI,fontSize:12,letterSpacing:2,background:type===t?(t==='call'?`${C.call}20`:`${C.put}20`):C.dim,borderBottom:type===t?`2px solid ${t==='call'?C.call:C.put}`:`2px solid transparent`,color:type===t?(t==='call'?C.call:C.put):C.muted}}>{t.toUpperCase()}</button>
          ))}
        </div>
        <div style={{background:C.s3,border:`1px solid ${C.b2}`,padding:'12px 14px',marginBottom:20,borderLeft:`3px solid ${type==='call'?C.call:C.put}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:2}}>BS PRICE</span>
            <Pill color={mCol}>{mStr}</Pill>
          </div>
          <div style={{fontFamily:DI,fontSize:28,color:C.text,fontWeight:'bold'}}>${price.toFixed(4)}</div>
          <div style={{display:'flex',gap:16,marginTop:4}}>
            <span style={{fontFamily:MO,fontSize:8,color:C.muted}}>Intrinsic <span style={{color:C.text}}>${intr.toFixed(4)}</span></span>
            <span style={{fontFamily:MO,fontSize:8,color:C.muted}}>Time <span style={{color:C.cyan}}>${Math.max(g.price-intr,0).toFixed(4)}</span></span>
          </div>
        </div>
        <Slider label="SPOT S"       val={S}  set={setS}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}/>
        <Slider label="STRIKE K"     val={K}  set={setK}  min={10}  max={2000} step={0.5}  fmt={v=>`$${v.toFixed(2)}`}/>
        <Slider label="EXPIRY T"     val={Td} set={setTd} min={1}   max={730}  step={1}    fmt={v=>`${v}d`}/>
        <Slider label="VOLATILITY σ" val={σ}  set={setσ}  min={1}   max={200}  step={0.5}  fmt={v=>`${v.toFixed(1)}%`}/>
        <Slider label="RISK-FREE r"  val={r}  set={setR}  min={0}   max={20}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}/>
        <Slider label="DIVIDEND q"   val={q}  set={setq}  min={0}   max={15}   step={0.05} fmt={v=>`${v.toFixed(2)}%`}/>
        <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <div style={{fontFamily:MO,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:8}}>PAYOFF AT EXPIRY</div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={Array.from({length:60},(_,i)=>{const s=S*0.5+S*1.2*(i/59);return{S:parseFloat(s.toFixed(1)),pnl:parseFloat(((type==='call'?Math.max(s-K,0):Math.max(K-s,0))-g.price).toFixed(3))};})}>
              <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.3}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="S" tick={false} axisLine={false}/>
              <YAxis tick={false} axisLine={false}/>
              <ReferenceLine y={0} stroke={C.b3}/>
              <ReferenceLine x={K} stroke={C.amber} strokeDasharray="3 2"/>
              <Area type="monotone" dataKey="pnl" stroke={C.green} fill="url(#pg)" strokeWidth={1.5} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {[['Δ',g.delta,C.cyan],['Γ',g.gamma,C.green],['ν',g.vega,C.orange],['Θ',g.theta,C.put],['ρ',g.rho,C.purple],['N(d₂)',g.Nd2,C.amber]].map(([k,v,c])=>(
            <div key={k} style={{background:C.s3,padding:'5px 8px',borderLeft:`2px solid ${c}`}}>
              <div style={{fontFamily:MO,fontSize:7,color:C.muted}}>{k}</div>
              <div style={{fontFamily:MO,fontSize:10,color:c,fontWeight:'bold'}}>{v.toFixed(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── OPTIONS CHAIN ── */
function ChainTable({chainData,loading,error,spot,expiry,setExpiry}){
  const[side,setSide]=useState('calls');
  const[sortKey,setSort]=useState('strike');
  const[sortDir,setSortDir]=useState(1);
  const toggleSort=k=>{if(sortKey===k)setSortDir(d=>-d);else{setSort(k);setSortDir(1);}};
  if(loading)return<Spin/>;
  if(error)return<Err msg={error}/>;
  if(!chainData)return null;
  const contracts=(side==='calls'?chainData.calls:chainData.puts)||[];
  const sorted=[...contracts].sort((a,b)=>(a[sortKey]>b[sortKey]?1:-1)*sortDir);
  const cols=[
    {key:'strike',      label:'STRIKE',   fmt:(v,r)=>v.toFixed(2), align:'left'},
    {key:'bid',         label:'BID',      fmt:v=>v.toFixed(2)},
    {key:'ask',         label:'ASK',      fmt:v=>v.toFixed(2)},
    {key:'mid',         label:'MID',      fmt:v=>v.toFixed(2)},
    {key:'iv',          label:'IV %',     fmt:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    {key:'bs_price',    label:'BS PRICE', fmt:v=>v.toFixed(3)},
    {key:'mispricing',  label:'α EDGE',   fmt:v=>`${v>0?'+':''}${v.toFixed(3)}`},
    {key:'greek_delta', label:'Δ',        fmt:v=>`${v>0?'+':''}${v.toFixed(4)}`},
    {key:'greek_gamma', label:'Γ',        fmt:v=>v.toFixed(5)},
    {key:'greek_theta', label:'Θ/d',      fmt:v=>v.toFixed(5)},
    {key:'volume',      label:'VOL',      fmt:v=>v.toLocaleString()},
    {key:'open_interest',label:'OI',      fmt:v=>v.toLocaleString()},
    {key:'moneyness',   label:'',         fmt:v=>v},
  ];
  const rowBg=row=>row.moneyness==='ITM'?`${C.green}0a`:row.moneyness==='ATM'?`${C.amber}0a`:'transparent';
  const cellCol=(col,row)=>{
    if(col.key==='strike')return Math.abs(row.strike-(spot||0))<(spot||1)*0.005?C.amber:C.text;
    if(col.key==='iv')return C.orange;
    if(col.key==='mispricing')return row.mispricing>0.05?C.green:row.mispricing<-0.05?C.red:C.muted;
    if(col.key==='greek_delta')return side==='calls'?C.cyan:C.put;
    if(col.key==='moneyness')return row.moneyness==='ITM'?C.green:row.moneyness==='ATM'?C.amber:C.muted;
    return C.text2;
  };
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
      {/* Expiry bar */}
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,padding:'7px 16px',borderBottom:`1px solid ${C.border}`,background:C.s2,flexShrink:0}}>
        <span style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:2,marginRight:4}}>EXPIRY</span>
        {chainData.all_expiries?.slice(0,8).map(e=>(
          <button key={e} onClick={()=>setExpiry(e)} style={{fontFamily:MO,fontSize:8,padding:'3px 8px',cursor:'pointer',background:(expiry||chainData.expiry)===e?`${C.cyan}20`:'transparent',border:`1px solid ${(expiry||chainData.expiry)===e?C.cyan:C.b2}`,color:(expiry||chainData.expiry)===e?C.cyan:C.muted}}>{e}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12,fontFamily:MO,fontSize:8,color:C.muted}}>
          <span>T={chainData.T}yr</span><span>S=${chainData.spot}</span><span>r={(chainData.r*100).toFixed(2)}%</span>
          <Pill color={C.green}>LIVE</Pill>
        </div>
      </div>
      {/* Call/Put */}
      <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {['calls','puts'].map(s=>(
          <button key={s} onClick={()=>setSide(s)} style={{flex:1,padding:'9px 0',border:'none',cursor:'pointer',fontFamily:DI,fontSize:11,letterSpacing:3,background:side===s?(s==='calls'?`${C.call}15`:`${C.put}15`):'transparent',borderBottom:side===s?`2px solid ${s==='calls'?C.call:C.put}`:'2px solid transparent',color:side===s?(s==='calls'?C.call:C.put):C.muted}}>
            {s.toUpperCase()} ({(s==='calls'?chainData.calls:chainData.puts)?.length||0})
          </button>
        ))}
      </div>
      {/* Table */}
      <div style={{flex:1,overflowY:'auto',overflowX:'auto',minHeight:0}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:MO}}>
          <thead>
            <tr style={{background:C.s3,position:'sticky',top:0,zIndex:1}}>
              {cols.map(c=>(
                <th key={c.key} onClick={()=>toggleSort(c.key)} style={{padding:'7px 10px',textAlign:c.align||'right',cursor:'pointer',fontWeight:'normal',color:sortKey===c.key?C.cyan:C.muted,fontSize:8,letterSpacing:1,borderBottom:`1px solid ${C.b2}`,whiteSpace:'nowrap'}}>
                  {c.label}{sortKey===c.key?(sortDir===1?' ↑':' ↓'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row,i)=>(
              <tr key={i} style={{background:rowBg(row),borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.s3}
                onMouseLeave={e=>e.currentTarget.style.background=rowBg(row)}>
                {cols.map(c=>(
                  <td key={c.key} style={{padding:'5px 10px',textAlign:c.align||'right',color:cellCol(c,row),fontWeight:c.key==='strike'?'bold':'normal'}}>
                    {row[c.key]!=null?c.fmt(row[c.key],row):'—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{padding:'6px 16px',borderTop:`1px solid ${C.border}`,display:'flex',gap:16,fontFamily:MO,fontSize:8,color:C.muted,flexShrink:0}}>
        <span><span style={{color:C.green}}>■</span> ITM</span>
        <span><span style={{color:C.amber}}>■</span> ATM ±0.5%</span>
        <span>α EDGE = BS − Market</span>
        <span style={{marginLeft:'auto'}}>{sorted.length} contracts shown</span>
      </div>
    </div>
  );
}

/* ── IV SMILE ── */
function IVSmile({data,loading,error,ticker}){
  if(loading)return<Spin/>;
  if(error)return<Err msg={error}/>;
  if(!data)return null;
  const calls=data.calls.filter(c=>c.iv!=null).map(c=>({strike:c.strike,iv:c.iv}));
  const puts=data.puts.filter(c=>c.iv!=null).map(c=>({strike:c.strike,iv:c.iv}));
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontFamily:MO,fontSize:8,color:C.muted,letterSpacing:3}}>
        LIVE IMPLIED VOLATILITY SMILE · {ticker} · {data.expiry} · Newton-Raphson from bid/ask mid
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{top:10,right:20,left:0,bottom:10}}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" opacity={0.4}/>
          <XAxis dataKey="strike" stroke={C.muted} name="Strike" tick={{fontFamily:MO,fontSize:8,fill:C.muted}} tickFormatter={v=>`$${v}`}/>
          <YAxis dataKey="iv" stroke={C.muted} name="IV" tick={{fontFamily:MO,fontSize:8,fill:C.muted}} tickFormatter={v=>`${v}%`}/>
          <Tooltip contentStyle={TT} formatter={(v,n)=>[typeof v==='number'?`${v.toFixed(2)}%`:v,n]}/>
          <ReferenceLine x={data.spot} stroke={C.amber} strokeDasharray="4 2" label={{value:'Spot',fill:C.amber,fontFamily:MO,fontSize:8}}/>
          <Scatter data={calls} name="Call IV" fill={C.call} opacity={0.9}/>
          <Scatter data={puts} name="Put IV" fill={C.put} opacity={0.9}/>
          <Legend wrapperStyle={{fontFamily:MO,fontSize:9}}/>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{fontFamily:MO,fontSize:9,color:C.muted,padding:'12px 0',borderTop:`1px solid ${C.border}`,lineHeight:1.7}}>
        The equity volatility skew: OTM puts trade at higher IV than OTM calls — markets price in crash risk asymmetrically.
        Black-Scholes assumes flat vol (one σ for all strikes). This chart shows exactly where that assumption breaks down.
      </div>
    </div>
  );
}

/* ── ALPHA EDGE ── */
function AlphaEdge({data,loading,error,ticker}){
  if(loading)return<Spin/>;
  if(error)return<Err msg={error}/>;
  if(!data)return null;
  const calls=data.contracts.filter(c=>c.type==='call');
  const puts=data.contracts.filter(c=>c.type==='put');
  return(
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontFamily:MO,fontSize:8,color:C.muted,letterSpacing:3}}>
        MODEL vs MARKET · α EDGE ANALYSIS · {ticker} · {data.expiry}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:C.border}}>
        {[['CONTRACTS',data.summary.total_contracts,C.text],['AVG MISPRICING',`$${data.summary.avg_mispricing}`,Math.abs(data.summary.avg_mispricing)<0.1?C.muted:C.amber],['MAX OVERPRICED K',`$${data.summary.max_overpriced}`,C.green],['MAX UNDERPRICED K',`$${data.summary.max_underpriced}`,C.red]].map(([k,v,c])=>(
          <div key={k} style={{background:C.s2,padding:'14px 16px'}}>
            <div style={{fontFamily:MO,fontSize:7,color:C.muted,letterSpacing:2,marginBottom:4}}>{k}</div>
            <div style={{fontFamily:DI,fontSize:18,color:c,fontWeight:'bold'}}>{v}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{top:10,right:20,left:0,bottom:10}}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" opacity={0.4}/>
          <XAxis dataKey="strike" stroke={C.muted} name="Strike" tick={{fontFamily:MO,fontSize:8,fill:C.muted}} tickFormatter={v=>`$${v}`}/>
          <YAxis dataKey="mispricing" stroke={C.muted} name="α Edge" tick={{fontFamily:MO,fontSize:8,fill:C.muted}} tickFormatter={v=>`$${v.toFixed(2)}`}/>
          <Tooltip contentStyle={TT} formatter={(v,n)=>[typeof v==='number'?`$${v.toFixed(4)}`:v,n]}/>
          <ReferenceLine y={0} stroke={C.b3} strokeWidth={1.5} label={{value:'Fair',fill:C.muted,fontFamily:MO,fontSize:8}}/>
          <ReferenceLine x={data.spot} stroke={C.amber} strokeDasharray="4 2" label={{value:'Spot',fill:C.amber,fontFamily:MO,fontSize:8}}/>
          <Scatter data={calls} name="Calls α" fill={C.call} opacity={0.85}/>
          <Scatter data={puts} name="Puts α" fill={C.put} opacity={0.85}/>
          <Legend wrapperStyle={{fontFamily:MO,fontSize:9}}/>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{fontFamily:MO,fontSize:9,color:C.muted,padding:'12px 0',borderTop:`1px solid ${C.border}`,lineHeight:1.7}}>
        α Edge = BS theoretical price − market mid price. Positive = BS overprices vs market.
        Negative = BS underprices (market pricing in extra risk). The pattern reveals the vol skew.
      </div>
    </div>
  );
}

/* ── MAIN APP ── */
export default function App(){
  const[ticker,setTicker]=useState('AAPL');
  const[tab,setTab]=useState('chain');
  const[pricer,setPricer]=useState(false);
  const[apiLive,setApiLive]=useState(false);
  const[time,setTime]=useState('');
  const[expiry,setExpiry]=useState(null);

  useEffect(()=>{
    const f=()=>setTime(new Date().toLocaleTimeString('en-GB',{hour12:false})+' UTC');
    f();const t=setInterval(f,1000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const check=()=>fetch(`${API}/health`).then(()=>setApiLive(true)).catch(()=>setApiLive(false));
    check();const t=setInterval(check,15000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{setExpiry(null);},[ticker]);

  const{data:quote,loading:qLoad}=useFetch(ticker?`${API}/api/quote/${ticker}`:null);
  const chainUrl=ticker?(expiry?`${API}/api/chain/${ticker}?expiry=${expiry}`:`${API}/api/chain/${ticker}`):null;
  const{data:chain,loading:cLoad,error:cErr}=useFetch(chainUrl);
  const{data:cmpData,loading:mpLoad,error:mpErr}=useFetch(ticker?`${API}/api/compare/${ticker}`:null);

  const TABS=[{id:'chain',label:'OPTIONS CHAIN'},{id:'smile',label:'IV SMILE'},{id:'alpha',label:'α EDGE'}];

  return(
    <div style={{height:'100vh',width:'100vw',overflow:'hidden',background:C.bg,color:C.text,fontFamily:MO,display:'flex',flexDirection:'column'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;700&display=swap');
        html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${C.bg};}
        *{box-sizing:border-box;}
        input[type=range]{cursor:pointer;border:none;background:transparent;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:${C.cyan};border:2px solid ${C.bg};box-shadow:0 0 5px ${C.cyan};}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        ::-webkit-scrollbar{width:3px;height:3px;background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.b2};border-radius:2px}
        button{outline:none;transition:all .15s;background:transparent;}
        input{outline:none;}
        tr{transition:background .1s;}
      `}</style>

      <TopBar ticker={ticker} onLoad={t=>{setTicker(t);setTab('chain');}} apiOnline={apiLive} time={time}/>
      <QuoteStrip q={quote} loading={qLoad}/>
      {quote&&<GreeksStrip S={quote.price} K={quote.price} T_={45/365} r={quote.risk_free_rate} σ={quote.hist_vol_30d} q={quote.dividend_yield} type="call"/>}

      {/* Tab bar */}
      <div style={{display:'flex',alignItems:'center',background:C.s2,borderBottom:`1px solid ${C.b2}`,flexShrink:0,height:40}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{height:'100%',padding:'0 24px',border:'none',cursor:'pointer',fontFamily:MO,fontSize:9,letterSpacing:2,background:'transparent',borderBottom:tab===t.id?`2px solid ${C.cyan}`:'2px solid transparent',color:tab===t.id?C.cyan:C.muted}}>{t.label}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12,padding:'0 16px'}}>
          {chain&&<span style={{fontFamily:MO,fontSize:8,color:C.muted}}>{chain.total_contracts} contracts · {chain.expiry}</span>}
          <button onClick={()=>setPricer(p=>!p)} style={{fontFamily:MO,fontSize:8,padding:'5px 14px',cursor:'pointer',letterSpacing:2,background:pricer?`${C.cyan}20`:'transparent',border:`1px solid ${pricer?C.cyan:C.b2}`,color:pricer?C.cyan:C.muted}}>⊞ PRICER</button>
          {quote&&<Pill color={C.green}>LIVE · {ticker}</Pill>}
        </div>
      </div>

      {/* Content — flex:1 + minHeight:0 is the correct pattern to fill remaining space */}
      <div style={{flex:1,minHeight:0,overflow:'auto',display:'flex',flexDirection:'column'}}>
        {!apiLive&&(
          <div style={{margin:12,padding:12,background:`${C.red}0d`,border:`1px solid ${C.red}30`,fontFamily:MO,fontSize:9,color:C.red,flexShrink:0}}>
            ⚠ API offline — <span style={{color:C.orange}}>python api.py</span> to enable live data
          </div>
        )}
        <div style={{flex:1,minHeight:0,overflow:'auto'}}>
          {tab==='chain'&&<ChainTable chainData={chain} loading={cLoad} error={cErr} spot={quote?.price} expiry={expiry} setExpiry={setExpiry}/>}
          {tab==='smile'&&<IVSmile data={chain} loading={cLoad} error={cErr} ticker={ticker}/>}
          {tab==='alpha'&&<AlphaEdge data={cmpData} loading={mpLoad} error={mpErr} ticker={ticker}/>}
        </div>
      </div>

      <PricerDrawer open={pricer} defaultS={quote?.price} defaultR={quote?.risk_free_rate} defaultQ={quote?.dividend_yield} onClose={()=>setPricer(false)}/>
    </div>
  );
}
