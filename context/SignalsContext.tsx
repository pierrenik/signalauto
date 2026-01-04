
import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { AssetConfig, MarketData, Signal, TimeFrame, AssetType, StrategyParams, SignalStatus, SignalType, EmailConfig, TechnicalIndicators } from '../types';
import { calculateIndicators, analyzeMarket, INITIAL_ASSETS, DEFAULT_STRATEGY, STRATEGIES } from '../services/marketEngine';
import { fetchYahooData } from '../services/yahooService';
import { fetchBinanceData } from '../services/binanceService';
import { supabase, isConfigured as isSupabaseConfigured } from '../services/supabaseClient';

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

interface ScanLog {
  id: string;
  timestamp: number;
  asset: string;
  status: 'SUCCESS' | 'REJECTED' | 'ERROR';
  reason: string;
}

interface MarketDataEntry extends MarketData {
  lastIndicators?: TechnicalIndicators;
  error?: boolean;
}

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  enabled: false,
  serviceId: '',
  templateId: '',
  publicKey: '',
  targetEmail: ''
};

interface SignalsState {
  assets: AssetConfig[];
  marketData: Record<string, MarketDataEntry>; 
  signals: Signal[];       
  history: Signal[];       
  mutedAssets: Record<string, number>; 
  isEngineRunning: boolean;
  latestNotification: Signal | null;
  isLoading: boolean;
  activeStrategy: StrategyParams;
  emailConfig: EmailConfig;
  scanProgress: number; 
  lastScanTime: number;
  scanLogs: ScanLog[];
  cloudStatus: 'ACTIVE' | 'OFFLINE' | 'UNKNOWN';
}

