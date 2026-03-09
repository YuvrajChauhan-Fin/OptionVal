import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell
} from "recharts";

/* ============================================================
   CONSTANTS & THEME
   ============================================================ */
const API = "https://optionval-api.onrender.com";

const C = {
  bg:       '#060a0f',
  panel:    '#080d14',
  panel2:   '#0a1220',
  panel3:   '#0d1829',
  border:   '#0f2035',
  border2:  '#163352',
  border3:  '#1d4570',
  bs:       '#00c8ff',
  binom:    '#00e87a',
  mc:       '#ff7043',
  amer:     '#b388ff',
  text:     '#d4e8ff',
  text2:    '#8ab4d4',
  muted:    '#3d6680',
  dim:      '#162535',
  call:     '#00c8ff',
  put:      '#ff4f7b',
  gold:     '#ffc107',
  green:    '#00e87a',
  red:      '#ff3d5a',
  orange:   '#ff7043',
  itm:      '#00e87a22',
  otm:      '#ff3d5a11',
  atm:      '#ffc10722',
};

const MONO = '"JetBrains Mono", "Fira Code", monospace';
const DISPLAY = '"Share Tech Mono", "Courier New", monospace';

/* ============================================================
   BLACK-SCHOLES ENGINE (client-side fallback)
   ============================================================ */
function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,
        a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const s=x<0?-1:1; x=Math.abs(x);
  const t=1/(1+p*x);
  return s*(1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));
}
const ncdf = x => 0.5*(1+erf(x/Math.sqrt(2)));
const npdf = x => Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);

function bsCalc(S,K,T,r,sigma,q,type) {
  if(T<=0||sigma<=0) return {price:Math.max(type==='call'?S-K:K-S,0),d1:0,d2:0,delta:type==='call'?1:0,gamma:0,vega:0,theta:0,rho:0};
  const sqT=Math.sqrt(T);
  const d1=(Math.log(S/K)+(r-q+0.5*sigma*sigma)*T)/(sigma*sqT);
  const d2=d1-sigma*sqT;
  const eq=Math.exp(-q*T),er=Math.exp(-r*T),nd1=npdf(d1);
  const price=type==='call'?S*eq*ncdf(d1)-K*er*ncdf(d2):K*er*ncdf(-d2)-S*eq*ncdf(-d1);
  const delta=type==='call'?eq*ncdf(d1):eq*(ncdf(d1)-1);
  const gamma=eq*nd1/(S*sigma*sqT);
  const vega=S*eq*nd1*sqT/100;
  const t1=-(S*eq*nd1*sigma)/(2*sqT);
  const t2=type==='call'?q*S*eq*ncdf(d1)-r*K*er*ncdf(d2):-q*S*eq*ncdf(-d1)+r*K*er*ncdf(-d2);
  const theta=(t1+t2)/365;
  const rho=type==='call'?K*T*er*ncdf(d2)/100:-K*T*er*ncdf(-d2)/100;
  return {price,d1,d2,delta,gamma,vega,theta,rho,nd1:ncdf(d1),nd2:ncdf(d2)};
}

/* ============================================================
   HOOKS
   ============================================================ */
function useApi(url, deps=[]) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  useEffect(() => {
    if(!url) return;
    setLoading(true); setError(null);
    fetch(url)
      .then(r=>r.ok?r.json():r.json().then(e=>{throw new Error(e.detail||'API error')}))
      .then(d=>{setData(d);setLoading(false)})
      .catch(e=>{setError(e.message);setLoading(false)});
  }, deps);
  return {data, loading, error};
}

function useAnimated(target, ms=300) {
  const [val, setVal] = useState(target);
  const ref = useRef(target);
  useEffect(()=>{
    const s=ref.current, start=performance.now();
    const f=(now)=>{
      const p=Math.min((now-start)/ms,1);
      const e=1-Math.pow(1-p,3);
      setVal(s+(target-s)*e);
      if(p<1) requestAnimationFrame(f); else ref.current=target;
    };
    requestAnimationFrame(f);
  },[target]);
  return val;
}

/* ============================================================
   SHARED UI PRIMITIVES
   ============================================================ */
const TT = { background:C.panel2, border:`1px solid ${C.border2}`, fontFamily:MONO, fontSize:10, color:C.text };

function Panel({children, style={}, glow}) {
  return (
    <div style={{
      background:C.panel, border:`1px solid ${C.border}`,
      ...(glow?{boxShadow:`0 0 20px ${glow}15`}:{}),
      ...style,
    }}>{children}</div>
  );
}

