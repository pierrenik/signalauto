
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
  scanLogs: []
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
      if (state.signals.some(s => s.asset === action.payload.asset)) return state;
      return { ...state, signals: [action.payload, ...state.signals], latestNotification: action.payload };
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
  const mutedAssetsRef = useRef(state.mutedAssets);

  useEffect(() => { 
    strategyRef.current = state.activeStrategy;
    activeAssetsRef.current = state.assets;
    currentSignalsRef.current = state.signals;
    mutedAssetsRef.current = state.mutedAssets;
  }, [state.activeStrategy, state.assets, state.signals, state.mutedAssets]);

  useEffect(() => {
    const initApp = async () => {
      const localMuted = localStorage.getItem('v15_muted_obj');
      if (localMuted) dispatch({ type: 'LOAD_MUTED', payload: JSON.parse(localMuted) });

      const localEmail = localStorage.getItem('v15_email_config');
      if (localEmail) dispatch({ type: 'UPDATE_EMAIL_CONFIG', payload: JSON.parse(localEmail) });

      if (!isSupabaseConfigured) {
        const localSigs = localStorage.getItem('v15_signals');
        if (localSigs) dispatch({ type: 'LOAD_ACTIVE_SIGNALS', payload: JSON.parse(localSigs) });
        const localHisto = localStorage.getItem('v15_history');
        if (localHisto) dispatch({ type: 'LOAD_HISTORY', payload: JSON.parse(localHisto) });
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      try {
        const { data: cloudSigs } = await supabase.from('signals').select('*');
        if (cloudSigs) dispatch({ type: 'LOAD_ACTIVE_SIGNALS', payload: cloudSigs.map(s => s.content) });
        
        const { data: cloudHisto } = await supabase.from('history').select('*').order('closed_at', { ascending: false });
        if (cloudHisto) dispatch({ type: 'LOAD_HISTORY', payload: cloudHisto.map(h => h.content) });
      } catch (e) {
        console.warn("Supabase load failed, falling back to local.");
      }
      dispatch({ type: 'SET_LOADING', payload: false });
    };
    initApp();
  }, []);

  useEffect(() => {
    localStorage.setItem('v15_signals', JSON.stringify(state.signals));
    localStorage.setItem('v15_history', JSON.stringify(state.history));
    localStorage.setItem('v15_muted_obj', JSON.stringify(state.mutedAssets));
  }, [state.signals, state.history, state.mutedAssets]);

  const toggleEngine = () => dispatch({ type: 'SET_ENGINE', payload: !state.isEngineRunning });
  const toggleAsset = (symbol: string) => dispatch({ type: 'TOGGLE_ASSET', payload: symbol });
  const clearNotification = () => dispatch({ type: 'CLEAR_NOTIFICATION' });
  const deleteSignal = async (id: string, asset: string) => {
    dispatch({ type: 'DELETE_SIGNAL', payload: { id, asset } });
    if (isSupabaseConfigured) {
      await supabase.from('signals').delete().eq('id', id);
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (state.isEngineRunning) {
      const runCycle = async () => {
        const activeAssets = activeAssetsRef.current.filter(a => a.active);
        let completed = 0;
        const BATCH_SIZE = 3;

        // Traitement par lots (batches) de 3 pour éviter la saturation réseau
        for (let i = 0; i < activeAssets.length; i += BATCH_SIZE) {
          const batch = activeAssets.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (asset) => {
            try {
              const data = asset.type === AssetType.CRYPTO 
                ? await fetchBinanceData(asset.symbol) 
                : await fetchYahooData(asset.symbol);

              if (data) {
                const ind = calculateIndicators(data.history, data.highs, data.lows, data.opens, data.volumes, strategyRef.current, asset.symbol);
                if (ind) {
                  dispatch({ type: 'REFRESH_MARKET_DATA', payload: { symbol: asset.symbol, data: { ...data, lastIndicators: ind } } });
                  
                  const existing = currentSignalsRef.current.find(s => s.asset === asset.symbol);
                  if (existing) {
                    const currentPrice = data.price;
                    const isBuy = existing.type === SignalType.BUY;
                    const chandelier = existing.indicators.chandelierExit;
                    
                    if ((isBuy && currentPrice <= chandelier) || (!isBuy && currentPrice >= chandelier)) {
                      const pnl = (isBuy ? (currentPrice - existing.priceAtSignal) : (existing.priceAtSignal - currentPrice)) / Math.abs(existing.priceAtSignal - existing.tradeSetup.stopLoss);
                      const status = pnl > 0.1 ? SignalStatus.WIN : SignalStatus.LOSS;
                      const closedSignal = { id: existing.id, status, closePrice: currentPrice, closedAt: Date.now(), pnl: pnl - 0.05 };
                      dispatch({ type: 'CLOSE_SIGNAL', payload: closedSignal });
                      if (isSupabaseConfigured) {
                        await supabase.from('signals').delete().eq('id', existing.id);
                        await supabase.from('history').insert({ id: existing.id, asset: existing.asset, pnl: closedSignal.pnl, content: { ...existing, ...closedSignal } });
                      }
                    }
                  } else {
                    const { signal: result, diagnostic } = analyzeMarket(asset.symbol, data.price, ind, strategyRef.current);
                    
                    dispatch({ 
                      type: 'ADD_SCAN_LOG', 
                      payload: { id: generateId(), timestamp: Date.now(), asset: asset.symbol, status: result ? 'SUCCESS' : 'REJECTED', reason: diagnostic } 
                    });

                    if (result) {
                      const newSignal: Signal = {
                        id: generateId(),
                        asset: asset.symbol,
                        assetType: asset.type,
                        type: result.type,
                        timestamp: Date.now(),
                        timeFrame: TimeFrame.M15,
                        priceAtSignal: data.price,
                        trendStrength: result.strength,
                        indicators: ind,
                        tradeSetup: result.tradeSetup,
                        reasoning: result.reasoning,
                        status: SignalStatus.OPEN,
                        confidence: result.strength,
                        winProbability: result.winProbability,
                        scoreBreakdown: result.scoreBreakdown,
                        estimatedDuration: result.estimatedDuration,
                        isNew: true
                      };
                      dispatch({ type: 'ADD_SIGNAL', payload: newSignal });
                      if (isSupabaseConfigured) {
                        await supabase.from('signals').insert({ id: newSignal.id, asset: newSignal.asset, timeframe: '15m', content: newSignal });
                      }
                    }
                  }
                }
              }
            } catch (e: any) {
              dispatch({ type: 'SET_MARKET_ERROR', payload: asset.symbol });
              dispatch({ 
                type: 'ADD_SCAN_LOG', 
                payload: { id: generateId(), timestamp: Date.now(), asset: asset.symbol, status: 'ERROR', reason: e.message || "Erreur de flux" } 
              });
            }
            completed++;
            dispatch({ type: 'SET_SCAN_PROGRESS', payload: Math.floor((completed / activeAssets.length) * 100) });
          }));

          // Petit délai entre les lots pour laisser souffler le navigateur
          await new Promise(r => setTimeout(r, 200));
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
      ...state, toggleEngine, toggleAsset, clearNotification, deleteSignal,
      updateSignalExplanation: (id: string, text: string) => dispatch({ type: 'UPDATE_SIGNAL_AI', payload: { id, text } }),
      setStrategy: (id: string) => {
        const s = STRATEGIES.find(x => x.id === id);
        if (s) dispatch({ type: 'SET_ACTIVE_STRATEGY', payload: s });
      },
      updateEmailConfig: (cfg: EmailConfig) => dispatch({ type: 'UPDATE_EMAIL_CONFIG', payload: cfg }),
      clearMuted: () => dispatch({ type: 'CLEAR_MUTED' }),
      resetToDefaults: () => dispatch({ type: 'RESET_DEFAULTS' })
    }}>
      {children}
    </SignalsContext.Provider>
  );
};

export const useSignals = () => useContext(SignalsContext);
