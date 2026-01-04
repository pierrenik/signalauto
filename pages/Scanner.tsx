
import React, { useRef, useEffect } from 'react';
import { useSignals } from '../context/SignalsContext';
import { Radar, Activity, CheckCircle2, AlertTriangle, Wifi, WifiOff, RefreshCcw, Power, Clock, VolumeX, ShieldCheck, Zap, Terminal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const formatSymbol = (symbol: string) => {
  return symbol.replace('=X', '').replace('=F', '');
};

const Scanner: React.FC = () => {
  const { assets, marketData, isEngineRunning, scanProgress, lastScanTime, toggleEngine, mutedAssets = {}, activeStrategy, scanLogs = [] } = useSignals();
  const logContainerRef = useRef<HTMLDivElement>(null);

  const activeAssets = assets.filter(a => a.active);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [scanLogs]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* Header Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
         <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            
            <div className="flex items-center gap-4">
               <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isEngineRunning ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>
                  <Radar className={`w-6 h-6 ${isEngineRunning ? 'animate-pulse' : ''}`} />
               </div>
               <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                     Scanner Matrix V15
                     {isEngineRunning && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-bold">Live</span>}
                  </h1>
                  <p className="text-xs text-slate-400 font-mono">
                     THRESHOLD ADX: {activeStrategy.adxThreshold} | MODE: QUANTUM SNIPER
                  </p>
               </div>
            </div>

            <div className="flex-1 max-w-md w-full">
                <div className="flex justify-between text-[10px] text-slate-500 mb-2 font-black uppercase tracking-widest">
                    <span>CYCLE D'ANALYSE</span>
                    <span>{scanProgress}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 ease-out"
                        style={{ width: `${scanProgress}%` }}
                    />
                </div>
                <div className="text-right mt-1">
                     <span className="text-[10px] text-slate-600 flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        MàJ: {lastScanTime > 0 ? formatDistanceToNow(lastScanTime, { addSuffix: true }) : 'Jamais'}
                     </span>
                </div>
            </div>

            <button 
               onClick={toggleEngine}
               className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black transition-all shadow-lg active:scale-95 ${
                  isEngineRunning 
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 shadow-rose-500/5' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-emerald-500/20'
               }`}
            >
               <Power className="w-5 h-5" />
               {isEngineRunning ? 'STOP ENGINE' : 'START ENGINE'}
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Matrix Grid (Left) */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeAssets.map(asset => {
              const data = marketData[asset.symbol];
              const cooldownExpiry = mutedAssets[asset.symbol];
              const isMuted = cooldownExpiry && Date.now() < cooldownExpiry;
              
              const hasData = !!data && !data.error;
              const isError = !!data && data.error;
              
              const ind = data?.lastIndicators;
              const mtfOk = ind?.mtfAlignment?.isAligned;
              const adx = ind?.adx || 0;
              const adxOk = adx >= activeStrategy.adxThreshold;

              return (
                  <div key={asset.symbol} className={`bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-all relative overflow-hidden group ${
                      isMuted ? 'border-rose-500/20 bg-rose-500/5 opacity-60 grayscale' :
                      hasData 
                      ? 'border-slate-800 hover:border-cyan-500/30' 
                      : isError ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-800/50 opacity-70'
                  }`}>
                      {hasData && (
                          <div className={`absolute top-0 left-0 w-full h-1 ${mtfOk && adxOk ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-800'}`} />
                      )}

                      <div className="flex justify-between items-center">
                          <span className={`font-black text-sm tracking-tight ${isMuted ? 'text-rose-400' : 'text-white'}`}>{formatSymbol(asset.symbol)}</span>
                          {isMuted ? (
                              <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                          ) : hasData ? (
                              <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-black text-slate-500 uppercase">{asset.type.substring(0,3)}</span>
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_#10b981]" />
                              </div>
                          ) : (
                              <WifiOff className="w-3.5 h-3.5 text-slate-700" />
                          )}
                      </div>
                      
                      <div className="flex justify-between items-end">
                          <div className="text-lg font-mono font-black text-slate-200">
                              {hasData ? (
                                  data.price.toFixed(data.price < 10 ? 4 : 2)
                              ) : isError ? (
                                  <span className="text-rose-500 text-xs uppercase">Timeout</span>
                              ) : (
                                  <RefreshCcw className="w-4 h-4 animate-spin text-slate-700" />
                              )}
                          </div>
                          <div className={`text-[10px] font-black px-1.5 py-0.5 rounded ${mtfOk ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                              MTF: {mtfOk ? 'OK' : 'WAIT'}
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-800/50">
                          <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-slate-600 font-black uppercase">ADX Target</span>
                              <div className="flex items-center gap-1.5">
                                  <Zap className={`w-3 h-3 ${adxOk ? 'text-cyan-400' : 'text-slate-600'}`} />
                                  <span className={`text-[10px] font-mono font-bold ${adxOk ? 'text-white' : 'text-slate-500'}`}>
                                      {adx.toFixed(1)}
                                  </span>
                              </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                              <span className="text-[8px] text-slate-600 font-black uppercase">Sentiment</span>
                              <span className={`text-[9px] font-black uppercase ${ind?.trendContext === 'BULLISH' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {ind?.trendContext || '...'}
                              </span>
                          </div>
                      </div>

                      {isMuted && (
                          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center">
                              <span className="text-rose-500 font-black text-[10px] uppercase border border-rose-500/30 px-2 py-1 rounded bg-slate-900 shadow-xl">Ignoré {Math.ceil((cooldownExpiry - Date.now())/60000)}m</span>
                          </div>
                      )}
                  </div>
              );
          })}
        </div>

        {/* Console Logs (Right) */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl flex flex-col h-[500px] lg:h-auto shadow-2xl relative overflow-hidden">
           <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Diagnostic Logs</span>
           </div>
           <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[9px] scroll-smooth">
              {scanLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 italic">En attente du premier cycle...</div>
              ) : (
                scanLogs.map((log: any) => (
                  <div key={log.id} className={`p-2 rounded border transition-colors ${
                    log.status === 'SUCCESS' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    log.status === 'ERROR' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                    'bg-slate-800/30 border-slate-700/50 text-slate-500'
                  }`}>
                    <div className="flex justify-between mb-1 opacity-70">
                      <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="font-bold">{log.asset}</span>
                    </div>
                    <p className="leading-tight">{log.reason}</p>
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
