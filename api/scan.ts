
import { createClient } from '@supabase/supabase-js';
import { fetchYahooData } from '../services/yahooService';
import { fetchBinanceData } from '../services/binanceService';
import { calculateIndicators, analyzeMarket, INITIAL_ASSETS, DEFAULT_STRATEGY } from '../services/marketEngine';
import { AssetType, SignalStatus, Signal, TimeFrame, SignalType } from '../types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req: any, res: any) {
  // Sécurité basique pour les Cron Jobs (Optionnel: vérifier un header secret Vercel)
  console.log("Démarrage du scan Cloud V15...");

  const results = [];
  const activeAssets = INITIAL_ASSETS.filter(a => a.active);

  for (const asset of activeAssets) {
    try {
      const data = asset.type === AssetType.CRYPTO 
        ? await fetchBinanceData(asset.symbol) 
        : await fetchYahooData(asset.symbol);

      if (data) {
        const ind = calculateIndicators(data.history, data.highs, data.lows, data.opens, data.volumes, DEFAULT_STRATEGY, asset.symbol);
        
        if (ind) {
          // 1. Vérifier si un signal existe déjà pour cet actif
          const { data: existingSigs } = await supabase.from('signals').select('*').eq('asset', asset.symbol);
          const existing = existingSigs?.[0];

          if (existing) {
              const sigContent = existing.content;
              const currentPrice = data.price;
              const isBuy = sigContent.type === SignalType.BUY;
              const chandelier = sigContent.indicators.chandelierExit;
              
              if ((isBuy && currentPrice <= chandelier) || (!isBuy && currentPrice >= chandelier)) {
                // Fermeture automatique
                const pnl = (isBuy ? (currentPrice - sigContent.priceAtSignal) : (sigContent.priceAtSignal - currentPrice)) / Math.abs(sigContent.priceAtSignal - sigContent.tradeSetup.stopLoss);
                const status = pnl > 0.1 ? SignalStatus.WIN : SignalStatus.LOSS;
                const closedSignal = { ...sigContent, status, closePrice: currentPrice, closedAt: Date.now(), pnl: pnl - 0.05 };
                
                await supabase.from('signals').delete().eq('id', existing.id);
                await supabase.from('history').insert({ id: existing.id, asset: existing.asset, pnl: closedSignal.pnl, content: closedSignal });
                results.push({ asset: asset.symbol, status: 'CLOSED', pnl });
              }
          } else {
            // 2. Chercher de nouveaux signaux
            const { signal: result } = analyzeMarket(asset.symbol, data.price, ind, DEFAULT_STRATEGY);
            if (result) {
              const newSignal: Signal = {
                id: Math.random().toString(36).substring(2) + Date.now().toString(36),
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
              results.push({ asset: asset.symbol, status: 'NEW_SIGNAL' });
            }
          }
        }
      }
    } catch (e: any) {
      console.error(`Erreur scan ${asset.symbol}:`, e.message);
    }
  }

  // Log du scan dans Supabase pour le dashboard
  await supabase.from('scan_logs').insert({
      id: Date.now().toString(),
      timestamp: Date.now(),
      asset: 'CLOUD_ENGINE',
      timeframe: '10m',
      status: 'SUCCESS',
      message: `Scan Cloud terminé. ${results.length} actions effectuées.`
  });

  return res.status(200).json({ success: true, results });
}
