require('dotenv').config();
const { WebSocketProvider, Contract } = require('ethers');
const telegramBot = require('./telegramBot');
const Database = require('./database');
const Processor = require('./processor');
const Watcher = require('./watcher');

const provider = new WebSocketProvider(process.env.RPC_URL_WEBSOCKET);

if (process.env.TELEGRAM_BOT_ENABLED) {
    telegramBot.launch();
}

(async () => {
    const database = new Database();
    const processor = new Processor(provider, telegramBot);
    const watcher = new Watcher(provider, processor, database);

    await watcher.start();

    provider.websocket.on('close', () => {
        console.log('----------');
        console.log('Connection was closed.');
        console.log('----------');
    });

    console.log('service started...');
})();