function PanelHeader({label, sub, color=C.bs, right}) {
  return (
    <div style={{
      display:'flex',justifyContent:'space-between',alignItems:'center',
      padding:'8px 14px', borderBottom:`1px solid ${C.border}`,
      background:`linear-gradient(90deg,${color}08,transparent)`,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:3,height:14,background:color,borderRadius:2}}/>
        <span style={{fontFamily:MONO,fontSize:9,color,letterSpacing:3}}>{label}</span>
        {sub&&<span style={{fontFamily:MONO,fontSize:8,color:C.muted}}>{sub}</span>}
      </div>
      {right&&<div style={{fontFamily:MONO,fontSize:8,color:C.muted}}>{right}</div>}
    </div>
  );
}

function Stat({label, value, sub, color=C.text, size=14}) {
  return (
    <div style={{padding:'8px 12px'}}>
      <div style={{fontFamily:MONO,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:2}}>{label}</div>
      <div style={{fontFamily:DISPLAY,fontSize:size,color,fontWeight:'bold'}}>{value}</div>
      {sub&&<div style={{fontFamily:MONO,fontSize:8,color:C.muted,marginTop:1}}>{sub}</div>}
    </div>
  );
}

function Badge({children, color}) {
  return (
    <span style={{
      fontFamily:MONO,fontSize:8,padding:'2px 6px',
      background:`${color}20`,color,border:`1px solid ${color}40`,
      letterSpacing:1,
    }}>{children}</span>
  );
}

function Spinner() {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40}}>
      <div style={{
        width:20,height:20,border:`2px solid ${C.border2}`,
        borderTop:`2px solid ${C.bs}`,borderRadius:'50%',
        animation:'spin 0.8s linear infinite',
      }}/>
    </div>
  );
}

function ErrorMsg({msg}) {
  return (
    <div style={{padding:16,fontFamily:MONO,fontSize:10,color:C.red,
      background:`${C.red}10`,border:`1px solid ${C.red}30`,margin:12}}>
      ⚠ {msg}
    </div>
  );
}

/* ============================================================
   TICKER SEARCH BAR
   ============================================================ */
