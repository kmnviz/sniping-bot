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
        const docRef = this.client
            .collection('pairs')
            .doc(uuidv4());

        await docRef.set(pair);
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
        const docRef = this.client
            .collection('swaps')
            .doc(uuidv4());

        await docRef.set(swap);
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
}

module.exports = Database;
