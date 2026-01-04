
import React, { useState, useMemo, useEffect } from 'react';
import { useSignals } from '../context/SignalsContext';
import SignalCard from '../components/SignalCard';
import { SignalType, SignalStatus } from '../types';
import { 
  PauseCircle, PlayCircle, Activity, Loader2, Target, Zap, Clock, 
  CheckCircle2, Globe, ShieldCheck, AlertTriangle, HelpCircle, Sparkles, Monitor, Cloud
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const formatSymbol = (symbol: string) => {
  if (symbol.includes('=')) return symbol.split('=')[0];
  if (symbol.includes('-')) return symbol.replace('-', '/');
  return symbol;
};

const Dashboard: React.FC = () => {
  const { 
    signals = [], 
    history = [], 
    isEngineRunning, 
    toggleEngine, 
    isLoading, 
    lastScanTime,
    cloudStatus
  } = useSignals();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [hasAiKey, setHasAiKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasAiKey(selected);
      }
    };
    checkKey();
  }, []);

  const safeSignals = useMemo(() => 
    [...(Array.isArray(signals) ? signals : [])].sort((a, b) => b.timestamp - a.timestamp),
    [signals]
  );
  
  const safeHistory = useMemo(() => 
    [...(Array.isArray(history) ? history : [])].sort((a, b) => (b.closedAt || b.timestamp) - (a.closedAt || a.timestamp)),
    [history]
  );

  const activeCount = safeSignals.length;
  const realWins = safeHistory.filter(s => (s.pnl || 0) > 0.1).length;
  const breakevens = safeHistory.filter(s => (s.pnl || 0) >= -0.1 && (s.pnl || 0) <= 0.1).length;
  const realLosses = safeHistory.filter(s => (s.pnl || 0) < -0.1).length;
  
  const totalClosed = safeHistory.length;
  const winRate = totalClosed > 0 ? ((realWins + breakevens) / totalClosed) * 100 : 0;
  const netPnlR = safeHistory.reduce((acc, curr) => acc + (curr.pnl || 0), 0);

  const handleActivateIA = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasAiKey(true);
      window.location.reload();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white mb-1 flex items-center gap-3">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">QUANTUM</span> SNIPER V15
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black tracking-widest ${cloudStatus === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                <Cloud className={`w-3 h-3 ${cloudStatus === 'ACTIVE' && 'animate-pulse'}`} />
                CLOUD ENGINE {cloudStatus}
            </div>
          </h1>
          <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-600" /> Moniteur de Trading Hybride MTF
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={handleActivateIA}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg group border ${
              hasAiKey ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-700 text-cyan-400 hover:border-cyan-500'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${!hasAiKey && 'animate-pulse'}`} />
            {hasAiKey ? 'IA CONFIGURÉE' : 'ACTIVER IA (SEARCH)'}
          </button>
          
          <button 
              onClick={toggleEngine}
              className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all shadow-2xl active:scale-95 ${
                  isEngineRunning ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-cyan-600 text-white'
              }`}
          >
              {isEngineRunning ? <PauseCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
              {isEngineRunning ? 'STOP TURBO' : 'TURBO MODE'}
          </button>
        </div>
      </div>

      {cloudStatus === 'ACTIVE' ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-4">
          <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
          <div className="text-xs text-emerald-200">
            <span className="font-bold block mb-0.5">PROTECTION CLOUD ACTIVE (24h/24)</span>
            Le serveur surveille vos positions et détecte les opportunités même quand vous dormez.
          </div>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4 animate-pulse">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
          <div className="text-xs text-amber-200">
            <span className="font-bold block mb-0.5">CLOUD ENGINE HORS-LIGNE</span>
            Vérifiez vos variables Vercel ou relancez un scan manuel pour maintenir la surveillance.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
         <StatCard title="Positions Live" value={activeCount} icon={<Activity />} color="text-white" sub="Surveillance active" />
         <StatCard title="Efficacité Sniper" value={`${winRate.toFixed(1)}%`} icon={<CheckCircle2 />} color="text-emerald-400" 
            sub={<div className="flex gap-2"><span className="text-emerald-500">{realWins} Gains</span> <span className="text-slate-400">{breakevens} BE</span> <span className="text-rose-500">{realLosses} Pertes</span></div>} 
         />
         <StatCard title="Profit Net" value={`${netPnlR.toFixed(1)}R`} icon={<Activity />} color={netPnlR >= 0 ? "text-emerald-400" : "text-rose-400"} sub="Unités de risque cumulées" />
         <StatCard title="Moteur Sync" value={cloudStatus === 'ACTIVE' ? 'SYNC OK' : 'LOCAL'} icon={<Zap />} color="text-cyan-400" sub={lastScanTime > 0 ? `Scan ${formatDistanceToNow(lastScanTime, { addSuffix: true })}` : "Scan Cloud en attente"} />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex gap-8">
                <button onClick={() => setActiveTab('ACTIVE')} className={`relative pb-4 text-xs font-black tracking-widest transition-all ${activeTab === 'ACTIVE' ? 'text-cyan-400' : 'text-slate-500 hover:text-white'}`}>
                    SIGNAUX EN COURS {activeCount > 0 && `(${activeCount})`}
                    {activeTab === 'ACTIVE' && <div className="absolute bottom-0 left-0 w-full h-1 bg-cyan-500 rounded-full" />}
                </button>
                <button onClick={() => setActiveTab('HISTORY')} className={`relative pb-4 text-xs font-black tracking-widest transition-all ${activeTab === 'HISTORY' ? 'text-blue-400' : 'text-slate-500 hover:text-white'}`}>
                    VOS RÉSULTATS (HISTO)
                    {activeTab === 'HISTORY' && <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 rounded-full" />}
                </button>
            </div>
        </div>

        {activeTab === 'ACTIVE' ? (
            safeSignals.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center bg-slate-900/20 rounded-3xl border-2 border-dashed border-slate-800/50">
                <Target className="w-16 h-16 text-slate-800 mb-4" />
                <h3 className="text-slate-500 font-bold uppercase text-xs tracking-widest">En attente d'opportunités sniper...</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {safeSignals.map(signal => <SignalCard key={signal.id} signal={signal} />)}
              </div>
            )
        ) : (
            <HistoryTable history={safeHistory} />
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color, sub }: any) => (
  <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group hover:border-slate-700 transition-all shadow-xl">
    <div className="absolute top-0 right-0 p-4 opacity-10 text-slate-100">{icon}</div>
    <h3 className="text-slate-500 text-[10px] uppercase font-black mb-2 tracking-widest">{title}</h3>
    <div className={`text-3xl font-mono font-bold ${color}`}>{value}</div>
    <div className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-tight">{sub}</div>
  </div>
);

const HistoryTable = ({ history }: { history: any[] }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
    <table className="w-full text-left text-sm text-slate-400">
      <thead className="bg-slate-950 text-[10px] uppercase font-black text-slate-600 border-b border-slate-800">
        <tr>
          <th className="p-6">Actif</th>
          <th className="p-6">Sens</th>
          <th className="p-6 text-right">Profit (R)</th>
          <th className="p-6 text-right">Fermeture</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {history.map((s: any) => (
          <tr key={s.id} className="hover:bg-slate-800/30 transition-colors group">
            <td className="p-6 font-black text-white">{formatSymbol(s.asset)}</td>
            <td className="p-6"><span className={`px-3 py-1 rounded-lg text-[9px] font-black border uppercase ${s.type === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{s.type}</span></td>
            <td className={`p-6 text-right font-mono font-black ${s.pnl > 0.1 ? 'text-emerald-400' : (s.pnl < -0.1 ? 'text-rose-500' : 'text-slate-400')}`}>
                {s.pnl > 0.1 ? '+' : ''}{s.pnl?.toFixed(2)}R
            </td>
            <td className="p-6 text-right text-[10px] text-slate-600 font-mono italic">{s.closedAt ? formatDistanceToNow(s.closedAt, { addSuffix: true }) : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default Dashboard;
