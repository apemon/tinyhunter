import { initMevShare } from './lib/client';
import {
  IPendingTransaction,
  IPendingBundle,
} from '@flashbots/mev-share-client';
import * as ethers from 'ethers'
import { MevShareCTFSimpleAbi } from './abi/MevShareCTFSimple'

const main = async () => {
  const { mevShare, wssProvider } = await initMevShare();

  const simpleMevAddressList = [
    '0x98997b55Bb271e254BEC8B85763480719DaB0E53',
    '0x1cdDB0BA9265bb3098982238637C2872b7D12474',
    '0x65459dD36b03Af9635c06BAD1930DB660b968278',
    '0x20a1A5857fDff817aa1BD8097027a841D4969AA5'
  ]

  // listen for mempool txs
  wssProvider.on('pending', async (txHash: string) => {
    // console.info('mempool', txHash)
    const [tx, txRecp] = await Promise.all([
      wssProvider.getTransaction(txHash),
      wssProvider.getTransactionReceipt(txHash),
    ]);

    // Make sure transaction hasn't been mined
    if (txRecp !== null) {
      return;
    }

    // Sometimes tx is null for some reason
    if (tx === null) {
      return;
    }

    const to = tx.to;
    if (!to) {
      return;
    }

    // check that contract is simple ctf
    console.log(to)
    if (simpleMevAddressList.includes(tx.to)) {
      console.log('match', tx.hash)
      // decode tx
      console.log(tx)
      const data = new ethers.Interface(MevShareCTFSimpleAbi).parseTransaction({ data: tx.data })
      console.log(data)
      return;
    }
  })

  // listen for txs
  mevShare.on('transaction', async (pendingTx: IPendingTransaction) => {
    if (pendingTx.to == '0x98997b55Bb271e254BEC8B85763480719DaB0E53') {
      console.log(pendingTx)
    }
    // if (pendingTx.logs && pendingTx.logs.length > 0) {
    //   for (const log of pendingTx.logs) {
    //     if (log.address === '0x98997b55Bb271e254BEC8B85763480719DaB0E53') {
    //       console.log(log)
    //     }
    //   }
    // }
  });

  // listen for bundles
  mevShare.on('bundle', async (bundle: IPendingBundle) => {
    console.info('bundle', bundle);
  });

  console.log('listening for transactions and bundles...');
};

main();