type Action =
  | { type: 'REFRESH_MARKET_DATA'; payload: { symbol: string; data: MarketDataEntry } }
  | { type: 'SET_MARKET_ERROR'; payload: string }
  | { type: 'ADD_SIGNAL'; payload: Signal }
  | { type: 'DELETE_SIGNAL'; payload: { id: string, asset: string } }
  | { type: 'CLOSE_SIGNAL'; payload: { id: string; status: SignalStatus; closePrice: number; closedAt: number; pnl: number } }
  | { type: 'TOGGLE_ASSET'; payload: string }
  | { type: 'SET_ENGINE'; payload: boolean }
  | { type: 'UPDATE_SIGNAL_AI'; payload: { id: string; text: string } }
  | { type: 'CLEAR_NOTIFICATION' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ACTIVE_STRATEGY'; payload: StrategyParams }
  | { type: 'UPDATE_EMAIL_CONFIG'; payload: EmailConfig }
  | { type: 'LOAD_HISTORY'; payload: Signal[] }
  | { type: 'LOAD_ACTIVE_SIGNALS'; payload: Signal[] }
  | { type: 'LOAD_MUTED'; payload: Record<string, number> }
  | { type: 'CLEAR_MUTED' }
  | { type: 'SET_SCAN_PROGRESS'; payload: number }
  | { type: 'SET_LAST_SCAN_TIME'; payload: number }
  | { type: 'ADD_SCAN_LOG'; payload: ScanLog }
  | { type: 'SET_CLOUD_STATUS'; payload: 'ACTIVE' | 'OFFLINE' | 'UNKNOWN' }
  | { type: 'RESET_DEFAULTS' };

const initialState: SignalsState = {
  assets: INITIAL_ASSETS || [],
  marketData: {},
  signals: [],
  history: [],
  mutedAssets: {},
  isEngineRunning: false,
  latestNotification: null,
  isLoading: true,
  activeStrategy: DEFAULT_STRATEGY,
  emailConfig: DEFAULT_EMAIL_CONFIG,
  scanProgress: 0,
  lastScanTime: 0,
  scanLogs: [],
  cloudStatus: 'UNKNOWN'
};

const signalsReducer = (state: SignalsState, action: Action): SignalsState => {
  switch (action.type) {
    case 'REFRESH_MARKET_DATA':
      return { ...state, marketData: { ...state.marketData, [action.payload.symbol]: action.payload.data } };
    case 'SET_MARKET_ERROR':
      return { ...state, marketData: { ...state.marketData, [action.payload]: { ...state.marketData[action.payload], error: true, symbol: action.payload } as MarketDataEntry } };
    case 'ADD_SIGNAL':
      const cooldown = state.mutedAssets[action.payload.asset];
      if (cooldown && Date.now() < cooldown) return state; 
      if (state.signals.some(s => s.id === action.payload.id)) return state;
      return { ...state, signals: [action.payload, ...state.signals.filter(s => s.asset !== action.payload.asset)], latestNotification: action.payload };
    case 'DELETE_SIGNAL':
      return { 
        ...state, 
        signals: state.signals.filter(s => s.id !== action.payload.id),
        mutedAssets: { 
          ...state.mutedAssets, 
          [action.payload.asset]: Date.now() + (30 * 60 * 1000) 
        }
      };
    case 'LOAD_MUTED': return { ...state, mutedAssets: action.payload || {} };
    case 'CLEAR_MUTED': return { ...state, mutedAssets: {} };
    case 'CLOSE_SIGNAL':
      const sToClose = state.signals.find(s => s.id === action.payload.id);
      if (!sToClose) return state;
      return { 
        ...state, 
        signals: state.signals.filter(s => s.id !== action.payload.id), 
        history: [{ ...sToClose, ...action.payload, isNew: false } as Signal, ...state.history] 
      };
    case 'SET_ENGINE': return { ...state, isEngineRunning: action.payload };
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'LOAD_HISTORY': return { ...state, history: action.payload || [] };
    case 'LOAD_ACTIVE_SIGNALS': return { ...state, signals: action.payload || [] };
    case 'UPDATE_EMAIL_CONFIG': return { ...state, emailConfig: action.payload };
    case 'SET_SCAN_PROGRESS': return { ...state, scanProgress: action.payload };
    case 'SET_LAST_SCAN_TIME': return { ...state, lastScanTime: action.payload };
    case 'SET_CLOUD_STATUS': return { ...state, cloudStatus: action.payload };
    case 'ADD_SCAN_LOG': 
      return { ...state, scanLogs: [action.payload, ...state.scanLogs].slice(0, 50) };
    case 'TOGGLE_ASSET': 
      return { ...state, assets: state.assets.map(a => a.symbol === action.payload ? { ...a, active: !a.active } : a) };
    case 'SET_ACTIVE_STRATEGY': return { ...state, activeStrategy: action.payload }; 
    case 'UPDATE_SIGNAL_AI':
      return { ...state, signals: state.signals.map(s => s.id === action.payload.id ? { ...s, aiExplanation: action.payload.text } : s) };
    case 'CLEAR_NOTIFICATION': return { ...state, latestNotification: null };
    case 'RESET_DEFAULTS': return { ...state, assets: INITIAL_ASSETS };
    default: return state;
  }
};

const SignalsContext = createContext<any>(null);

export const SignalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(signalsReducer, initialState);
  
  const strategyRef = useRef(state.activeStrategy);
  const activeAssetsRef = useRef(state.assets);
  const currentSignalsRef = useRef(state.signals);

  useEffect(() => { 
    strategyRef.current = state.activeStrategy;
    activeAssetsRef.current = state.assets;
    currentSignalsRef.current = state.signals;
  }, [state.activeStrategy, state.assets, state.signals]);

  useEffect(() => {
    const initApp = async () => {
      if (!isSupabaseConfigured) {
          dispatch({ type: 'SET_LOADING', payload: false });
          return;
      }

      try {
        // Chargement initial
        const { data: cloudSigs } = await supabase.from('signals').select('*');
        if (cloudSigs) dispatch({ type: 'LOAD_ACTIVE_SIGNALS', payload: cloudSigs.map(s => s.content) });
        
        const { data: cloudHisto } = await supabase.from('history').select('*').order('closed_at', { ascending: false });
        if (cloudHisto) dispatch({ type: 'LOAD_HISTORY', payload: cloudHisto.map(h => h.content) });

        // Vérification statut du bot Cloud via les logs récents
        const { data: recentLogs } = await supabase.from('scan_logs').select('*').order('timestamp', { ascending: false }).limit(1);
        if (recentLogs && recentLogs[0]) {
            const lastLog = recentLogs[0];
            const isRecent = (Date.now() - lastLog.timestamp) < (30 * 60 * 1000); // Actif si scan < 30min
            dispatch({ type: 'SET_CLOUD_STATUS', payload: isRecent ? 'ACTIVE' : 'OFFLINE' });
        }

        // Realtime Subscription
        supabase.channel('signals_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, (payload) => {
            if (payload.eventType === 'INSERT') dispatch({ type: 'ADD_SIGNAL', payload: payload.new.content });
            if (payload.eventType === 'DELETE') {
               // On recharge tout pour être sûr de la cohérence
               supabase.from('signals').select('*').then(({data}) => {
                   if(data) dispatch({ type: 'LOAD_ACTIVE_SIGNALS', payload: data.map(d => d.content) });
               });
            }
          })
          .subscribe();

        supabase.channel('history_changes')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'history' }, (payload) => {
            dispatch({ type: 'LOAD_HISTORY', payload: [payload.new.content, ...currentSignalsRef.current] });
          })
          .subscribe();

      } catch (e) {
        console.warn("Realtime/Cloud sync failed.");
      }
      dispatch({ type: 'SET_LOADING', payload: false });
    };
    initApp();
  }, []);

  // Le scan local devient un mode "Turbo" optionnel
  useEffect(() => {
    let intervalId: any;
    if (state.isEngineRunning) {
      const runCycle = async () => {
        const activeAssets = activeAssetsRef.current.filter(a => a.active);
        let completed = 0;
        for (const asset of activeAssets) {
            try {
              const data = asset.type === AssetType.CRYPTO ? await fetchBinanceData(asset.symbol) : await fetchYahooData(asset.symbol);
              if (data) {
                const ind = calculateIndicators(data.history, data.highs, data.lows, data.opens, data.volumes, strategyRef.current, asset.symbol);
                if (ind) {
                  dispatch({ type: 'REFRESH_MARKET_DATA', payload: { symbol: asset.symbol, data: { ...data, lastIndicators: ind } } });
                }
              }
            } catch (e) {}
            completed++;
            dispatch({ type: 'SET_SCAN_PROGRESS', payload: Math.floor((completed / activeAssets.length) * 100) });
        }
        dispatch({ type: 'SET_LAST_SCAN_TIME', payload: Date.now() });
      };
      runCycle();
      intervalId = setInterval(runCycle, 60000);
    }
    return () => clearInterval(intervalId);
  }, [state.isEngineRunning]);

  return (
    <SignalsContext.Provider value={{ 
      ...state, 
      toggleEngine: () => dispatch({ type: 'SET_ENGINE', payload: !state.isEngineRunning }),
      toggleAsset: (symbol: string) => dispatch({ type: 'TOGGLE_ASSET', payload: symbol }),
      deleteSignal: async (id: string) => {
          dispatch({ type: 'DELETE_SIGNAL', payload: { id, asset: 'MANUAL' } });
          if (isSupabaseConfigured) await supabase.from('signals').delete().eq('id', id);
      },
      clearNotification: () => dispatch({ type: 'CLEAR_NOTIFICATION' })
    }}>
      {children}
    </SignalsContext.Provider>
  );
};

export const useSignals = () => useContext(SignalsContext);
