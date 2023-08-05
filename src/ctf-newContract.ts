import { Contract, getCreate2Address, keccak256 } from 'ethers';

import { BundleParams, IPendingTransaction } from '@flashbots/mev-share-client';
import { initMevShare } from './lib/client';
import { MEV_SHARE_CTF_NEW_CONTRACT_ABI, MEV_SHARE_CTF_NEW_CONTRACT_CHILD_BYTECODE } from './lib/abi';

const TX_GAS_LIMIT = 500000;
const MAX_GAS_PRICE = 100n;
const MAX_PRIORITY_FEE = 100n;
const GWEI = 10n ** 9n;
const TIP = 100n * GWEI;

const BLOCKS_TO_TRY = 3;
const CONTRACT_ADDRESS = '0x5ea0fea0164e5aa58f407debb344876b5ee10dea';

const { mevShare, executorWallet, provider } = initMevShare();
const contract = new Contract(
  CONTRACT_ADDRESS,
  MEV_SHARE_CTF_NEW_CONTRACT_ABI,
  executorWallet,
);

async function backrunHandler(
  pendingTxHash: string,
  childContractAddress: string,
) {
  const currentBlock = await provider.getBlockNumber();
  console.log('current block', currentBlock);

  const nonce = await executorWallet.getNonce('latest');

  const childContract = new Contract(childContractAddress, [
    'function claimReward()'
  ], executorWallet)
  const tx = await childContract.claimReward.populateTransaction();
  const signedTx = await executorWallet.signTransaction({
    ...tx,
    chainId: 5,
    maxFeePerGas: MAX_GAS_PRICE * GWEI + TIP,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE * GWEI + TIP,
    gasLimit: TX_GAS_LIMIT,
    nonce: nonce,
  });
  const bundleParams: BundleParams = {
    inclusion: { block: currentBlock + 1, maxBlock: currentBlock + BLOCKS_TO_TRY },
    body: [{ hash: pendingTxHash }, { tx: signedTx, canRevert: false }],
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
      log.address === '0x5ea0fea0164e5aa58f407debb344876b5ee10dea' &&
      (log.topics[0] === '0xf7e9fe69e1d05372bc855b295bc4c34a1a0a5882164dd2b26df30a26c1c8ba15' ||
        log.topics[0] === '0x71fd33d3d871c60dc3d6ecf7c8e5bb086aeb6491528cce181c289a411582ff1c')
  );

const main = async () => {
  let lowerBound, upperBound;

  mevShare.on('transaction', async (pendingTx: IPendingTransaction) => {
    if (ruleFunc(pendingTx)) {
      try {
        console.log(pendingTx);
        if (pendingTx.logs && pendingTx.logs.length > 0) {
          if (pendingTx.logs[0].topics[0] === '0xf7e9fe69e1d05372bc855b295bc4c34a1a0a5882164dd2b26df30a26c1c8ba15') {
            const [newlyDeployedContract] = contract.interface.decodeEventLog(
              'Activate',
              (pendingTx.logs && pendingTx.logs[0].data) || ''
            )
            console.log('newlyDeployedAddress', newlyDeployedContract)
            // await backrunHandler(pendingTx.hash, newlyDeployedContract)
          } else if (pendingTx.logs[0].topics[0] === '0x71fd33d3d871c60dc3d6ecf7c8e5bb086aeb6491528cce181c289a411582ff1c') {
            const [salt] = contract.interface.decodeEventLog(
              'ActivateBySalt',
              (pendingTx.logs && pendingTx.logs[0].data) || ''
            )
            console.log('salt', salt)
            // find new address
            const childContractAddress = getCreate2Address(
              CONTRACT_ADDRESS,
              salt,
              keccak256(MEV_SHARE_CTF_NEW_CONTRACT_CHILD_BYTECODE)
            )
            console.log('childContractAddressFromSalt', childContractAddress)
            await backrunHandler(pendingTx.hash, childContractAddress)
          }
        }
      } catch (e) {
        return;
      }
    }
  });
};

main();
