import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const COINS: string[] = (process.env.PORTFOLIOASSETS || '')
  .split(',')
  .map(s => s.trim())
  .filter((s): s is string => !!s);


class Coin {
  name: string = '';
  pair: string = '';
  amount: number = 0;
  price: number = 0;
  get totalvalue(): number {
    return this.amount * this.price;
  }
}

const BASE_URL = 'https://api.mexc.com';
const API_KEY = process.env.MEXC_API_KEY!;
const API_SECRET = process.env.MEXC_API_SECRET!;
const ASSET_BASE_VALUE = parseFloat(process.env.ASSET_BASE_VALUE || "0");

let cachedTimeOffset = 0;

export async function getMexcServerTime(): Promise<number> {
  const response = await axios.get(`${BASE_URL}/api/v3/time`);
  return response.data.serverTime;
}

export async function syncMexcTimeOffset() {
  const serverTime = await getMexcServerTime();
  cachedTimeOffset = serverTime - Date.now();
}

/**
 * the idea is to get the time as is on the MexC server
 */
export function getSynchronizedTimestamp(): number {
  return Date.now() + cachedTimeOffset;
}

const getTimestampString = () => now().toString();

function now() {
  return getSynchronizedTimestamp();
  // return new Date().toISOString();
}

function sign(queryString: string) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

const logFile = process.env.LOGFILENAME!;

function log(report: string | string[]): void {
  if (!Array.isArray(report)) {
    report = [report];
  }
  const _log = [...report].join('\n');

  fs.appendFileSync(logFile, _log + '\n');
  console.log(_log);
}

