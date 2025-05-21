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

const getTimestamp = () => Date.now().toString();

function sign(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function now() {
  return new Date().toISOString();
}

const logFile = process.env.LOGFILEPATH!;

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

async function fetchPrice(symbol: string): Promise<number> {
  const { data } = await axios.get(`${BASE_URL}/api/v3/ticker/price`, {
    params: { symbol: `${symbol}USDT` },
  });
  return parseFloat(data.price);
}

async function fetchBalances(): Promise<Record<string, number>> {
  const timestamp = getTimestamp();
  const queryString = `timestamp=${timestamp}`;
  const signature = sign(queryString, API_SECRET);

  const { data } = await axios.get(`${BASE_URL}/api/v3/account`, {
    headers: {
      'X-MEXC-APIKEY': API_KEY,
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

async function createMarketSellOrder(coinpair: string, quantity: number) {
  const path = "/api/v3/order";
  const timestamp = Date.now();

  const params = new URLSearchParams({
    symbol: coinpair,
    side: "SELL",
    type: "MARKET",
    quantity: quantity.toString(),
    timestamp: timestamp.toString()
  });

  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(params.toString())
    .digest("hex");

  const fullParams = `${params.toString()}&signature=${signature}`;

  try {
    const response = await axios.post(`${BASE_URL}${path}?${fullParams}`, null, {
      headers: {
        "X-MEXC-APIKEY": API_KEY,
      },
    });
    log(`✅ Order placed for ${coinpair}:${response.data}`);
  } catch (err) {
    log(`❌ Failed to place order for ${coinpair}: ${err}`);
  }
}

export async function autoTrimPortfolio(coins: Coin[]) {
  for (const coin of coins) {
    const totalValue = coin.amount * coin.price;

    if (totalValue > ASSET_BASE_VALUE) {
      const excessUSD = totalValue - ASSET_BASE_VALUE;
      const quantityToSell = parseFloat((excessUSD / coin.price).toFixed(6)); // round to 6 decimal places

      if (quantityToSell > 0) {
        log(`Selling ${quantityToSell} ${coin.pair} to keep balance at $${ASSET_BASE_VALUE}`);
        await createMarketSellOrder(coin.pair, quantityToSell);
      }
    }
  }
}

async function run() {
  const balances = await fetchBalances();
  let total = 0;
  const report: string[] = [];

  const coins: Coin[] = [];
  for (const name of COINS) {
    const price = await fetchPrice(name);
    const coin = new Coin();
    coin.pair = `${name}USDT`;
    coin.amount = balances[name];
    coin.price = price;
    coins.push(coin);
    total += coin.totalvalue;
    report.push(`${name}: ${coin.amount} x $${price.toFixed(2)} = $${coin.totalvalue.toFixed(2)}`);
  }

  report.push(`Total: $${total.toFixed(2)}`);

  log(report);

  await sendTelegramMessage(report.join('\n'));

  const exceededThreshold = total >= parseFloat(process.env.ALERT_THRESHOLD!);

  if (exceededThreshold) {
    const alertMessage = `Total value exceeds threshold!`;
    log(alertMessage);
    await sendTelegramMessage('🚨 <b>Portfolio Alert</b> ' + alertMessage);


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
