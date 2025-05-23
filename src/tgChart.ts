import axios from 'axios';
import { Coin } from './shared';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import FormData from 'form-data';
import annotationPlugin from 'chartjs-plugin-annotation';
import Chart from 'chart.js/auto';
import { ChartConfiguration } from 'chart.js';

Chart.register(annotationPlugin);

const width = 600;
const height = 300;

export async function generateChartImage(coins: Coin[], totalValue: number): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 600, height: 300 });

  const ASSET_BASE_VALUE = parseFloat(process.env.ASSET_BASE_VALUE || '0');
  const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD || '0');

  const labels = coins.map(c => c.name);
  const values = coins.map(c => c.totalvalue);

  const colors = coins.map(c => {
    if (c.totalvalue < ASSET_BASE_VALUE) return 'rgba(235, 12, 60, 0.86)'; // red
    else if (totalValue >= ALERT_THRESHOLD) return 'rgba(45, 211, 57, 0.6)'; // green
    else return 'rgba(255, 159, 64, 0.8)'; // orange
  });

  const configuration: ChartConfiguration<'bar'> = {
    type: 'bar' as const,
    data: {
      labels,
      datasets: [{
        label: 'USD Value',
        data: values,
        backgroundColor: colors,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'USD' }
        }
      },
      plugins: {
        title: {
          display: true,
          text: `Portfolio Snapshot - ${new Date().toLocaleString()}`
        },
        legend: { display: false },
        annotation: {
          annotations: {
            baseLine: {
              type: 'line',
              yMin: ASSET_BASE_VALUE,
              yMax: ASSET_BASE_VALUE,
              borderColor: 'blue',
              borderWidth: 2,
              label: {
                enabled: true,
                content: `ASSET_BASE_VALUE = $${ASSET_BASE_VALUE}`,
                position: 'end',
                backgroundColor: 'black',
                color: 'white',
                font: { size: 10, weight: 'bold' },
                padding: 4
              }
            }
          }
        } as any // for `label`
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

export async function sendTelegramImage(imageBuffer: Buffer, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('photo', imageBuffer, {
    filename: 'portfolio.png',
    contentType: 'image/png'
  });

  await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
    headers: form.getHeaders()
  });
}
