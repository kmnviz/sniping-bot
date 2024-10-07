require('dotenv').config();
const Decimal = require('decimal.js');
const { Contract } = require('ethers');
const blockchain = require('./blockchain.json');

class Watcher {

    pairs;
    wethPrice;

    constructor(provider, processor, database) {
        this.provider = provider;
        this.processor = processor;
        this.database = database;
        this.pairs = [];
        this.wethPrice = 0;
    }

    async start() {
        await this.watchWethUsdcPair();
        await this.watchPairsCreated();
        await this.watchStoredPairsSwaps();
    }

    async watchWethUsdcPair() {
        try {
            this.wethPrice = await this.processor.wethPriceInUsdc();

            const pairContract = new Contract(blockchain.wethUsdcAddress, blockchain.uniSwapV2PairAbi, this.provider);

            pairContract.on('Swap', async (sender, amount0In, amount1In, amount0Out, amount1Out, to) => {
                const usdcIn = Decimal(amount0In.toString())
                    .div(Decimal(10).pow(blockchain.usdcDecimals));
                const usdcOut = Decimal(amount0Out.toString())
                    .div(Decimal(10).pow(blockchain.usdcDecimals));
                const wethIn = Decimal(amount1In.toString())
                    .div(Decimal(10).pow(blockchain.wethDecimals));
                const wethOut = Decimal(amount1Out.toString())
                    .div(Decimal(10).pow(blockchain.wethDecimals));

                if (Decimal(usdcIn).gt(0)) {
                    const slippage = Decimal('0.0031');
                    this.wethPrice = Decimal(usdcIn).div(wethOut)
                        .minus(Decimal(this.wethPrice).mul(Decimal(slippage)));
                } else if (Decimal(wethIn).gt(0)) {
                    const slippage = Decimal('0.0029');
                    this.wethPrice = Decimal(usdcOut).div(wethIn)
                        .plus(Decimal(this.wethPrice).mul(Decimal(slippage)));
                }

                // console.log(`Swap of weth/usdc pair. Price: ${this.wethPrice}`);
            });

            console.log(`Started watchWethUsdcPair...`);
        } catch (error) {
            console.log('Failed to watch for weth/usdc pair. error: ', error);
        }
    }

    async watchPairsCreated() {
        const uniSwapV2Factory = new Contract(blockchain.uniSwapV2FactoryAddress, blockchain.uniSwapV2FactoryAbi, this.provider);

        uniSwapV2Factory.on('PairCreated', async (token0, token1, pairAddress) => {
            try {
                const createdPair = await this.processor.processCreatedPair(token0, token1, pairAddress);
                if (createdPair) {
                    await this.database.storePair(createdPair);

                    const pairContract = new Contract(createdPair.address, blockchain.uniSwapV2PairAbi, this.provider);
                    this.watchPairEvents(pairContract, createdPair);
                }
            } catch (error) {
                console.log('error: ', error);
                console.log(`Failed to process - token0: ${token0}; token1: ${token1}; pairAddress: ${pairAddress}`);
            }
        });

        console.log(`Started watchPairsCreated...`);
    }

    async watchStoredPairsSwaps() {
        const pairs = await this.database.fetchPairs();

        pairs.forEach((doc) => {
            const pairData = doc.data();
            const pairContract = new Contract(pairData.address, blockchain.uniSwapV2PairAbi, this.provider);

            this.watchPairEvents(pairContract, pairData);
        });

        console.log(`Started watchStoredPairsSwaps...`);
    }

    watchPairEvents(pairContract, pairData) {
        pairContract.on('Swap', async (sender, amount0In, amount1In, amount0Out, amount1Out, to) => {
            try {
                const swap = await this.processor.processPairSwap(
                    pairData,
                    sender,
                    amount0In.toString(),
                    amount1In.toString(),
                    amount0Out.toString(),
                    amount1Out.toString(),
                    to,
                    this.wethPrice,
                );

                await this.database.storeSwap(swap);
            } catch (error) {
                console.log('error: ', error);
                console.log(`Failed to process pair swap. Pair ${pairData.address}`);
            }
        });

        pairContract.on('Mint', async (sender, amount0, amount1) => {
            try {
                await this.database.storeMint({
                    sender: sender,
                    amount: {
                        token0: amount0.toString(),
                        token1: amount1.toString(),
                    },
                });
            } catch (error) {
                console.log('error: ', error);
                console.log(`Failed to process pair mint. Pair ${pairData.address}`);
            }
        });

        pairContract.on('Burn', async (sender, amount0, amount1, to) => {
            try {
                await this.database.storeBurn({
                    sender: sender,
                    to: to,
                    amount: {
                        token0: amount0.toString(),
                        token1: amount1.toString(),
                    },
                });
            } catch (error) {
                console.log('error: ', error);
                console.log(`Failed to process pair mint. Pair ${pairData.address}`);
            }
        });
    }
}

module.exports = Watcher;
