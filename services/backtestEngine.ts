
import { BacktestResult, MarketData, SignalType, StrategyParams } from '../types';
import { calculateIndicators, analyzeMarket } from './marketEngine';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const simulateTrailingTrade = (
  entryPrice: number,
  initialSL: number,
  atr: number,
  atrMultiplier: number,
  type: SignalType,
  futureHighs: number[],
  futureLows: number[],
  futureCloses: number[],
  maxHold: number = 200 
): { pnl: number, duration: number } => {
  
  const limit = Math.min(futureHighs.length, maxHold);
  let currentSL = initialSL;
  let isBreakevenSet = false;
  let highestHighSinceEntry = entryPrice;
  let lowestLowSinceEntry = entryPrice;

  const initialRisk = Math.abs(entryPrice - initialSL);
  if (initialRisk === 0) return { pnl: 0, duration: 1 };

  // RECOMMANDATION 2: Breakeven à 1.5R
  const breakevenTriggerR = 1.5; 

  for (let i = 0; i < limit; i++) {
    const high = futureHighs[i];
    const low = futureLows[i];
    
    if (high > highestHighSinceEntry) highestHighSinceEntry = high;
    if (low < lowestLowSinceEntry) lowestLowSinceEntry = low;

    if (type === SignalType.BUY) {
        if (low <= currentSL) {
            const pnlR = (currentSL - entryPrice) / initialRisk;
            return { pnl: pnlR - 0.05, duration: i + 1 };
        }
        if (!isBreakevenSet && (high - entryPrice) >= (initialRisk * breakevenTriggerR)) {
            currentSL = entryPrice;
            isBreakevenSet = true;
        }
        const potentialNewSL = highestHighSinceEntry - (atr * atrMultiplier);
        if (potentialNewSL > currentSL) currentSL = potentialNewSL;
    } else { 
        if (high >= currentSL) {
            const pnlR = (entryPrice - currentSL) / initialRisk;
            return { pnl: pnlR - 0.05, duration: i + 1 };
        }
        if (!isBreakevenSet && (entryPrice - low) >= (initialRisk * breakevenTriggerR)) {
            currentSL = entryPrice;
            isBreakevenSet = true;
        }
        const potentialNewSL = lowestLowSinceEntry + (atr * atrMultiplier);
        if (potentialNewSL < currentSL) currentSL = potentialNewSL;
    }
  }

  const finalPrice = futureCloses[limit - 1];
  let finalPnl = (type === SignalType.BUY ? (finalPrice - entryPrice) : (entryPrice - finalPrice)) / initialRisk;
  return { pnl: finalPnl, duration: limit }; 
};

const backtestAsset = (data: MarketData, strategy: StrategyParams): { trades: number[] } => {
  const trades: number[] = [];
  const history = data.history;
  if (history.length < 250) return { trades: [] };

  let i = 200;
  while (i < history.length - 20) {
    const ind = calculateIndicators(history.slice(0, i + 1), data.highs.slice(0, i + 1), data.lows.slice(0, i + 1), data.opens.slice(0, i + 1), (data.volumes || []).slice(0, i + 1), strategy);
    if (ind) {
        const result = analyzeMarket(data.symbol, history[i], ind, strategy);
        // FIX: analyzeMarket returns { signal, diagnostic }. Accessing properties from 'result.signal' to fix property access errors.
        if (result.signal && result.signal.winProbability >= 50) {
          const { pnl, duration } = simulateTrailingTrade(
            result.signal.tradeSetup.entryPrice, 
            result.signal.tradeSetup.stopLoss, 
            ind.atr, 
            strategy.stopLossAtrMultiplier, 
            result.signal.type, 
            data.highs.slice(i + 1), 
            data.lows.slice(i + 1), 
            history.slice(i + 1)
          );
          trades.push(pnl);
          i += duration;
          continue; 
        }
    }
    i++; 
  }
  return { trades };
};

export const runStrategyTournament = async (allMarketData: Record<string, MarketData>, strategies: StrategyParams[]): Promise<BacktestResult[]> => {
  const results: BacktestResult[] = [];
  const assets = Object.values(allMarketData);
  for (const strategy of strategies) {
    let allTrades: number[] = [];
    for (const data of assets) {
      const { trades } = backtestAsset(data, strategy);
      allTrades = [...allTrades, ...trades];
    }
    let currentEquity = 0, peakEquity = 0, maxDrawdown = 0, wins = 0, losses = 0, winPnl = 0, lossPnl = 0;
    const equityCurve = [{ tradeNum: 0, equity: 0 }];
    allTrades.forEach((pnl, index) => {
        if (pnl > 0) { wins++; winPnl += pnl; } else { losses++; lossPnl += Math.abs(pnl); }
        currentEquity += pnl;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const drawdown = peakEquity - currentEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        equityCurve.push({ tradeNum: index + 1, equity: Number(currentEquity.toFixed(2)) });
    });
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
    results.push({
      strategyId: strategy.id, totalTrades: allTrades.length, wins, losses, winRate,
      netPnl: Number(currentEquity.toFixed(2)), profitFactor: lossPnl > 0 ? Number((winPnl / lossPnl).toFixed(2)) : 99,
      maxDrawdown: Number(maxDrawdown.toFixed(2)), avgWin: wins > 0 ? Number((winPnl / wins).toFixed(2)) : 0,
      avgLoss: losses > 0 ? Number((lossPnl / losses).toFixed(2)) : 0, period: 'Historical Data', equityCurve
    });
  }
  return results.sort((a, b) => b.netPnl - a.netPnl);
};
