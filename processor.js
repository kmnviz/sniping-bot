require('dotenv').config();
const { Contract } = require('ethers');
const Decimal = require('decimal.js');
const moment = require('moment');
const blockchain = require('./blockchain.json');
const { safeTelegramFormat } = require('./utils');

class Processor {

    constructor(provider, telegramBot) {
        this.provider = provider;
        this.telegramBot = telegramBot;
    }

    /**
     * Method returns true if pair passed all checks
     * @param token0
     * @param token1
     * @param pairAddress
     * @returns {Promise<{
     *     address: string,
     *     token0: {
     *         address: string,
     *         symbol: string,
     *         decimals: string,
     *         totalSupply: string,
     *     },
     *     token1: {
     *         address: string,
     *         symbol: string,
     *         decimals: string,
     *         totalSupply: string,
     *     },
     * }|undefined>}
     */
    async processCreatedPair(token0, token1, pairAddress) {
        const token0Contract = new Contract(token0, blockchain.erc20Abi, this.provider);
        const token1Contract = new Contract(token1, blockchain.erc20Abi, this.provider);
        const pairContract = new Contract(pairAddress, blockchain.uniSwapV2PairAbi, this.provider);

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

        // Track only pairs with reserves
        const reserves = await pairContract.getReserves();
        if (reserves[0] <= 0 && reserves[1] <= 0) {
            console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
            console.log(`Pair with no reserves - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
            console.log('----------');
            return;
        }

        // Track pairs with WETH liquidity more than
        if (Decimal(reserves[1].toString()).lt(Decimal(process.env.MINIMUM_WETH_LIQUIDITY_IN_WEI))) {
            console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
            console.log(`Low WETH liquidity pair - liquidity: ${reserves[1].toString()}, token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`)
            console.log('----------');
            return;
        }

        // Check percentage liquidity provided
        const token0Decimals = (await token0Contract.decimals()).toString();
        const token0TotalSupply = (await token0Contract.totalSupply()).toString();
        const liquidityToken0 = Decimal(Decimal(reserves[0].toString()).div(Decimal(10).pow(token0Decimals))).toFixed(3);
        const liquidityPercentageToken0 = Decimal(reserves[0].toString()).div(token0TotalSupply).times(100).toFixed(2);

        // Track pairs with provided liquidity less than 10%
        if (Decimal(liquidityPercentageToken0).gte(Decimal(+process.env.MAX_PERCENTAGE_LIQUIDITY))) {
            console.log(moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'));
            console.log(`Provided liquidity higher than ${process.env.MAX_PERCENTAGE_LIQUIDITY}% - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
            console.log('----------');
            return;
        }

        const token0Symbol = await token0Contract.symbol();
        const token1Symbol = await token1Contract.symbol();
        const token1Decimals = (await token1Contract.decimals()).toString();
        const liquidityToken1 = Decimal(Decimal(reserves[1].toString()).div(Decimal(10).pow(token1Decimals))).toFixed(3);

        const tokenPriceInUsdc = (await this.tokenPriceInUsdc(reserves[0].toString(), reserves[1].toString(), token0Decimals));

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

        if (+process.env.TELEGRAM_BOT_ENABLED) {
            await this.telegramBot.telegram.sendMessage(
                +process.env.SNIPING_BOT_CHAT_ID,
                message,
                {
                    parse_mode: 'MarkdownV2',
                    disable_web_page_preview: true,
                },
            );
        }

        return {
            address: pairAddress,
            token0: {
                address: token0,
                symbol: token0Symbol,
                decimals: token0Decimals,
                totalSupply: token0TotalSupply,
            },
            token1: {
                address: token1,
                symbol: token1Symbol,
                decimals: token1Decimals,
                totalSupply: '',
            },
        };
    }

    /**
     *
     * @param pairData {{
     *     address: string,
     *     token0: {
     *         address: string,
     *         symbol: string,
     *         decimals: string,
     *         totalSupply: string,
     *     },
     *     token1: {
     *         address: string,
     *         symbol: string,
     *         decimals: string,
     *         totalSupply: string,
     *     },
     * }}
     * @param sender {string}
     * @param amount0In {string}
     * @param amount1In {string}
     * @param amount0Out {string}
     * @param amount1Out {string}
     * @param to {string}
     * @param wethPrice {string}
     * @returns {Promise<{
     *     pair: string,
     *     ticker: string,
     *     sender: string,
     *     to: string,
     *     price: {
     *         usdc: string,
     *         weth: string,
     *     }
     * }>}
     */
    async processPairSwap(
        pairData,
        sender,
        amount0In,
        amount1In,
        amount0Out,
        amount1Out,
        to,
        wethPrice,
    ) {
        let token0PriceInWeth, token0PriceInUsdc;

        if (Decimal(amount0In).gt(0)) {
            const normalizedTokenPrice = Decimal(amount0In)
                .div(Decimal(10).pow(pairData.token0.decimals));
            const normalizedWethPrice = Decimal(amount1Out)
                .div(Decimal(10).pow(blockchain.wethDecimals));

            token0PriceInWeth = Decimal(normalizedWethPrice)
                .div(normalizedTokenPrice);

            token0PriceInUsdc = token0PriceInWeth.mul(wethPrice);
        } else if (Decimal(amount1In).gt(0)) {
            const normalizedTokenPrice = Decimal(amount0Out)
                .div(Decimal(10).pow(pairData.token0.decimals));
            const normalizedWethPrice = Decimal(amount1In)
                .div(Decimal(10).pow(blockchain.wethDecimals));

            token0PriceInWeth = Decimal(normalizedWethPrice)
                .div(normalizedTokenPrice);

            token0PriceInUsdc = token0PriceInWeth.mul(wethPrice);
        }

        return {
            pair: pairData.address,
            ticker: `${pairData.token0.symbol}/${pairData.token1.symbol}`,
            sender: sender,
            to: to,
            amount: {
                in0: amount0In,
                in1: amount1In,
                out0: amount0Out,
                out1: amount1Out,
            },
            price: {
                usdc: token0PriceInUsdc.toFixed(18),
                weth: token0PriceInWeth.toFixed(18),
            },
        };
    }

    /**
     *
     * @param tokenReserve
     * @param wethReserve
     * @param tokenDecimals
     * @returns {Promise<string>}
     */
    async tokenPriceInUsdc(tokenReserve, wethReserve, tokenDecimals) {
        try {
            const wethUsdcContract = new Contract(blockchain.usdcWethAddress, blockchain.uniSwapV2PairAbi, this.provider);
            const wethUsdcReserves = await wethUsdcContract.getReserves();

            // Normalize token/weth reserves
            const normalizedTokenWethReserve = Decimal(tokenReserve).div(Decimal(10).pow(tokenDecimals));
            const normalizedWethReserve = Decimal(wethReserve).div(Decimal(10).pow(blockchain.wethDecimals));

            // Normalize weth/usdc reserves
            const normalizedUsdcReserve = Decimal(wethUsdcReserves[0].toString()).div(Decimal(10).pow(blockchain.usdcDecimals));
            const normalizedWethUsdcReserve = Decimal(wethUsdcReserves[1].toString()).div(Decimal(10).pow(blockchain.wethDecimals));

            const tokenPriceInWeth = normalizedWethReserve.div(normalizedTokenWethReserve);
            const wethPriceInUsdc = normalizedUsdcReserve.div(normalizedWethUsdcReserve);
            const tokenPriceInUsdc = tokenPriceInWeth.mul(wethPriceInUsdc);

            return tokenPriceInUsdc.toFixed(blockchain.usdcDecimals);
        } catch (error) {
            console.log('Failed to calculate token price in usdc. error: ', error);
            throw error;
        }
    }

    /**
     *
     * @returns {Promise<string>}
     */
    async wethPriceInUsdc() {
        try {
            const wethUsdcContract = new Contract(blockchain.usdcWethAddress, blockchain.uniSwapV2PairAbi, this.provider);
            const wethUsdcReserves = await wethUsdcContract.getReserves();

            const normalizedUsdcReserve = Decimal(wethUsdcReserves[0].toString()).div(Decimal(10).pow(blockchain.usdcDecimals));
            const normalizedWethUsdcReserve = Decimal(wethUsdcReserves[1].toString()).div(Decimal(10).pow(blockchain.wethDecimals));

            const wethPriceInUsdc = normalizedUsdcReserve.div(normalizedWethUsdcReserve);

            return wethPriceInUsdc.toFixed(6);
        } catch (error) {
            console.log('Failed to calculate weth price in usdc. error: ', error);
            throw error;
        }
    }

    async isLiquidityLocked(pairAddress) {
        const pairContract = new Contract(pairAddress, blockchain.uniSwapV2PairAbi, this.provider);
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
}

module.exports = Processor;
