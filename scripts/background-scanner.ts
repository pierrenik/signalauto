
import { AssetType, SignalStatus, SignalType, TimeFrame } from '../types';
import { calculateIndicators, analyzeMarket, INITIAL_ASSETS, DEFAULT_STRATEGY } from '../services/marketEngine';
import { fetchYahooData } from '../services/yahooService';
import { fetchBinanceData } from '../services/binanceService';
import { createClient } from '@supabase/supabase-js';

// Configuration Supabase pour Node.js
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_KEY || ''
);

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

async function runCloudScan() {
  console.log('🚀 Démarrage du scan Quantum Cloud...');
  
  // 1. Récupérer les signaux actifs depuis Supabase
  const { data: activeSignals } = await supabase.from('signals').select('*');
  const currentSignals = activeSignals?.map(s => s.content) || [];

  // 2. Parcourir les actifs
  for (const asset of INITIAL_ASSETS) {
    if (!asset.active) continue;

    try {
      console.log(`🔍 Analyse de ${asset.symbol}...`);
      const data = asset.type === AssetType.CRYPTO 
        ? await fetchBinanceData(asset.symbol) 
        : await fetchYahooData(asset.symbol);

      if (!data) continue;

      const ind = calculateIndicators(data.history, data.highs, data.lows, data.opens, data.volumes, DEFAULT_STRATEGY, asset.symbol);
      if (!ind) continue;

      const existing = currentSignals.find((s: any) => s.asset === asset.symbol);
      
      if (existing) {
        // GESTION DE LA FERMETURE (Chandelier Exit)
        const currentPrice = data.price;
        const isBuy = existing.type === SignalType.BUY;
        const chandelier = existing.indicators.chandelierExit;
        
        if ((isBuy && currentPrice <= chandelier) || (!isBuy && currentPrice >= chandelier)) {
          const pnl = (isBuy ? (currentPrice - existing.priceAtSignal) : (existing.priceAtSignal - currentPrice)) / Math.abs(existing.priceAtSignal - existing.tradeSetup.stopLoss);
          const status = pnl > 0.1 ? SignalStatus.WIN : SignalStatus.LOSS;
          const closedSignal = { ...existing, status, closePrice: currentPrice, closedAt: Date.now(), pnl: pnl - 0.05, isNew: false };
          
          await supabase.from('signals').delete().eq('id', existing.id);
          await supabase.from('history').insert({ id: existing.id, asset: existing.asset, pnl: closedSignal.pnl, content: closedSignal });
          console.log(`✅ Position fermée : ${asset.symbol} (PNL: ${pnl.toFixed(2)}R)`);
        }
      } else {
        // DETECTION DE NOUVEAU SIGNAL
        const { signal: result } = analyzeMarket(asset.symbol, data.price, ind, DEFAULT_STRATEGY);

        if (result) {
          const newSignal = {
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

          await supabase.from('signals').insert({ id: newSignal.id, asset: newSignal.asset, timeframe: '15m', content: newSignal });
          console.log(`🎯 NOUVEAU SIGNAL : ${asset.symbol} ${newSignal.type}`);
        }
      }
    } catch (e) {
      console.error(`❌ Erreur sur ${asset.symbol}:`, e);
    }
    
    // Attente entre les actifs pour éviter le rate-limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('🏁 Scan terminé.');
}

runCloudScan().catch(console.error);
