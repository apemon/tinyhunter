import { Contract } from 'ethers';

import { BundleParams, IPendingTransaction } from '@flashbots/mev-share-client';
import { initMevShare } from './lib/client';
import { MEV_SHARE_CTF_TRIPLE_ABI } from './lib/abi';

const TX_GAS_LIMIT = 500000;
const MAX_GAS_PRICE = 100n;
const MAX_PRIORITY_FEE = 100n;
const GWEI = 10n ** 9n;
const TIP = 100n * GWEI;

const BLOCKS_TO_TRY = 3;
const CONTRACT_ADDRESS = '0x1ea6fb65bab1f405f8bdb26d163e6984b9108478';

const { mevShare, executorWallet, provider } = initMevShare();
const contract = new Contract(
  CONTRACT_ADDRESS,
  MEV_SHARE_CTF_TRIPLE_ABI,
  executorWallet,
);

async function backrunHandler(
  pendingTxHash: string
) {
  const currentBlock = await provider.getBlockNumber();
  console.log('current block', currentBlock);

  const nonce = await executorWallet.getNonce('latest');

  const numbers = [0, 1, 2];
  const txs: any[] = [];
  await Promise.all(numbers.map(async (number) => {
    const tx = await contract.claimReward.populateTransaction();
    const signedTx = await executorWallet.signTransaction({
      ...tx,
      chainId: 5,
      maxFeePerGas: MAX_GAS_PRICE * GWEI + TIP,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE * GWEI + TIP,
      gasLimit: TX_GAS_LIMIT,
      nonce: nonce + number,
    });
    txs.push({
      tx: signedTx,
      canRevert: false
    })
  }))

  const bundleParams: BundleParams = {
    inclusion: { block: currentBlock + 1, maxBlock: currentBlock + BLOCKS_TO_TRY },
    body: [{ hash: pendingTxHash }, ...txs],
  };
  const sendBundleResult = await mevShare.sendBundle(bundleParams);
  console.log('bundle hash', sendBundleResult.bundleHash);
  const simResult = await mevShare.simulateBundle(bundleParams);
  console.log('sim result', simResult);
}

const ruleFunc = (pendingTx: IPendingTransaction) =>
  (pendingTx.logs || []).some(
    (log) =>
      log.data &&
      log.address === '0x1ea6fb65bab1f405f8bdb26d163e6984b9108478'
    // log.topics[0] === '0xf7e9fe69e1d05372bc855b295bc4c34a1a0a5882164dd2b26df30a26c1c8ba15'
  );

const main = async () => {
  let lowerBound, upperBound;

  mevShare.on('transaction', async (pendingTx: IPendingTransaction) => {
    if (ruleFunc(pendingTx)) {
      try {
        console.log(pendingTx);
        backrunHandler(pendingTx.hash)
      } catch (e) {
        return;
      }
    }
  });
};

main();
