import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const COINS = (process.env.PORTFOLIOASSETS || '')
  .split(',')
  .map(s => s.trim())
  .filter((s): s is string => !!s) as readonly string[];
type Coin = typeof COINS[number];

const BASE_URL = 'https://api.mexc.com';

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

async function fetchPrice(symbol: Coin): Promise<number> {
  const { data } = await axios.get(`${BASE_URL}/api/v3/ticker/price`, {
    params: { symbol: `${symbol}USDT` },
  });
  return parseFloat(data.price);
}

async function fetchBalances(): Promise<Record<Coin, number>> {
  const timestamp = getTimestamp();
  const queryString = `timestamp=${timestamp}`;
  const signature = sign(queryString, process.env.MEXC_API_SECRET!);

  const { data } = await axios.get(`${BASE_URL}/api/v3/account`, {
    headers: {
      'X-MEXC-APIKEY': process.env.MEXC_API_KEY!,
    },
    params: {
      timestamp,
      signature,
    },
  });

  const balances: Record<Coin, number> = {
    AVAX: 0, ICP: 0, ONDO: 0, ALGO: 0
  };

  for (const asset of data.balances) {
    if (COINS.includes(asset.asset)) {
      balances[asset.asset as Coin] = parseFloat(asset.free);
    }
  }

  return balances;
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

async function run() {
  const balances = await fetchBalances();
  let total = 0;
  const report: string[] = [];

  for (const coin of COINS) {
    const amount = balances[coin];
    const price = await fetchPrice(coin);
    const value = amount * price;
    total += value;
    report.push(`${coin}: ${amount} x $${price.toFixed(2)} = $${value.toFixed(2)}`);
  }

  const summary = `Total: $${total.toFixed(2)}`;
  report.push(summary);

  log(report);

  // if (total >= parseFloat(process.env.ALERT_THRESHOLD!)) {
  //   // For now, just log to console
  //   log(`🚨 ALERT: Total portfolio value is above threshold: $${total.toFixed(2)}`);
  // }
  let alertMessage = `Total value: ${total.toFixed(2)}`;
  log(alertMessage);
  await sendTelegramMessage(alertMessage);

  if (total >= parseFloat(process.env.ALERT_THRESHOLD!)) {
    alertMessage = `Total value exceeds threshold!`;
    log(alertMessage);
    await sendTelegramMessage('🚨 <b>Portfolio Alert</b> ' + alertMessage);
  }
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
        .replace(process.env.MEXC_API_KEY || '', '[REDACTED_API_KEY]')
        .replace(process.env.MEXC_API_SECRET || '', '[REDACTED_API_SECRET]')
        .replace(process.env.TELEGRAM_BOT_TOKEN || '', '[REDACTED_BOT_TOKEN]');
    }

    try {
      await sendTelegramMessage(errorToTelegramMessage(err));
    } catch {}

    if (err instanceof Error) {
      log(err.stack ?? err.message);
    } else {
      log(String(err));
    }
};

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
