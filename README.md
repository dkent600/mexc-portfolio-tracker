# Take Profit Portfolio Tracker

A Node.js script to track a Trade Confident-style Take Profit cryptocurrency portfolio on the MEXC exchange, log results, and send Telegram alerts.

## Features
- Fetches balances for selected coins from your MEXC account
- Retrieves current prices and calculates total portfolio value
- Logs portfolio details to a file and console
- Sends Telegram notifications for portfolio value and errors
- Alerts if portfolio value exceeds a configurable threshold

## Setup

### Prerequisites
- Node.js (v16+ recommended)
- An MEXC account with API key/secret
- A Telegram bot and chat ID for notifications

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/mexc-portfolio-tracker.git
   cd mexc-portfolio-tracker
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the project root with the following variables:
   ```env
   MEXC_API_KEY=your_mexc_api_key
   MEXC_API_SECRET=your_mexc_api_secret
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_telegram_chat_id
   LOGFILEPATH=./portfolio-log.txt
   ALERT_THRESHOLD=1000
   PORTFOLIOASSETS="AVAX,ICP,ONDO,ALGO"
   ```

- `MEXC_API_KEY` and `MEXC_API_SECRET`: Your MEXC API credentials for accessing account data.
- `TELEGRAM_BOT_TOKEN`: The token for your Telegram bot (used to send notifications).
- `TELEGRAM_CHAT_ID`: The chat ID where notifications will be sent.
- `LOGFILEPATH`: Path to the log file where portfolio data will be saved, relative to the location of the script.
- `ALERT_THRESHOLD`: The USD value representing the portfolio total market value at which an alert will be triggered signaling it is time to take profit according to the standard rules of a Trade Confident Portfolio
- `PORTFOLIOASSETS`: A comma-separate list of token names that make up Take Profit portfolio. (Can be whatever tokens you want; the example tokens are only an example, not a recommendation.)

Adjust the values as needed for your environment.

## Usage
Run the script with Node.js:
```sh
node dist/index.js
```
Or, if using TypeScript directly:
```sh
npx ts-node src/index.ts
```

See RunMonitor.ps1 for an example of how to run in a Windows Powershell script.

## Customization
- Edit the `PORTFOLIOASSETS` array in `.env` to define your own portfolio.
- Adjust logging and alert logic as needed.
- set up a way to run automatically and regularly, like Task Scheduler on Windows or cron on unix (the latter not tested).

## License
MIT
