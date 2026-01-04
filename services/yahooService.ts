
import { MarketData } from '../types';

const PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const randomDelay = (min: number, max: number) => new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));

const fetchWithTimeout = async (url: string, timeout: number = 8000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

export const fetchYahooData = async (symbol: string, interval: string = '15m', range: string = '5d'): Promise<MarketData> => {
  // Correction pour les indices : encodage spécifique du caractère ^ 
  const cleanSymbol = symbol.includes('^') ? encodeURIComponent(symbol) : symbol;
  const targetUrl = `${YAHOO_BASE}/${cleanSymbol}?interval=${interval}&range=${range}&events=history&includeAdjustedClose=true`;
  
  const shuffledProxies = [...PROXIES].sort(() => Math.random() - 0.5);
  let lastError = "";

  for (const proxy of shuffledProxies) {
    try {
      await randomDelay(100, 400); // Jitter pour éviter la détection de bot

      const url = `${proxy}${encodeURIComponent(targetUrl)}`;
      const response = await fetchWithTimeout(url);
      
      if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue; 
      }

      const json = await response.json();
      const result = json.chart?.result?.[0];

      if (!result) {
        lastError = "No result in Yahoo JSON";
        continue;
      }

      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      
      if (!timestamps || !quote || !quote.close) {
        lastError = "Malformed data in Yahoo indicators";
        continue;
      }

      const validIndices = timestamps.map((_: any, i: number) => i).filter((i: number) => 
        quote.close[i] != null && 
        quote.high[i] != null && 
        quote.low[i] != null && 
        quote.open[i] != null
      );
      
      if (validIndices.length < 100) {
        lastError = "Insufficient historical points";
        continue;
      }

      const history = validIndices.map((i: number) => quote.close[i]);
      const highs = validIndices.map((i: number) => quote.high[i]);
      const lows = validIndices.map((i: number) => quote.low[i]);
      const opens = validIndices.map((i: number) => quote.open[i]); 
      const volumes = quote.volume ? validIndices.map((i: number) => quote.volume[i]) : new Array(history.length).fill(0);
      
      return {
        symbol: symbol, // On garde le symbole d'entrée pour la correspondance
        price: history[history.length - 1],
        timestamp: timestamps[validIndices[validIndices.length - 1]] * 1000,
        history, highs, lows, opens, volumes,
        dataSource: 'LIVE_API'
      };

    } catch (error: any) {
      lastError = error.message;
      continue;
    }
  }

  throw new Error(`ALL PROXIES FAILED for ${symbol}: ${lastError}`);
};
