import { ERC20Processor } from '@sentio/sdk/eth/builtin'
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES, CONFIG } from './consts.ts'
import { handleSYTransfer } from './handlers/SY.js'
import { PendleYieldTokenProcessor } from './types/eth/pendleyieldtoken.js'
import { handleYTRedeemInterest, handleYTTransfer, processAllYTAccounts } from './handlers/YT.js'
import { PendleMarketProcessor } from './types/eth/pendlemarket.js'
import { handleLPTransfer, handleMarketRedeemReward, handleMarketSwap, processAllLPAccounts } from './handlers/LP.js'
import { EQBBaseRewardProcessor } from './types/eth/eqbbasereward.js'
import { GLOBAL_CONFIG } from "@sentio/runtime";

GLOBAL_CONFIG.execution = {
  sequential: true,
};

// ERC20Processor.bind({
//   address: PENDLE_POOL_ADDRESSES.SY,
//   startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
//   name: "Pendle Pool SY",
//   network: CONFIG.BLOCKCHAIN
// }).onEventTransfer(async(evt, ctx) => {
//   await handleSYTransfer(evt, ctx);
// })

// PendleYieldTokenProcessor.bind({
//   address: PENDLE_POOL_ADDRESSES.YT,
//   startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
//   name: "Pendle Pool YT",
//   network: CONFIG.BLOCKCHAIN

// }).onEventTransfer(async(evt, ctx) => {
//   await handleYTTransfer(evt, ctx);
// }).onEventRedeemInterest(async(evt, ctx) => {
//   await handleYTRedeemInterest(evt, ctx);
// }).onTimeInterval(async(_, ctx) => {
//   await processAllYTAccounts(ctx);
// }, MISC_CONSTS.ONE_DAY_IN_MINUTE);

PendleMarketProcessor.bind({
  address: PENDLE_POOL_ADDRESSES.LP,
  startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
  endBlock: PENDLE_POOL_ADDRESSES.END_BLOCK,
  name: "Pendle Pool LP",
  network: CONFIG.BLOCKCHAIN
}).onEventTransfer(async(evt, ctx) => {
  await handleLPTransfer(evt, ctx);
}).onEventRedeemRewards(async(evt, ctx) => {
  await handleMarketRedeemReward(evt, ctx);
}).onEventSwap(async(evt, ctx) => {
  await handleMarketSwap(evt, ctx);
}).onTimeInterval(async(_, ctx) => {
  await processAllLPAccounts(ctx);
}, MISC_CONSTS.ONE_DAY_IN_MINUTE);