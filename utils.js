const safeTelegramFormat = (message) => {
    return message.replace('.', ',');
};

module.exports = {
    safeTelegramFormat,
};