async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await axios.post(url, {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML"
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function errorToTelegramMessage(err: unknown): string {
  const timestamp = new Date().toISOString();

  if (err instanceof Error) {
    return `
<b>🛑 Error Alert</b>
<b>Time:</b> <code>${timestamp}</code>
<b>Type:</b> ${escapeHtml(err.name)}
<b>Message:</b> <code>${escapeHtml(err.message)}</code>
<b>Stack Trace:</b>
<pre>${escapeHtml(err.stack || '')}</pre>
    `.trim();
  } else {
    const fallback = typeof err === 'string'
      ? escapeHtml(err)
      : escapeHtml(JSON.stringify(err, null, 2));

    return `
<b>🛑 Unknown Error</b>
<b>Time:</b> <code>${timestamp}</code>
<pre>${fallback}</pre>
    `.trim();
  }
}

async function handleError(err: unknown) {
  if (err instanceof Error) {
    err.message = err.message
      .replace(API_KEY || '', '[REDACTED_API_KEY]')
      .replace(API_SECRET || '', '[REDACTED_API_SECRET]')
      .replace(process.env.VPN_IP || '', '[REDACTED_VPN_IP]')
      .replace(process.env.TELEGRAM_BOT_TOKEN || '', '[REDACTED_BOT_TOKEN]');
  }

  try {
    await sendTelegramMessage(errorToTelegramMessage(err));
  } catch { }

  if (err instanceof Error) {
    log(err.stack ?? err.message);
  } else {
    log(String(err));
  }
};

interface MarketRule {
  symbol: string;
  stepSize: number;
  minQty: number;
}

async function getMarketRule(symbol: string): Promise<MarketRule> {
  const response = await axios.get(`${BASE_URL}/api/v3/exchangeInfo`);
  const market = response.data.symbols.find((s: any) => s.symbol === symbol);

  if (!market) throw new Error(`Symbol not found: ${symbol}`);

  // hoping that 0.01 is a good default
  const basePrecision = parseFloat(market.baseSizePrecision) || 0.01;
  if (!basePrecision || isNaN(basePrecision)) {
    throw new Error(`No usable precision info for ${symbol}`);
  }

  const stepSize = basePrecision; // e.g., 0.0001
  const minQty = basePrecision;   // conservative assumption — could be adjusted if more data becomes available

  return {
    symbol,
    stepSize,
    minQty
  };
}

async function fetchPrice(pair: string): Promise<number> {
  const { data } = await axios.get(`${BASE_URL}/api/v3/ticker/price`, {
    params: { symbol: `${pair}` },
  });
  return parseFloat(data.price);
}

async function fetchBalances(): Promise<Record<string, number>> {
  const timestamp = getTimestampString();
  const queryString = `timestamp=${timestamp}`;
  const signature = sign(queryString);

  const { data } = await axios.get(`${BASE_URL}/api/v3/account`, {
    headers: {
      'X-MEXC-APIKEY': API_KEY,
      "Content-Type": "application/json",
    },
    params: {
      timestamp,
      signature,
    },
  });

  const balances: Record<string, number> = {} as Record<string, number>;

  for (const asset of data.balances) {
    if (COINS.includes(asset.asset)) {
      balances[asset.asset] = parseFloat(asset.free);
    }
  }

  return balances;
}

function roundToStepSize(quantity: number, stepSize: number): number {
  const factor = 1 / stepSize;
  return Math.floor(quantity * factor) / factor;
}

async function createMarketSellOrder(coinpair: string, quantity: number) {
  const timestamp = getTimestampString();

  const queryString = `symbol=${coinpair}&side=SELL&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;

  const signature = sign(queryString);

  const url = `https://api.mexc.com/api/v3/order/test?${queryString}&signature=${signature}`;

  try {
    // log(`posting: ${url}`) // TEST

    const response = await axios.post(url, null, {
      headers: {
        "Content-Type": "application/json",
        'X-MEXC-APIKEY': API_KEY,
      },
      params: {
        timestamp
      }
    });

    const alertMessage = `✅ Order placed for ${coinpair}: ${console.dir(response.statusText)}`;
    log(alertMessage);
    await sendTelegramMessage(alertMessage);
  } catch (err) {
    const alertMessage = `❌ Failed to place order for ${coinpair}: ${err}`;
    log(alertMessage);
    await sendTelegramMessage(alertMessage);
  }
}

/**
 * Automatically trims the portfolio by selling excess amounts of coins
 * if their total value exceeds a predefined base value. For each coin,
 * if its value is above the ASSET_BASE_VALUE, it calculates the excess,
 * creates a market order to sell the excess amount, logs the action,
 * and sends a Telegram alert.
 * @param coins Array of Coin objects representing the portfolio.
 */
export async function autoTrimPortfolio(coins: Coin[]) {
  for (const coin of coins) {
    const totalvalue = coin.totalvalue + 30; // TEST
    if (totalvalue > ASSET_BASE_VALUE) {
      const excessUSD = totalvalue - ASSET_BASE_VALUE;
      const marketRule = await getMarketRule(coin.pair);
      const quantityToSell = roundToStepSize(excessUSD / coin.price, marketRule.stepSize);
      log(`${coin.pair} stepsize: ${marketRule.stepSize}`)

      if (quantityToSell > 0) {
        const alertMessage = `Selling ${quantityToSell} ($${excessUSD.toFixed(2)}) ${coin.pair} to keep balance at $${ASSET_BASE_VALUE}`;
        log(alertMessage);
        await sendTelegramMessage(alertMessage);
        await createMarketSellOrder(coin.pair, quantityToSell);
      }
    }
  }
}

async function run() {
  await syncMexcTimeOffset();

  const balances = await fetchBalances();
  let total = 0;
  const report: string[] = [];

  const coins: Coin[] = [];
  for (const name of COINS) {
    const pair = `${name}USDT`;
    const price = await fetchPrice(pair);
    const coin = new Coin();
    coin.name = name;
    coin.pair = pair;
    coin.amount = balances[name];
    coin.price = price;
    coins.push(coin);
    total += coin.totalvalue;
    report.push(`${name}: ${coin.amount} x $${price.toFixed(2)} = $${coin.totalvalue.toFixed(2)}`);
  }

  report.push(`Total: $${total.toFixed(2)}`);

  log(report);

  await sendTelegramMessage(report.join('\n'));

  const threshold = parseFloat(process.env.ALERT_THRESHOLD || "0");

  const exceededThreshold = total < threshold; // TEST

  if (exceededThreshold) {
    const alertMessage = `Total value reached threshold!`;
    log(alertMessage);
    await sendTelegramMessage('🚨 <b>Portfolio Alert</b> ' + alertMessage);

    autoTrimPortfolio(coins);
  }
}

(async () => {
  try {
    await run();
    process.exitCode = 0;
    log(`Portfolio tracker script completed successfully`);
  } catch (err) {
    try {
      await handleError(err);
    } catch (secondaryErr) {
      console.error("portfolio tracker script encountered an unreported error: ", secondaryErr);
    }
    process.exitCode = 1;
  }
})();
