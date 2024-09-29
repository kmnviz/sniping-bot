require('dotenv').config();
const { WebSocketProvider, Contract } = require('ethers');
const Decimal = require('decimal.js');
const moment = require('moment');
const blockchain = require('./blockchain.json');
const telegramBot = require('./telegramBot');
const { safeTelegramFormat } = require('./utils');

const provider = new WebSocketProvider(process.env.RPC_URL_WEBSOCKET);
// const bscProvider = new WebSocketProvider(process.env.RPC_URL_BSC_WEBSOCKET);

const uniSwapV2Factory = new Contract(blockchain.uniSwapV2FactoryAddress, blockchain.uniSwapV2FactoryAbi, provider);
// const pancakeSwapV2Factory = new Contract(blockchain.pancakeSwapFactoryBSCAddress, blockchain.uniSwapV2FactoryAbi, bscProvider);

const calculateTokenPrice = async (tokenReserve, wethReserve, tokenDecimals) => {
    try {
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
    } catch (error) {
        console.log('Failed to calculate roken price. error: ', error);
        throw error;
    }
}

const isLiquidityLocked = async (pairAddress) => {
    const pairContract = new Contract(pairAddress, blockchain.uniSwapV2PairAbi, provider);
    const totalSupply = (await pairContract.totalSupply()).toString();
    const uncxAmount = (await pairContract.balanceOf(blockchain.uncxLockLPEthereumAddress)).toString();
    const tfAmount = (await pairContract.balanceOf(blockchain.teamFinanceLockLPEthereumAddress)).toString();
    const flokiAmount = (await pairContract.balanceOf(blockchain.flokiLockLPEthereumAddress)).toString();
    const pinkSaleAmount = (await pairContract.balanceOf(blockchain.pinkSaleLockLPEthereumAddress)).toString();
    const totalLocked = Decimal(uncxAmount).plus(tfAmount).plus(flokiAmount).plus(pinkSaleAmount).toString();

    return {
        totalSupply: totalSupply,
        totalLocked: totalLocked,
        lockedPercentage: Decimal(totalLocked).div(totalSupply).times(100).toString(),
    };
}

telegramBot.launch();
(async () => {
    provider.websocket.on('close', () => {
        console.log('----------');
        console.log('Connection was closed.');
        console.log('----------');
    });

    await uniSwapV2Factory.on('PairCreated', async (token0, token1, pairAddress) => {
        try {
            const token0Contract = new Contract(token0, blockchain.erc20Abi, provider);
            const token1Contract = new Contract(token1, blockchain.erc20Abi, provider);
            const pairContract = new Contract(pairAddress, blockchain.uniSwapV2PairAbi, provider);

            // Track only WETH pairs
            if (![token0, token1].includes(blockchain.wethAddress)) {
                console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
                console.log(`Not WETH pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                console.log('----------');
                return;
            }

            // Track only ${TOKEN}/WETH pairs
            if (token1 !== blockchain.wethAddress) {
                console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
                console.log(`Incorrect WETH pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                console.log('----------');
                return;
            }

            // If pool has no reserves HIDE it
            const reserves = await pairContract.getReserves();
            if (reserves[0] <= 0 && reserves[1] <= 0) {
                console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
                console.log(`Pair with no reserves - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                console.log('----------');
                return;
            }

            // Track pairs with WETH liquidity more than
            if (Decimal(reserves[1].toString()).lt(Decimal('10000000000000000000'))) {
                console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
                console.log(`Low WETH liquidity pair - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`)
                console.log('----------');
                return;
            }

            // Check percentage liquidity provided
            const token0Decimals = (await token0Contract.decimals()).toString();
            const token0TotalSupply = (await token0Contract.totalSupply()).toString();
            const liquidityToken0 = Decimal(Decimal(reserves[0].toString()).div(Decimal(10).pow(token0Decimals))).toFixed(3);
            const liquidityPercentageToken0 = Decimal(reserves[0].toString()).div(token0TotalSupply).times(100).toFixed(2);

            if (Decimal(liquidityPercentageToken0).gte(Decimal(10))) {
                console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
                console.log(`Provided liquidity higher than 10% - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
                console.log('----------');
                return;
            }

            const token0Symbol = await token0Contract.symbol();
            const token1Symbol = await token1Contract.symbol();
            const token1Decimals = (await token1Contract.decimals()).toString();
            const liquidityToken1 = Decimal(Decimal(reserves[1].toString()).div(Decimal(10).pow(token1Decimals))).toFixed(3);

            const tokenPriceInUsdc = (await calculateTokenPrice(reserves[0].toString(), reserves[1].toString(), token0Decimals));

            // Useful info for an endpoint mb
            // const tokenMarketCapInUsdc = Decimal(token0TotalSupply).mul(tokenPriceInUsdc).toFixed(2);
            // const lockedLiquidity = await isLiquidityLocked(pairAddress);
            // const lockedLiquidityPercentage = Decimal(lockedLiquidity.lockedPercentage).toFixed(2);

            const etherscan = `[etherscan](https://etherscan.io/address/${pairAddress})`;
            const dextools = `[dextools](https://www.dextools.io/app/en/ether/pair-explorer/${pairAddress})`;

            const message = `
‼️ NEW PAIR @ UniSwap V2 🦄 ‼️

ticker: ${safeTelegramFormat(token0Symbol)} / ${token1Symbol}
liquidity: ${safeTelegramFormat(liquidityToken0)} / ${safeTelegramFormat(liquidityToken1)}
liquidity percentage: ${safeTelegramFormat(liquidityPercentageToken0)}%
token price: $${safeTelegramFormat(tokenPriceInUsdc)}

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

    // await pancakeSwapV2Factory.on('PairCreated', async (token0, token1, pairAddress) => {
    //     console.log('PancakeSwap pair created: ', token0, token1, pairAddress);
    // });

    console.log('service started...');
})();
