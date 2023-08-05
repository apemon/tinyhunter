import { Contract, FeeData } from 'ethers';

import { BundleParams, IPendingTransaction } from '@flashbots/mev-share-client';
import { initMevShare } from './lib/client';
import { MevShareCTFSimpleAbi } from './abi/MevShareCTFSimple';

const TX_GAS_LIMIT = 400000;
const MAX_GAS_PRICE = 500n;
const MAX_PRIORITY_FEE = 100n;
const GWEI = 10n ** 9n;
const TIP = 100n * GWEI;

const BLOCKS_TO_TRY = 24;

// 0x98997b55Bb271e254BEC8B85763480719DaB0E53 -> simple
// 0x1cdDB0BA9265bb3098982238637C2872b7D12474 -> simple
// 0x65459dD36b03Af9635c06BAD1930DB660b968278 -> simple
// 0x20a1A5857fDff817aa1BD8097027a841D4969AA5 -> simple
// 0x118Bcb654d9A7006437895B51b5cD4946bF6CdC2 -> simple
// 0x9BE957D1c1c1F86Ba9A2e1215e9d9EEFdE615a56
// 0xE8B7475e2790409715AF793F799f3Cc80De6f071
// 0x5eA0feA0164E5AA58f407dEBb344876b5ee10DEA
// 0x1eA6Fb65BAb1f405f8Bdb26D163e6984B9108478
const CONTRACT_ADDRESS_LIST = [
  '0x98997b55Bb271e254BEC8B85763480719DaB0E53'.toLowerCase(),
  // '0x1cdDB0BA9265bb3098982238637C2872b7D12474'.toLowerCase(),
  // '0x65459dD36b03Af9635c06BAD1930DB660b968278'.toLowerCase(),
  '0x20a1A5857fDff817aa1BD8097027a841D4969AA5'.toLowerCase()
]

const { mevShare, executorWallet, provider } = initMevShare();

async function backrunHandler(pendingTxHash: string, address: string) {
  const currentBlock = await provider.getBlockNumber();
  console.log('current block', currentBlock);

  const contract = new Contract(
    address,
    MevShareCTFSimpleAbi,
    executorWallet,
  );

  const tx = await contract.claimReward.populateTransaction();
  const nonce = await executorWallet.getNonce('latest');
  const gasFee = await provider.getFeeData();
  console.log('gas fee', gasFee);
  let maxFeePerGas = MAX_GAS_PRICE * GWEI + TIP;
  if (gasFee.gasPrice) {
    maxFeePerGas = gasFee.gasPrice * GWEI * 10n + TIP;
  }
  let maxPriorityFeePerGas = MAX_PRIORITY_FEE * GWEI;
  if (gasFee.maxPriorityFeePerGas) {
    maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas * 200n + TIP
  }
  const claimTx = {
    ...tx,
    type: 2,
    chainId: 5,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: TX_GAS_LIMIT,
    nonce: nonce,
    // gasPrice: gasFee.gasPrice
  };
  console.log(claimTx)
  const signedTx = await executorWallet.signTransaction(claimTx);
  const bundleParams: BundleParams = {
    inclusion: {
      block: currentBlock + 1,
      // maxBlock: currentBlock + BLOCKS_TO_TRY,
    },
    body: [{ hash: pendingTxHash }, { tx: signedTx, canRevert: false }],
  };
  // const simResult = await mevShare.simulateBundle(bundleParams);
  // console.log('sim result', simResult);
  const sendBundleResult = await mevShare.sendBundle(bundleParams);
  console.log('bundle hash', sendBundleResult.bundleHash);
}

const main = async () => {
  mevShare.on('transaction', async (pendingTx: IPendingTransaction) => {

    if (
      pendingTx.functionSelector === '0xa3c356e4'
    ) {
      console.log('functionselector match')
      const to = pendingTx.to || null
      if (!to) {
        return
      }
      if (CONTRACT_ADDRESS_LIST.includes(to)) {
        console.log('found activeRewardSimple in function selctor', pendingTx.hash);
        await backrunHandler(pendingTx.hash, to);
      }

    } else if (
      pendingTx.logs && pendingTx.logs.length > 0
    ) {
      await Promise.all(pendingTx.logs.map(async (log) => {
        const address = log.address.toLowerCase()
        if (CONTRACT_ADDRESS_LIST.includes(address)) {
          console.log('found activeRewardSimple in logs!', pendingTx.hash);
          await backrunHandler(pendingTx.hash, address);
        }
      }))
    }

    // if (pendingTx.logs && pendingTx.logs.length > 0) {
    //   console.log(pendingTx.logs)
    // }
  });
};

main();
