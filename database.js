require('dotenv').config();
const { Firestore } = require('@google-cloud/firestore');
const { v4: uuidv4 } = require('uuid');

class Database {

    constructor() {
        this.client = new Firestore({
            projectId: 'zvuk-307612',
            keyFilename: './gcp-firestore.json',
            databaseId: 'sniping-bot',
        });
    }

    async store(collection, document) {
        if (+process.env.STORE_TO_DB) {
            const docRef = this.client
                .collection(collection)
                .doc(uuidv4());

            await docRef.set(document);
        }
    }

    /**
     *
     * @param pair{{
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
     * @returns {Promise<void>}
     */
    async storePair(pair) {
        await this.store('pairs', pair);
    }

    /**
     *
     * @returns {Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>>}
     */
    async fetchPairs() {
        return await this.client
            .collection('pairs')
            .get();
    }

    /**
     *
     * @param swap {{
     *     pair: string,
     *     ticker: string,
     *     sender: string,
     *     to: string,
     *     price: {
     *         usdc: string,
     *         weth: string,
     *     }
     * }}
     * @returns {Promise<void>}
     */
    async storeSwap(swap) {
        await this.store('swaps', swap);
    }

    /**
     *
     * @returns {Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>>}
     */
    async fetchSwaps() {
        return await this.client
            .collection('swaps')
            .get();
    }

    /**
     *
     * @param mint {{
     *     pair: string,
     *     ticker: string,
     *     sender: string,
     *     amount: {
     *         token0: string,
     *         token1: string,
     *     },
     * }}
     * @returns {Promise<void>}
     */
    async storeMint(mint) {
        await this.store('mints', mint);
    }

    /**
     *
     * @returns {Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>>}
     */
    async fetchMints() {
        return await this.client
            .collection('mints')
            .get();
    }

    /**
     *
     * @param burn {{
     *     pair: string,
     *     ticker: string,
     *     sender: string,
     *     to: string,
     *     amount: {
     *         token0: string,
     *         token1: string,
     *     },
     * }}
     * @returns {Promise<void>}
     */
    async storeBurn(burn) {
        await this.store('burns', burn);
    }

    /**
     *
     * @returns {Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>>}
     */
    async fetchBurns() {
        return await this.client
            .collection('burns')
            .get();
    }
}

module.exports = Database;
