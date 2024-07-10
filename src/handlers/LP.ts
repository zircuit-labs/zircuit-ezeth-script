
import { AccountSnapshot, RateSnapshot } from "../schema/schema.ts";
import { updatePoints } from "../points/point-manager.js";
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES } from "../consts.js";
import { EthContext } from "@sentio/sdk/eth";
import { LogLevel } from "@sentio/sdk";

import {
  PendleMarketContext,
  RedeemRewardsEvent,
  SwapEvent,
  TransferEvent,
  getPendleMarketContractOnContext,
} from "../types/eth/pendlemarket.js";

import {
  getUnixTimestamp,
  isLiquidLockerAddress,
  isSentioInternalError,
  getAllAddresses,
} from "../helper.js";

import {
  readAllUserActiveBalances,
  readAllUserERC20Balances,
} from "../multicall.js";

import { 
  EVENT_USER_SHARE, 
  POINT_SOURCE_LP,
  EVENT_POINT_INCREASE,
  POINT_SOURCE,
  POINT_SOURCE_YT,
} from "../types.js";

/**
 * @dev 1 LP = (X PT + Y SY) where X and Y are defined by market conditions
 * So same as Balancer LPT, we need to update all positions on every swap
 *
 * Users can further deposit LP to liquid lockers to get back receipt tokens.
 * This should also be handled here.
 *
 * Currently for all liquid lockers, 1 receipt token = 1 LP
 */

export async function handleLPTransfer(
  evt: TransferEvent,
  ctx: PendleMarketContext
) {
  await updateLPtoSYRates(ctx);
  await processAffectedAccounts(ctx, [
    evt.args.from,
    evt.args.to,
  ]);
}

export async function handleMarketRedeemReward(
  evt: RedeemRewardsEvent,
  ctx: PendleMarketContext
) {
  await updateLPtoSYRates(ctx);
}

export async function handleMarketSwap(_: SwapEvent, ctx: PendleMarketContext) {
  await updateLPtoSYRates(ctx);
}

/**
 * @dev This function calculates the cumulative rate to convert LP into equivilent SY
 * This function calculates three different rates:
 * 1. the rate for liquid lockers - penpie
 * 2. TODO: the rate for liquid lockers - EQB 
 * 3. TODO: the rate for the Zircuit points (time)
 * TODO: and update the three different rates + timestamp to data store
 */
export async function updateLPtoSYRates(ctx: EthContext) {
  let rateSnapshot = await ctx.store.get(RateSnapshot, "rates");
  const timestamp = getUnixTimestamp(ctx.timestamp);

  if (!rateSnapshot) {
    rateSnapshot = new RateSnapshot({
      id: "rates",
      lastUpdatedAt: BigInt(timestamp),
      cummulativeRate: "0",
    });
  }

  const marketContract = getPendleMarketContractOnContext(
    ctx,
    PENDLE_POOL_ADDRESSES.LP
  );

  const [totalShare, state] = await Promise.all([
    marketContract.totalActiveSupply(),
    marketContract.readState(marketContract.address),
  ]);

  // the points multilier needs to be handled here
  // TODO: implement cutoff here
  
  const cummulativeRate = BigInt(rateSnapshot.cummulativeRate) +
    ((BigInt(timestamp) - rateSnapshot?.lastUpdatedAt) * state.totalSy * 2n  /
    totalShare)

  rateSnapshot.cummulativeRate = cummulativeRate.toString();// TODO: can we use BigInt instead?

  rateSnapshot.lastUpdatedAt = BigInt(timestamp); 

  await ctx.store.upsert(rateSnapshot);
}

export async function processAffectedAccounts(
  ctx: EthContext,
  addressesToAdd: string[] = []
) {
  let rateSnapshot = await ctx.store.get(RateSnapshot, "rates");
  const adderssToProcess: string[] = [];
  const timestamp = getUnixTimestamp(ctx.timestamp);

  for (let address of addressesToAdd) {
    address = address.toLowerCase();
    if (
      !adderssToProcess.includes(address) &&
      !isLiquidLockerAddress(address)
    ) {
      adderssToProcess.push(address.toLowerCase());
    }
  }

  const usersShares = await readAllUserActiveBalances(ctx, adderssToProcess);

  const updateAccountPromises = [];

  for (let i = 0; i < adderssToProcess.length; i++) {

    const accountId = adderssToProcess[i] + POINT_SOURCE_LP;
    let accountSnapshot = await ctx.store.get(AccountSnapshot, accountId);

    if (!accountSnapshot)
      accountSnapshot = new AccountSnapshot({
        id: account,
        lastUpdatedAt: BigInt(0),
        lastImpliedHolding: "0",
        lastShare: "0",
        lastCumulativeRate: "0",
      });

    // timestamp can be rateSnapshot.lastUpdatedAt since update rates has to always be called first 
    const cumulativeRateDiff = 
      BigInt(accountSnapshot.lastShare) * 
      (BigInt(rateSnapshot.cummulativeRate) - BigInt(accountSnapshot.lastCumulativeRate))

    const timeDiff = BigInt(timestamp) - BigInt(accountSnapshot.lastUpdatedAt);

    accountSnapshot.lastShare = usersShares[i].toString();
    accountSnapshot.lastUpdatedAt = timestamp.toString();

    const accruedPoints = 
      cumulativeRateDiff * MISC_CONSTS.EZETH_POINT_RATE /
      ( MISC_CONSTS.ONE_E18 * 3600n );

    updateAccountPromises.push(
      updateAccount(ctx, accountId, , cumulativeRateDiff, timeDiff, timestamp)
    );

    increasePoint(
      ctx,
      POINT_SOURCE_LP,
      account,
      accounttId,
      accountSnapshot,
      accruedPoints,
      timeDiff,
      timestamp
    )
  }
  await Promise.all(updateAccountPromises);  
}

async function increasePoint(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  accountSnapshot: AccountSnapshot,
  accruedPoints: biging,
  timeDiff: Number,
  updatedAt: Number,
) {

  ctx.eventLogger.emit(EVENT_USER_SHARE, {
    label,
    account: account,
    share: "0",
  });

  ctx.eventLogger.emit(EVENT_POINT_INCREASE, {
    label,
    account: account.toLowerCase(),
    amountEzEthHolding: 0,
    holdingPeriod: timeDiff,
    zPoint: accruedPoints.scaleDown(18),
    updatedAt,
    severity: LogLevel.INFO,
  });

  await ctx.store.upsert(accountSnapshot); 
}
