require('dotenv').config();
const { WebSocketProvider, Contract } = require('ethers');
const Decimal = require('decimal.js');
const blockchain = require('./blockchain.json');
const telegramBot = require('./telegramBot');

const provider = new WebSocketProvider(process.env.RPC_URL_WEBSOCKET);

const uniSwapV2Factory = new Contract(blockchain.uniSwapV2FactoryAddress, blockchain.uniSwapV2FactoryAbi, provider);

const calculateTokenPrice = async (tokenReserve, wethReserve, tokenDecimals) => {
    const wethUsdcContract = new Contract(blockchain.usdcWethAddress, blockchain.uniSwapV2PairAbi, provider);
    const wethUsdcReserves = await wethUsdcContract.getReserves();

    // Normalize token/weth reserves
    const normalizedTokenWethReserve = new Decimal(tokenReserve).div(new Decimal(10).pow(tokenDecimals));
    const normalizedWethReserve = new Decimal(wethReserve).div(new Decimal(10).pow(blockchain.wethDecimals));

    // Normalize weth/usdc reserves
    const normalizedUsdcReserve = new Decimal(wethUsdcReserves[0].toString()).div(new Decimal(10).pow(blockchain.usdcDecimals));
    const normalizedWethUsdcReserve = new Decimal(wethUsdcReserves[1].toString()).div(new Decimal(10).pow(blockchain.wethDecimals));

    const tokenPriceInWeth = normalizedWethReserve.div(normalizedTokenWethReserve);
    const wethPriceInUsdc = normalizedUsdcReserve.div(normalizedWethUsdcReserve);
    const tokenPriceInUsdc = tokenPriceInWeth.mul(wethPriceInUsdc);

    return tokenPriceInUsdc.toFixed(18);
}

telegramBot.launch();
(async () => {
    await uniSwapV2Factory.on('PairCreated', async (token0, token1, pairAddress) => {
        try {
            const token0Contract = new Contract(token0, blockchain.erc20Abi, provider);
            const token1Contract = new Contract(token1, blockchain.erc20Abi, provider);
            const pairContract = new Contract(pairAddress, blockchain.uniSwapV2PairAbi, provider);

            // Track only WETH pairs
            if (![token0, token1].includes(blockchain.wethAddress)) {
                console.log(`Not WETH pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                return;
            }

            // Track only ${TOKEN}/WETH pairs
            if (token1 !== blockchain.wethAddress) {
                console.log(`Incorrect WETH pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                return;
            }

            // If pool has no reserves HIDE it
            const reserves = await pairContract.getReserves();
            if (reserves[0] <= 0 && reserves[1] <= 0) {
                console.log(`Pair with no reserves - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                return;
            }

            // Track pairs with WETH liquidity more than
            if (Decimal(reserves[1].toString()).lt(Decimal('10000000000000000000'))) {
                console.log(`Low WETH liquidity pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                return;
            }

            const token0Symbol = await token0Contract.symbol();
            const token0Decimals = (await token0Contract.decimals()).toString();
            const token0TotalSupply = (await token0Contract.totalSupply()).toString();
            const token1Symbol = await token1Contract.symbol();
            const token1Decimals = (await token1Contract.decimals()).toString();

            const liquidityToken0 = Decimal(Decimal(reserves[0].toString()).div(Decimal(10).pow(token0Decimals))).toFixed(3);
            const liquidityPercentageToken0 = Decimal(reserves[0].toString()).div(token0TotalSupply).times(100).toFixed(2);
            const liquidityToken1 = Decimal(Decimal(reserves[1].toString()).div(Decimal(10).pow(token1Decimals))).toFixed(3);

            const tokenPriceInUsdc = (await calculateTokenPrice(reserves[0].toString(), reserves[1].toString(), token0Decimals));
            const tokenMarketCapInUsdc = Decimal(token0TotalSupply).mul(tokenPriceInUsdc).toFixed(2);

            const etherscan = `[etherscan](https://etherscan.io/address/${pairAddress})`;
            const dextools = `[dextools](https://www.dextools.io/app/en/ether/pair-explorer/${pairAddress})`;

            const message = `
‼️ NEW PAIR @ UniSwap V2 🦄 ‼️

ticker: ${token0Symbol}/${token1Symbol}
liquidity: ${liquidityToken0.replace('.', ',')} / ${liquidityToken1.replace('.', ',')}
liquidity percentage: ${liquidityPercentageToken0.replace('.', ',')}
token price: ${tokenPriceInUsdc.replace('.', ',')}
market cap: ${tokenMarketCapInUsdc.replace('.', ',')}

${dextools} ${etherscan}

Good luck 🍀

`;
            console.log(message);
            await telegramBot.telegram.sendMessage(
                +process.env.SNIPING_BOT_CHAT_ID,
                message,
                {
                    parse_mode: 'MarkdownV2',
                    disable_web_page_preview: true,
                },
            );
        } catch (error) {
            console.log('error: ', error);
            console.log(`Failed to process - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
        }
    });

    console.log('service started...');
})();
