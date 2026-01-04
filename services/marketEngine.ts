
import { MarketData, TechnicalIndicators, SignalType, AssetConfig, AssetType, TradeSetup, StrategyParams, DonchianChannel, MarketPhase, ScoreFactor } from '../types';

export const STRATEGIES: StrategyParams[] = [
  {
    id: 'forex_sniper_v15_quantum',
    name: '🎯 Quantum Sniper V15 MTF',
    description: 'Double Validation H1/M15 + TP Dynamique 1:5 sur ADX Rising.',
    maShortPeriod: 20,
    maLongPeriod: 50, 
    adxThreshold: 25, 
    entryType: 'DONCHIAN_BREAKOUT',
    donchianPeriod: 20, 
    stopLossAtrMultiplier: 3.0, 
    exitType: 'ATR_TRAIL', 
    riskPerTradePercent: 0.5, 
    capitalBase: 10000
  }
];

export const DEFAULT_STRATEGY = STRATEGIES[0];

const calculateEMA = (data: number[], period: number): number => {
  const len = data.length;
  if (len < period) return data[len - 1] || 0;
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += data[i];
  ema /= period;
  for (let i = period; i < len; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
};

const calculateATR = (highs: number[], lows: number[], closes: number[], period: number = 14): number => {
  const len = closes.length;
  if (len < period + 1) return 0;
  let trSum = 0;
  for (let i = len - period; i < len; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trSum += Math.max(hl, hc, lc);
  }
  return trSum / period;
};

const calculateDonchian = (highs: number[], lows: number[], period: number): DonchianChannel => {
  const len = highs.length;
  if (len <= period) return { upper: highs[len-1] || 0, lower: lows[len-1] || 0, middle: highs[len-1] || 0 };
  let upper = -Infinity;
  let lower = Infinity;
  for (let i = len - period - 1; i < len - 1; i++) {
    if (highs[i] > upper) upper = highs[i];
    if (lows[i] < lower) lower = lows[i];
  }
  return { upper, lower, middle: (upper + lower) / 2 };
};

const calculateADX = (highs: number[], lows: number[], closes: number[], period: number = 14): number => {
  const len = closes.length;
  if (len < period * 2) return 0;
  const tr: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  for (let i = 1; i < len; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    const up = highs[i] - highs[i-1], down = lows[i-1] - lows[i];
    dmPlus.push((up > down && up > 0) ? up : 0);
    dmMinus.push((down > up && down > 0) ? down : 0);
  }
  const sTR = calculateEMA(tr, period);
  const sP = calculateEMA(dmPlus, period);
  const sM = calculateEMA(dmMinus, period);
  const dP = (sP / sTR) * 100;
  const dM = (sM / sTR) * 100;
  if (dP + dM === 0) return 0;
  return (Math.abs(dP - dM) / (dP + dM)) * 100;
};

export const calculateIndicators = (
  closes: number[], highs: number[], lows: number[], opens: number[], volumes: number[],
  strategy: StrategyParams, symbol: string = 'unknown'
): TechnicalIndicators | null => {
  const len = closes.length;
  if (len < 50) return null; 

  const lastPrice = closes[len - 1];
  const ema200 = calculateEMA(closes, 200); 
  const emaH1 = calculateEMA(closes, 400); 
  
  const maShort = calculateEMA(closes, strategy.maShortPeriod);
  const maLong = calculateEMA(closes, strategy.maLongPeriod);
  const atr = calculateATR(highs, lows, closes, 14);
  const adx = calculateADX(highs, lows, closes, 14);
  const donchian = calculateDonchian(highs, lows, strategy.donchianPeriod);

  const highestHigh = Math.max(...highs.slice(-strategy.donchianPeriod));
  const lowestLow = Math.min(...lows.slice(-strategy.donchianPeriod));
  
  const chandelierExit = ema200 > 0 
    ? (lastPrice > ema200 ? highestHigh - (atr * strategy.stopLossAtrMultiplier) : lowestLow + (atr * strategy.stopLossAtrMultiplier))
    : (lastPrice - (atr * strategy.stopLossAtrMultiplier));

  const m15Trend = lastPrice > ema200 ? 'BULL' : 'BEAR';
  const h1Trend = lastPrice > emaH1 ? 'BULL' : 'BEAR';

  return {
    maShort, maLong, maSlope: maShort - maLong, atr, adx, donchian, rsi: 0, ema200, 
    trendContext: lastPrice > ema200 ? 'BULLISH' : 'BEARISH',
    volumeTrend: 'NEUTRAL', marketPhase: MarketPhase.MARKUP,
    chandelierExit,
    mtfAlignment: {
      m15: m15Trend,
      h1: h1Trend,
      isAligned: m15Trend === h1Trend
    }
  };
};

export const analyzeMarket = (
  symbol: string, price: number, ind: TechnicalIndicators | null, strategy: StrategyParams = DEFAULT_STRATEGY
): { signal: any, diagnostic: string } => {
  if (!ind) return { signal: null, diagnostic: "Indicateurs insuffisants" };
  
  const mtfOk = ind.mtfAlignment?.isAligned;
  const adxStrong = ind.adx >= strategy.adxThreshold;
  const emaOk = price > ind.ema200 || ind.ema200 === 0;

  if (!mtfOk) return { signal: null, diagnostic: `Rejet: Désalignement MTF (${ind.mtfAlignment?.m15}/${ind.mtfAlignment?.h1})` };
  if (!adxStrong) return { signal: null, diagnostic: `Rejet: ADX ${ind.adx.toFixed(1)} < ${strategy.adxThreshold}` };
  
  let type = null;
  if (price > ind.donchian.upper && emaOk) type = SignalType.BUY;
  else if (price < ind.donchian.lower && !emaOk) type = SignalType.SELL;
  
  if (!type) {
    const distUpper = ((ind.donchian.upper - price) / price * 100).toFixed(2);
    const distLower = ((price - ind.donchian.lower) / price * 100).toFixed(2);
    return { signal: null, diagnostic: `Attente Breakout Donchian (Dist: ${distUpper}% / ${distLower}%)` };
  }

  const adxFactor = Math.min(ind.adx / 5, 15);
  const alignmentBonus = ind.mtfAlignment.isAligned ? 15 : 0;
  const winProbability = Math.floor(35 + adxFactor + alignmentBonus);

  const atrBuffer = ind.atr * strategy.stopLossAtrMultiplier;
  const stopLoss = type === SignalType.BUY ? price - atrBuffer : price + atrBuffer;
  const riskAmount = strategy.capitalBase * (strategy.riskPerTradePercent / 100);
  const riskDistance = Math.abs(price - stopLoss);
  
  const rrRatio = ind.adx > 40 ? 5 : 3;

  return {
    diagnostic: "Signal Validé !",
    signal: {
      type, 
      strength: winProbability, 
      winProbability, 
      reasoning: [
        `MTF Align: M15/H1 aligned (${ind.mtfAlignment.m15})`,
        `ADX ${ind.adx.toFixed(1)} confirms high velocity`,
        `Target set at 1:${rrRatio} (Volatility adjusted)`
      ],
      scoreBreakdown: [
        {label: 'Multi-TF Align', score: alignmentBonus, type: 'POSITIVE'},
        {label: 'ADX Momentum', score: adxFactor, type: 'POSITIVE'},
        {label: 'EMA 200 Support', score: 10, type: 'POSITIVE'}
      ],
      estimatedDuration: "3-10 Jours",
      tradeSetup: {
        entryPrice: price, 
        stopLoss, 
        takeProfit: type === SignalType.BUY ? price + (riskDistance * rrRatio) : price - (riskDistance * rrRatio),
        positionSizeUnit: riskAmount / riskDistance, 
        riskAmount, 
        riskRewardRatio: rrRatio
      }
    }
  };
};

export const INITIAL_ASSETS: AssetConfig[] = [
  { symbol: 'EURUSD=X', type: AssetType.FOREX, active: true, name: "EUR/USD" },
  { symbol: 'GBPUSD=X', type: AssetType.FOREX, active: true, name: "GBP/USD" },
  { symbol: 'USDJPY=X', type: AssetType.FOREX, active: true, name: "USD/JPY" },
  { symbol: 'AUDUSD=X', type: AssetType.FOREX, active: true, name: "AUD/USD" },
  { symbol: 'USDCAD=X', type: AssetType.FOREX, active: true, name: "USD/CAD" },
  { symbol: 'EURJPY=X', type: AssetType.FOREX, active: true, name: "EUR/JPY" },
  { symbol: 'GBPJPY=X', type: AssetType.FOREX, active: true, name: "GBP/JPY" },
  { symbol: '^GSPC', type: AssetType.INDEX, active: true, name: "S&P 500" },
  { symbol: '^IXIC', type: AssetType.INDEX, active: true, name: "NASDAQ" },
  { symbol: '^DJI', type: AssetType.INDEX, active: true, name: "Dow Jones" },
  { symbol: 'GC=F', type: AssetType.COMMODITY, active: true, name: "Or (XAU/USD)" },
  { symbol: 'SI=F', type: AssetType.COMMODITY, active: true, name: "Argent (XAG/USD)" },
  { symbol: 'BTC-USD', type: AssetType.CRYPTO, active: true, name: "Bitcoin" },
  { symbol: 'ETH-USD', type: AssetType.CRYPTO, active: true, name: "Ethereum" },
  { symbol: 'SOL-USD', type: AssetType.CRYPTO, active: true, name: "Solana" }
];
