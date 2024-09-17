require('dotenv').config();
const { Telegraf } = require('telegraf');

const telegramBotCommandArgs = () => (ctx, next) => {
    if (ctx.updateType === 'message') { // && ctx.updateSubType === 'text'
        const text = ctx?.update?.message?.text
        if (text && text.startsWith('/')) {
            const match = text.match(/^\/([^\s]+)\s?(.+)?/);
            let args = [];
            let command;
            if (match !== null) {
                if (match[1]) {
                    command = match[1];
                }
                if (match[2]) {
                    args = match[2].split(' ');
                }
            }

            ctx.state.command = {
                raw: text,
                command,
                args,
            };
        } else {
            console.log(`Telegram message has no text. ${ctx?.update?.message}`);
        }
    }
    return next();
};

const telegramBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
telegramBot.use(telegramBotCommandArgs());

telegramBot.command('start', (ctx) => {
    console.log('ctx: ', ctx);
    console.log('chatId: ', ctx.chat);
    return telegramBot.telegram.sendMessage(-4504608062, 'Hello there');
});

module.exports = telegramBot;