function TickerSearch({onSelect, current}) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);

  useEffect(()=>{
    if(!q) {setResults([]);return;}
    fetch(`${API}/api/search?q=${q}`)
      .then(r=>r.json()).then(d=>setResults(d.results||[])).catch(()=>{});
  },[q]);

  return (
    <div style={{position:'relative'}}>
      <div style={{display:'flex',alignItems:'center',gap:0}}>
        <span style={{
          fontFamily:MONO,fontSize:9,color:C.muted,padding:'6px 10px',
          background:C.panel3,border:`1px solid ${C.border2}`,
          borderRight:'none',letterSpacing:2,
        }}>TICKER</span>
        <input
          value={q} placeholder={current||'AAPL, RELIANCE.NS...'}
          onChange={e=>{setQ(e.target.value);setOpen(true)}}
          onFocus={()=>setOpen(true)}
          onBlur={()=>setTimeout(()=>setOpen(false),200)}
          style={{
            fontFamily:DISPLAY,fontSize:14,color:C.text,
            background:C.panel3,border:`1px solid ${C.border2}`,
            padding:'6px 12px',outline:'none',width:200,
            letterSpacing:2,
          }}
        />
        <button onClick={()=>{onSelect(q.toUpperCase());setOpen(false);setQ('');}} style={{
          fontFamily:MONO,fontSize:9,padding:'6px 14px',
          background:C.bs+'20',border:`1px solid ${C.bs}40`,
          color:C.bs,cursor:'pointer',letterSpacing:2,
        }}>LOAD →</button>
      </div>
      {open && results.length>0 && (
        <div style={{
          position:'absolute',top:'100%',left:0,right:0,zIndex:100,
          background:C.panel2,border:`1px solid ${C.border2}`,
          boxShadow:`0 8px 32px ${C.bg}`,
        }}>
          {results.map(r=>(
            <div key={r.ticker} onMouseDown={()=>{onSelect(r.ticker);setQ('');setOpen(false);}}
              style={{
                padding:'8px 12px',cursor:'pointer',display:'flex',
                justifyContent:'space-between',alignItems:'center',
                borderBottom:`1px solid ${C.border}`,
              }}
              onMouseEnter={e=>e.currentTarget.style.background=C.panel3}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              <span style={{fontFamily:DISPLAY,fontSize:12,color:C.bs}}>{r.ticker}</span>
              <span style={{fontFamily:MONO,fontSize:9,color:C.muted}}>{r.name}</span>
              <span style={{fontFamily:MONO,fontSize:8,color:C.gold}}>{r.market}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   QUOTE HEADER
   ============================================================ */
function QuoteHeader({quote, loading}) {
  const animPrice = useAnimated(quote?.price||0);
  if(loading) return <div style={{padding:16}}><Spinner/></div>;
  if(!quote) return null;
  const up = quote.change >= 0;
  return (
    <div style={{
      display:'flex',alignItems:'center',gap:0,
      borderBottom:`1px solid ${C.border2}`,
      background:`linear-gradient(90deg,${C.panel3},${C.panel})`,
    }}>
      <div style={{padding:'12px 20px',borderRight:`1px solid ${C.border2}`}}>
        <div style={{fontFamily:DISPLAY,fontSize:22,color:C.text,letterSpacing:1}}>
          {quote.ticker}
        </div>
        <div style={{fontFamily:MONO,fontSize:9,color:C.muted,marginTop:2}}>
          {quote.flag} {quote.exchange} · {quote.name}
        </div>
      </div>
      <div style={{padding:'12px 20px',borderRight:`1px solid ${C.border2}`}}>
        <div style={{fontFamily:DISPLAY,fontSize:24,color:C.text,fontWeight:'bold'}}>
          {quote.currency==='INR'?'₹':'$'}{animPrice.toFixed(2)}
        </div>
        <div style={{fontFamily:MONO,fontSize:11,color:up?C.green:C.red,marginTop:2}}>
          {up?'▲':'▼'} {Math.abs(quote.change).toFixed(2)} ({Math.abs(quote.change_pct).toFixed(2)}%)
        </div>
      </div>
      {[
        ['30D HIST VOL', `${(quote.hist_vol_30d*100).toFixed(1)}%`, C.orange],
        ['RISK-FREE r', `${(quote.risk_free_rate*100).toFixed(2)}%`, C.muted],
        ['DIV YIELD q', `${(quote.dividend_yield*100).toFixed(2)}%`, C.muted],
        ['MARKET CAP', quote.market_cap>1e12?`${(quote.market_cap/1e12).toFixed(2)}T`:
          quote.market_cap>1e9?`${(quote.market_cap/1e9).toFixed(1)}B`:'N/A', C.text2],
        ['SECTOR', quote.sector||'N/A', C.text2],
      ].map(([k,v,c])=>(
        <div key={k} style={{padding:'12px 16px',borderRight:`1px solid ${C.border}`}}>
          <div style={{fontFamily:MONO,fontSize:8,color:C.muted,letterSpacing:2}}>{k}</div>
          <div style={{fontFamily:MONO,fontSize:12,color:c,marginTop:3}}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   OPTIONS CHAIN TABLE
   ============================================================ */
function OptionsChainTable({chainData, spot}) {
  const [view, setView]     = useState('calls');
  const [sortBy, setSortBy] = useState('strike');
  const [expiry, setExpiry] = useState(null);

  if(!chainData) return <Spinner/>;

  const contracts = (view==='calls'?chainData.calls:chainData.puts)||[];
  const sorted    = [...contracts].sort((a,b)=>a[sortBy]>b[sortBy]?1:-1);

  const cols = [
    {key:'strike',    label:'STRIKE',  fmt:v=>`${v.toFixed(2)}`},
    {key:'bid',       label:'BID',     fmt:v=>`${v.toFixed(2)}`},
    {key:'ask',       label:'ASK',     fmt:v=>`${v.toFixed(2)}`},
    {key:'mid',       label:'MID',     fmt:v=>`${v.toFixed(2)}`},
    {key:'iv',        label:'IV %',    fmt:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    {key:'bs_price',  label:'BS PRICE',fmt:v=>`${v.toFixed(3)}`},
    {key:'mispricing',label:'α EDGE',  fmt:v=>`${v>0?'+':''}${v.toFixed(3)}`},
    {key:'greek_delta',label:'Δ DELTA',fmt:v=>`${v>0?'+':''}${v.toFixed(3)}`},
    {key:'greek_gamma',label:'Γ GAMMA',fmt:v=>v.toFixed(4)},
    {key:'greek_theta',label:'Θ/DAY',  fmt:v=>`${v.toFixed(4)}`},
    {key:'volume',    label:'VOL',     fmt:v=>v.toLocaleString()},
    {key:'open_interest',label:'OI',  fmt:v=>v.toLocaleString()},
    {key:'moneyness', label:'ITM/OTM', fmt:v=>v},
  ];

  const rowBg = (row) => {
    if(row.moneyness==='ITM') return C.itm;
    if(row.moneyness==='ATM') return C.atm;
    return 'transparent';
  };

  return (
    <Panel>
      <PanelHeader
        label="LIVE OPTIONS CHAIN"
        sub={`${chainData.ticker} · ${chainData.expiry} · ${chainData.total_contracts} contracts`}
        color={C.bs}
        right={
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {chainData.all_expiries?.slice(0,5).map(e=>(
              <button key={e} onClick={()=>setExpiry(e)} style={{
                fontFamily:MONO,fontSize:8,padding:'2px 6px',cursor:'pointer',
                background:chainData.expiry===e?`${C.bs}30`:'transparent',
                border:`1px solid ${chainData.expiry===e?C.bs:C.border2}`,
                color:chainData.expiry===e?C.bs:C.muted,
              }}>{e}</button>
            ))}
          </div>
        }
      />
      <div style={{display:'flex',gap:0,borderBottom:`1px solid ${C.border}`}}>
        {['calls','puts'].map(t=>(
          <button key={t} onClick={()=>setView(t)} style={{
            flex:1,padding:'8px',fontFamily:DISPLAY,fontSize:12,letterSpacing:2,
            background:view===t?(t==='calls'?`${C.call}20`:`${C.put}20`):'transparent',
            border:'none',borderBottom:view===t?`2px solid ${t==='calls'?C.call:C.put}`:'2px solid transparent',
            color:view===t?(t==='calls'?C.call:C.put):C.muted,cursor:'pointer',
          }}>{t.toUpperCase()} ({(view==='calls'?chainData.calls:chainData.puts)?.length||0})</button>
        ))}
      </div>
      <div style={{overflowX:'auto', maxHeight:360, overflowY:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:MONO}}>
          <thead>
            <tr style={{background:C.panel3,position:'sticky',top:0,zIndex:1}}>
              {cols.map(c=>(
                <th key={c.key} onClick={()=>setSortBy(c.key)} style={{
                  padding:'6px 10px',textAlign:'right',color:sortBy===c.key?C.bs:C.muted,
                  letterSpacing:1,fontSize:8,cursor:'pointer',fontWeight:'normal',
                  borderBottom:`1px solid ${C.border2}`,whiteSpace:'nowrap',
                }}>
                  {c.label}{sortBy===c.key?' ↑':''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row,i)=>(
              <tr key={i} style={{
                background:rowBg(row),
                borderBottom:`1px solid ${C.border}`,
              }}
                onMouseEnter={e=>e.currentTarget.style.background=C.panel3}
                onMouseLeave={e=>e.currentTarget.style.background=rowBg(row)}
              >
                {cols.map(c=>{
                  const v = row[c.key];
                  let color = C.text2;
                  if(c.key==='mispricing') color=v>0?C.green:v<0?C.red:C.muted;
                  if(c.key==='iv') color=C.orange;
                  if(c.key==='moneyness') color=v==='ITM'?C.green:v==='ATM'?C.gold:C.muted;
                  if(c.key==='strike') color=Math.abs(row.strike-spot)<spot*0.005?C.gold:C.text;
                  return (
                    <td key={c.key} style={{
                      padding:'5px 10px',textAlign:'right',color,
                      fontWeight:c.key==='strike'?'bold':'normal',
                    }}>
                      {v!=null?c.fmt(v):'—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        display:'flex',gap:16,padding:'8px 14px',
        borderTop:`1px solid ${C.border}`,fontFamily:MONO,fontSize:8,color:C.muted,
      }}>
        <span>T = {chainData.T} yr</span>
        <span>S = ${chainData.spot}</span>
        <span>r = {(chainData.r*100).toFixed(2)}%</span>
        <span style={{color:C.green}}>■ ITM</span>
        <span style={{color:C.gold}}>■ ATM ±0.5%</span>
        <span style={{color:C.muted}}>α EDGE = BS Price − Market Price</span>
      </div>
    </Panel>
  );
}

/* ============================================================
   MISPRICING / ALPHA CHART
   ============================================================ */
function MispricingChart({compareData, spot}) {
  if(!compareData) return <Spinner/>;
  const calls = compareData.contracts.filter(c=>c.type==='call');
  const puts  = compareData.contracts.filter(c=>c.type==='put');
  return (
    <Panel>
      <PanelHeader
        label="MODEL vs MARKET · α EDGE ANALYSIS"
        sub="Where Black-Scholes diverges from market pricing"
        color={C.orange}
        right={`Avg mispricing: $${compareData.summary.avg_mispricing}`}
      />
      <div style={{padding:16}}>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{top:5,right:20,left:0,bottom:5}}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
            <XAxis dataKey="strike" stroke={C.muted} name="Strike"
              tick={{fontFamily:MONO,fontSize:8,fill:C.muted}}
              tickFormatter={v=>`$${v}`}/>
            <YAxis dataKey="mispricing" stroke={C.muted} name="α Edge"
              tick={{fontFamily:MONO,fontSize:8,fill:C.muted}}
              tickFormatter={v=>`$${v.toFixed(2)}`}/>
            <Tooltip contentStyle={TT}
              formatter={(v,n)=>[typeof v==='number'?`$${v.toFixed(4)}`:v,n]}
              cursor={{strokeDasharray:'3 3',stroke:C.muted}}/>
            <ReferenceLine y={0} stroke={C.border3} strokeWidth={1.5}
              label={{value:'Fair Value',fill:C.muted,fontFamily:MONO,fontSize:8}}/>
            <ReferenceLine x={spot} stroke={C.gold} strokeDasharray="4 2"
              label={{value:'Spot',fill:C.gold,fontFamily:MONO,fontSize:8}}/>
            <Scatter data={calls} name="Calls α" fill={C.call} opacity={0.8}/>
            <Scatter data={puts}  name="Puts α"  fill={C.put}  opacity={0.8}/>
            <Legend wrapperStyle={{fontFamily:MONO,fontSize:9}}/>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{
          display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,
          marginTop:12,padding:'8px 0',borderTop:`1px solid ${C.border}`,
        }}>
          {[
            ['TOTAL CONTRACTS', compareData.summary.total_contracts, C.text],
            ['MAX OVERPRICED K', `$${compareData.summary.max_overpriced}`, C.green],
            ['MAX UNDERPRICED K', `$${compareData.summary.max_underpriced}`, C.red],
          ].map(([k,v,c])=>(
            <div key={k} style={{textAlign:'center'}}>
              <div style={{fontFamily:MONO,fontSize:8,color:C.muted}}>{k}</div>
              <div style={{fontFamily:MONO,fontSize:13,color:c,fontWeight:'bold'}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================
   IV SMILE CHART (real data)
   ============================================================ */
function IVSmileChart({chainData}) {
  if(!chainData) return <Spinner/>;
  const data = [...chainData.calls, ...chainData.puts]
    .filter(c=>c.iv!=null)
    .map(c=>({
      strike: c.strike,
      log_m:  parseFloat(Math.log(c.strike/chainData.spot).toFixed(3)),
      iv:     c.iv,
      type:   c.type,
    }))
    .sort((a,b)=>a.strike-b.strike);

  const calls = data.filter(d=>d.type==='call');
  const puts  = data.filter(d=>d.type==='put');

  return (
    <Panel>
      <PanelHeader
        label="LIVE IMPLIED VOLATILITY SMILE"
        sub={`${chainData.ticker} · ${chainData.expiry} · Market prices`}
        color={C.orange}
        right="Phase 3 · Live data"
      />
      <div style={{padding:16}}>
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{top:5,right:20,left:0,bottom:5}}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
            <XAxis dataKey="strike" stroke={C.muted} name="Strike"
              tick={{fontFamily:MONO,fontSize:8,fill:C.muted}}
              tickFormatter={v=>`$${v}`}/>
            <YAxis dataKey="iv" stroke={C.muted} name="IV"
              tick={{fontFamily:MONO,fontSize:8,fill:C.muted}}
              tickFormatter={v=>`${v.toFixed(0)}%`}/>
            <Tooltip contentStyle={TT}
              formatter={(v,n)=>[typeof v==='number'?`${v.toFixed(2)}%`:v,n]}/>
            <ReferenceLine x={chainData.spot} stroke={C.gold} strokeDasharray="4 2"
              label={{value:'Spot',fill:C.gold,fontFamily:MONO,fontSize:8}}/>
            <Scatter data={calls} name="Call IV" fill={C.call} opacity={0.85}/>
            <Scatter data={puts}  name="Put IV"  fill={C.put}  opacity={0.85}/>
            <Legend wrapperStyle={{fontFamily:MONO,fontSize:9}}/>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{fontFamily:MONO,fontSize:8,color:C.muted,marginTop:8}}>
          Live market IV · Solved via Newton-Raphson from bid/ask mid prices
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================
   MANUAL PRICER (left panel)
   ============================================================ */
function ManualPricer({defaultS, defaultR, defaultQ}) {
  const [S,     setS]     = useState(defaultS||185);
  const [K,     setK]     = useState(defaultS||185);
  const [T,     setT]     = useState(45);
  const [r,     setR]     = useState((defaultR||0.0525)*100);
  const [sigma, setSigma] = useState(28);
  const [q,     setQ]     = useState((defaultQ||0.0055)*100);
  const [type,  setType]  = useState('call');

  useEffect(()=>{
    if(defaultS) {setS(defaultS);setK(defaultS);}
    if(defaultR) setR(defaultR*100);
    if(defaultQ) setQ(defaultQ*100);
  },[defaultS,defaultR,defaultQ]);

  const Ty=T/365, ry=r/100, sy=sigma/100, qy=q/100;
  const bs = bsCalc(S,K,Ty,ry,sy,qy,type);
  const intrinsic = Math.max(type==='call'?S-K:K-S,0);
  const moneyness = type==='call'?(S>K*1.005?'ITM':S<K*0.995?'OTM':'ATM'):(S<K*0.995?'ITM':S>K*1.005?'OTM':'ATM');
  const mColor    = moneyness==='ITM'?C.green:moneyness==='OTM'?C.red:C.gold;
  const animPrice = useAnimated(bs.price);

  const slider = (label, val, set, min, max, step, fmt, formula) => (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontFamily:MONO,fontSize:8,color:C.muted,letterSpacing:2}}>{label}</span>
        <span style={{fontFamily:MONO,fontSize:12,color:C.text,fontWeight:'bold'}}>{fmt(val)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{
          width:'100%',appearance:'none',WebkitAppearance:'none',height:2,outline:'none',
          background:`linear-gradient(90deg,${C.bs} ${((val-min)/(max-min))*100}%,${C.dim} 0%)`,
        }}
      />
      {formula&&<div style={{fontFamily:MONO,fontSize:7,color:C.dim,marginTop:2}}>{formula}</div>}
    </div>
  );

  return (
    <Panel style={{height:'100%',overflowY:'auto'}}>
      <PanelHeader label="MANUAL PRICER" sub="Override market inputs" color={C.bs}/>
      <div style={{padding:'14px 16px'}}>
        {/* Type toggle */}
        <div style={{display:'flex',gap:0,marginBottom:16}}>
          {['call','put'].map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{
              flex:1,padding:8,border:'none',cursor:'pointer',fontFamily:DISPLAY,
              fontSize:13,letterSpacing:2,
              background:type===t?(t==='call'?`${C.call}25`:`${C.put}25`):`${C.dim}`,
              borderBottom:type===t?`2px solid ${t==='call'?C.call:C.put}`:`2px solid ${C.border}`,
              color:type===t?(t==='call'?C.call:C.put):C.muted,
            }}>{t.toUpperCase()}</button>
          ))}
        </div>

        {/* Price display */}
        <div style={{
          background:C.panel3,border:`1px solid ${C.border2}`,
          padding:'12px 16px',marginBottom:16,
          borderLeft:`3px solid ${type==='call'?C.call:C.put}`,
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <span style={{fontFamily:MONO,fontSize:8,color:C.muted,letterSpacing:2}}>BS PRICE</span>
            <Badge color={mColor}>{moneyness} · {(S/K).toFixed(3)}×</Badge>
          </div>
          <div style={{fontFamily:DISPLAY,fontSize:28,color:C.text,fontWeight:'bold',marginTop:4}}>
            ${animPrice.toFixed(4)}
          </div>
          <div style={{display:'flex',gap:16,marginTop:6}}>
            <span style={{fontFamily:MONO,fontSize:9,color:C.muted}}>
              Intrinsic: <span style={{color:C.text}}>${intrinsic.toFixed(4)}</span>
            </span>
            <span style={{fontFamily:MONO,fontSize:9,color:C.muted}}>
              Time: <span style={{color:C.bs}}>${Math.max(bs.price-intrinsic,0).toFixed(4)}</span>
            </span>
          </div>
        </div>

        {slider('SPOT  S', S, setS, 10, 2000, 0.5, v=>`$${v.toFixed(2)}`, 'Current stock price')}
        {slider('STRIKE  K', K, setK, 10, 2000, 0.5, v=>`$${v.toFixed(2)}`, 'Option strike price')}
        {slider('EXPIRY  T', T, setT, 1, 365, 1, v=>`${v}d`, `T = ${Ty.toFixed(4)} yr`)}
        {slider('VOLATILITY  σ', sigma, setSigma, 1, 200, 0.5, v=>`${v.toFixed(1)}%`, 'Annualised implied vol')}
        {slider('RISK-FREE  r', r, setR, 0, 20, 0.05, v=>`${v.toFixed(2)}%`, 'Continuously compounded')}
        {slider('DIVIDEND  q', q, setQ, 0, 15, 0.05, v=>`${v.toFixed(2)}%`, 'Merton (1973) continuous yield')}

        {/* Greeks */}
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
          <div style={{fontFamily:MONO,fontSize:8,color:C.muted,letterSpacing:3,marginBottom:8}}>GREEKS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {[
              ['Δ DELTA', bs.delta, C.bs],
              ['Γ GAMMA', bs.gamma, C.binom],
              ['ν VEGA', bs.vega, C.orange],
              ['Θ THETA', bs.theta, C.put],
              ['ρ RHO', bs.rho, C.amer],
              ['N(d₂) ITM%', bs.nd2, C.gold],
            ].map(([k,v,c])=>(
              <div key={k} style={{
                background:C.panel3,padding:'6px 8px',
                borderLeft:`2px solid ${c}`,
              }}>
                <div style={{fontFamily:MONO,fontSize:7,color:C.muted}}>{k}</div>
                <div style={{fontFamily:MONO,fontSize:11,color:c,fontWeight:'bold'}}>
                  {v>0&&k!=='Γ GAMMA'&&k!=='ν VEGA'&&k!=='N(d₂) ITM%'?'+':''}{v.toFixed(5)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* d1/d2 */}
        <div style={{
          marginTop:12,padding:'8px 10px',background:C.panel3,
          border:`1px solid ${C.border}`,fontFamily:MONO,fontSize:9,
        }}>
          <div style={{display:'flex',justifyContent:'space-between',color:C.muted,marginBottom:4}}>
            <span>d₁ = {bs.d1.toFixed(6)}</span>
            <span>d₂ = {bs.d2.toFixed(6)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',color:C.dim}}>
            <span>N(d₁) = {bs.nd1.toFixed(6)}</span>
            <span>N(d₂) = {bs.nd2.toFixed(6)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================
   PAYOFF CHART
   ============================================================ */
function PayoffChart({S, K, T, r, sigma, q, type, price}) {
  const data=[];
  for(let i=0;i<=80;i++){
    const s=S*0.4+S*1.6*(i/80);
    const payoff=type==='call'?Math.max(s-K,0):Math.max(K-s,0);
    data.push({S:parseFloat(s.toFixed(1)), payoff:parseFloat(payoff.toFixed(3)), pnl:parseFloat((payoff-price).toFixed(3))});
  }
  return (
    <Panel>
      <PanelHeader label="PAYOFF AT EXPIRY" sub="Net P&L diagram" color={C.binom}/>
      <div style={{padding:'12px 16px'}}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{top:5,right:10,left:0,bottom:5}}>
            <defs>
              <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.binom} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={C.binom} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" strokeOpacity={0.4}/>
            <XAxis dataKey="S" stroke={C.muted} tick={{fontFamily:MONO,fontSize:7,fill:C.muted}} tickFormatter={v=>`$${v}`}/>
            <YAxis stroke={C.muted} tick={{fontFamily:MONO,fontSize:7,fill:C.muted}} tickFormatter={v=>`$${v}`}/>
            <Tooltip contentStyle={TT} formatter={(v)=>[`$${v.toFixed(3)}`,'P&L']} labelFormatter={v=>`S=${v}`}/>
            <ReferenceLine y={0} stroke={C.dim} strokeWidth={1}/>
            <ReferenceLine x={K} stroke={C.gold} strokeDasharray="4 2" strokeWidth={1}
              label={{value:`K`,fill:C.gold,fontFamily:MONO,fontSize:8}}/>
            <ReferenceLine x={S} stroke={C.muted} strokeDasharray="2 2" strokeWidth={1}
              label={{value:`S`,fill:C.muted,fontFamily:MONO,fontSize:8}}/>
            <Area type="monotone" dataKey="pnl" stroke={C.binom} fill="url(#gP)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */
export default function App() {
  const [ticker, setTicker]   = useState('AAPL');
  const [activeTab, setTab]   = useState('chain');
  const [apiOnline, setApiOnline] = useState(false);

  // Check API health
  useEffect(()=>{
    fetch(`${API}/health`)
      .then(r=>r.json()).then(()=>setApiOnline(true)).catch(()=>setApiOnline(false));
    const t=setInterval(()=>{
      fetch(`${API}/health`).then(()=>setApiOnline(true)).catch(()=>setApiOnline(false));
    },10000);
    return()=>clearInterval(t);
  },[]);

  const {data:quote,   loading:qLoad,  error:qErr}  = useApi(ticker?`${API}/api/quote/${ticker}`:[ticker]);
  const {data:chain,   loading:cLoad,  error:cErr}  = useApi(ticker?`${API}/api/chain/${ticker}`:[ticker]);
  const {data:compare, loading:mpLoad, error:mpErr} = useApi(ticker?`${API}/api/compare/${ticker}`:[ticker]);

  const [time, setTime] = useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  const tabs = [
    {id:'chain',   label:'OPTIONS CHAIN'},
    {id:'alpha',   label:'α EDGE / MISPRICING'},
    {id:'smile',   label:'IV SMILE'},
  ];

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:MONO}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@300;400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input[type=range]{cursor:pointer}
        input[type=range]::-webkit-slider-thumb{
          -webkit-appearance:none;width:10px;height:10px;border-radius:50%;
          background:${C.bs};border:2px solid ${C.bg};box-shadow:0 0 6px ${C.bs};
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:3px;height:3px;background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border2}}
        button{outline:none}
      `}</style>

      {/* ── TOP NAV BAR ─────────────────────────────────────── */}
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'0 16px',height:40,
        borderBottom:`1px solid ${C.border2}`,
        background:`linear-gradient(90deg,${C.panel3},${C.panel})`,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.bs,boxShadow:`0 0 8px ${C.bs}`,animation:'pulse 2s infinite'}}/>
            <span style={{fontFamily:DISPLAY,fontSize:11,color:C.text2,letterSpacing:4}}>OPTIONS VALUATION ENGINE</span>
            <span style={{fontFamily:MONO,fontSize:8,color:C.muted}}>v3.0 · PHASE III</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:5,height:5,borderRadius:'50%',background:apiOnline?C.green:C.red,
              boxShadow:apiOnline?`0 0 6px ${C.green}`:undefined}}/>
            <span style={{fontFamily:MONO,fontSize:8,color:apiOnline?C.green:C.red}}>
              {apiOnline?'API ONLINE':'API OFFLINE · START BACKEND'}
            </span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <TickerSearch onSelect={t=>{setTicker(t);setTab('chain')}} current={ticker}/>
          <span style={{fontFamily:MONO,fontSize:9,color:C.muted}}>
            {time.toLocaleTimeString('en-GB',{hour12:false})} UTC
          </span>
        </div>
      </div>

      {/* ── QUOTE HEADER ──────────────────────────────────────── */}
      {!apiOnline ? (
        <div style={{
          padding:'20px',background:`${C.red}10`,border:`1px solid ${C.red}30`,
          margin:16,fontFamily:MONO,fontSize:11,color:C.red,
        }}>
          ⚠ Backend API is offline. Start it with:<br/><br/>
          <code style={{color:C.orange}}>cd ~/Desktop/OptionVal_V1 && pip install fastapi uvicorn yfinance scipy && python api.py</code><br/><br/>
          The Manual Pricer below works without the API. Live market data requires the backend.
        </div>
      ) : (
        <QuoteHeader quote={quote} loading={qLoad}/>
      )}

      {/* ── MAIN LAYOUT ───────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',height:'calc(100vh - 120px)',overflow:'hidden'}}>

        {/* LEFT: Manual Pricer */}
        <div style={{borderRight:`1px solid ${C.border2}`,overflow:'auto'}}>
          <ManualPricer
            defaultS={quote?.price}
            defaultR={quote?.risk_free_rate}
            defaultQ={quote?.dividend_yield}
          />
        </div>

        {/* RIGHT: Tabbed market data */}
        <div style={{overflow:'auto',display:'flex',flexDirection:'column'}}>

          {/* Tab bar */}
          <div style={{
            display:'flex',borderBottom:`1px solid ${C.border2}`,
            background:C.panel3,flexShrink:0,
          }}>
            {tabs.map(tab=>(
              <button key={tab.id} onClick={()=>setTab(tab.id)} style={{
                padding:'10px 20px',border:'none',cursor:'pointer',
                fontFamily:MONO,fontSize:9,letterSpacing:2,
                background:'transparent',
                borderBottom:activeTab===tab.id?`2px solid ${C.bs}`:'2px solid transparent',
                color:activeTab===tab.id?C.bs:C.muted,
              }}>{tab.label}</button>
            ))}
            {quote && (
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',padding:'0 16px',gap:12}}>
                <Badge color={C.binom}>LIVE DATA</Badge>
                <span style={{fontFamily:MONO,fontSize:8,color:C.muted}}>
                  {chain?.total_contracts||0} contracts · {chain?.expiry||'—'}
                </span>
              </div>
            )}
          </div>

          <div style={{flex:1,overflow:'auto',padding:12,display:'flex',flexDirection:'column',gap:12}}>

            {activeTab==='chain' && (
              <>
                {cErr ? <ErrorMsg msg={cErr}/> : <OptionsChainTable chainData={chain} spot={quote?.price}/>}
                {quote && (
                  <PayoffChart
                    S={quote.price} K={quote.price} T={45/365}
                    r={quote.risk_free_rate} sigma={quote.hist_vol_30d}
                    q={quote.dividend_yield} type="call"
                    price={bsCalc(quote.price,quote.price,45/365,quote.risk_free_rate,quote.hist_vol_30d,quote.dividend_yield,'call').price}
                  />
                )}
              </>
            )}

            {activeTab==='alpha' && (
              mpErr ? <ErrorMsg msg={mpErr}/> :
              <MispricingChart compareData={compare} spot={quote?.price}/>
            )}

            {activeTab==='smile' && (
              cErr ? <ErrorMsg msg={cErr}/> :
              <IVSmileChart chainData={chain}/>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
