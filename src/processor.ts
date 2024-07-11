import { ERC20Processor } from '@sentio/sdk/eth/builtin'
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES, CONFIG } from './consts.ts'
import { handleSYTransfer } from './handlers/SY.js'
import { PendleYieldTokenProcessor } from './types/eth/pendleyieldtoken.js'
import { handleYTRedeemInterest, handleYTTransfer, processAllYTAccounts } from './handlers/YT.js'
import { PendleMarketProcessor } from './types/eth/pendlemarket.js'
import { updateLPtoSYRates, processAccounts } from './handlers/LP.js'
import { EQBBaseRewardProcessor } from './types/eth/eqbbasereward.js'
import { GLOBAL_CONFIG } from "@sentio/runtime";

GLOBAL_CONFIG.execution = {
  sequential: true,
};

PendleMarketProcessor.bind({
  address: PENDLE_POOL_ADDRESSES.LP,
  startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
  endBlock: PENDLE_POOL_ADDRESSES.END_BLOCK,
  name: "Pendle Pool LP",
  network: CONFIG.BLOCKCHAIN
}).onEventTransfer(async(evt, ctx) => {
  await updateLPtoSYRates(ctx);
  await processAccounts(ctx, [
    evt.args.from.toLowerCase(),
    evt.args.to.toLowerCase()
  ]);
}).onEventRedeemRewards(async(evt, ctx) => {
  await updateLPtoSYRates(ctx);
}).onEventSwap(async(evt, ctx) => {
  await updateLPtoSYRates(ctx);
})

EQBBaseRewardProcessor.bind({
  address: PENDLE_POOL_ADDRESSES.EQB_STAKING,
  startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
  name: "Equilibria Base Reward",
  network: CONFIG.BLOCKCHAIN
}).onEventStaked(async(evt, ctx) => {
  await updateLPtoSYRates(ctx);
  await processAccounts(ctx, [evt.args._user.toLowerCase()]);
}).onEventWithdrawn(async(evt, ctx) => {
  await updateLPtoSYRates(ctx);
  await processAccounts(ctx, [evt.args._user.toLowerCase()]);
})

ERC20Processor.bind({
  address: PENDLE_POOL_ADDRESSES.PENPIE_RECEIPT_TOKEN,
  startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
  name: "Pendle Pie Receipt Token",
  network: CONFIG.BLOCKCHAIN
}).onEventTransfer(async(evt, ctx) => {

  await updateLPtoSYRates(ctx);
  await processAccounts(ctx,[
    evt.args.from.toLowerCase(),
    evt.args.to.toLowerCase(),
  ]);
});