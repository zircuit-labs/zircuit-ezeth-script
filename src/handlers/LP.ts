import { AccountSnapshotLP, RateSnapshotLP } from "../schema/schema.ts";
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

const STORAGE_KEY = `RATES:${POINT_SOURCE_LP}`;

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
  await processAccounts(ctx, [evt.args.from, evt.args.to]);
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
 * and update the three different rates + timestamp to data store
 */
export async function updateLPtoSYRates(ctx: EthContext) {
  let rateSnapshot = await ctx.store.get(RateSnapshotLP, STORAGE_KEY);
  let timestamp = BigInt(getUnixTimestamp(ctx.timestamp));

  // cuttoff time
  if (timestamp > MISC_CONSTS.CUTOFF_TIME) timestamp = MISC_CONSTS.CUTOFF_TIME;

  if (!rateSnapshot) {
    rateSnapshot = new RateSnapshotLP({
      id: STORAGE_KEY,
      lastUpdatedAt: BigInt(timestamp),
      cummulativeRate: BigInt(0),
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

  for (const liquidLocker of PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS) {
    const liquidLockerBal = await marketContract.balanceOf(
      liquidLocker.address
    );
    if (liquidLockerBal == 0n) continue;

    const liquidLockerActiveBal = await marketContract.activeBalance(
      liquidLocker.address
    );

    if (liquidLocker.name === "PenPie") {
      rateSnapshot.cummulativeRatePenPie +=
        ((((BigInt(timestamp) - rateSnapshot?.lastUpdatedAt) *
          liquidLockerActiveBal) /
          liquidLockerBal) *
          state.totalSy) /
        totalShare;
    } else if (liquidLocker.name === "EQB") {
      rateSnapshot.cummulativeRateEQB +=
        ((((BigInt(timestamp) - rateSnapshot?.lastUpdatedAt) *
          liquidLockerActiveBal) /
          liquidLockerBal) *
          state.totalSy) /
        totalShare;
    }
  }

  // the points multilier needs to be handled here

  const cummulativeRate =
    rateSnapshot.cummulativeRate +
    ((timestamp - rateSnapshot?.lastUpdatedAt) * state.totalSy * 2n) /
      totalShare;

  rateSnapshot.cummulativeRate = cummulativeRate;
  rateSnapshot.lastUpdatedAt = timestamp;

  await ctx.store.upsert(rateSnapshot);
}

export async function processAccounts(
  ctx: EthContext,
  addressesToAdd: string[] = []
) {
  let timestamp = BigInt(getUnixTimestamp(ctx.timestamp));
  // cuttoff time
  if (timestamp > MISC_CONSTS.CUTOFF_TIME) timestamp = MISC_CONSTS.CUTOFF_TIME;

  let rateSnapshot = await ctx.store.get(RateSnapshotLP, STORAGE_KEY);

  if (!rateSnapshot) {
    rateSnapshot = new RateSnapshotLP({
      id: STORAGE_KEY,
      lastUpdatedAt: timestamp,
      cummulativeRate: BigInt(0),
    });
  }

  const adderssToProcess: string[] = [];

  for (let address of addressesToAdd) {
    address = address.toLowerCase();
    if (
      !adderssToProcess.includes(address) &&
      !isLiquidLockerAddress(address)
    ) {
      adderssToProcess.push(address.toLowerCase());
    }
  }

  const [usersShares, usersSharesPenPie, usersSharesEQB] = await Promise.all([
    readAllUserActiveBalances(ctx, adderssToProcess),
    readAllUserERC20Balances(
      ctx,
      adderssToProcess,
      PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[0].receiptToken
    ),
    readAllUserERC20Balances(
      ctx,
      adderssToProcess,
      PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[1].receiptToken
    ),
  ]);

  const updateAccountPromises = [];

  for (let i = 0; i < adderssToProcess.length; i++) {
    const accountId = adderssToProcess[i] + POINT_SOURCE_LP;
    let accountSnapshot = await ctx.store.get(AccountSnapshotLP, accountId);

    if (!accountSnapshot)
      accountSnapshot = new AccountSnapshotLP({
        id: accountId,
        lastUpdatedAt: BigInt(0),
        lastShare: BigInt(0),
        lastCumulativeRate: BigInt(0),
        lastSharePenPie: BigInt(0),
        lastCummulativeRatePenPie: BigInt(0),
        lastShareEQB: BigInt(0),
        lastCummulativeRateEQB: BigInt(0),
      });

    // timestamp can be rateSnapshot.lastUpdatedAt since update rates has to always be called first
    const cumulativeRateDiff =
      accountSnapshot.lastShare *
      (rateSnapshot.cummulativeRate -
        accountSnapshot.lastCumulativeRate +
        accountSnapshot.lastSharePenPie *
          (rateSnapshot.cummulativeRatePenPie -
            accountSnapshot.lastCummulativeRatePenPie) +
        accountSnapshot.lastShareEQB *
          (rateSnapshot.cummulativeRateEQB -
            accountSnapshot.lastCummulativeRateEQB));

    const timeDiff = timestamp - accountSnapshot.lastUpdatedAt;

    accountSnapshot.lastShare = usersShares[i];
    accountSnapshot.lastUpdatedAt = timestamp;
    accountSnapshot.lastCumulativeRate = rateSnapshot.cummulativeRate;
    accountSnapshot.lastCummulativeRateEQB = rateSnapshot.cummulativeRateEQB;
    accountSnapshot.lastCummulativeRatePenPie =
      rateSnapshot.cummulativeRatePenPie;
    accountSnapshot.lastSharePenPie = usersSharesPenPie[i];
    accountSnapshot.lastShareEQB = usersSharesEQB[i];

    const accruedPoints =
      (cumulativeRateDiff * MISC_CONSTS.EZETH_POINT_RATE) /
      (MISC_CONSTS.ONE_E18 * 3600n);

    updateAccountPromises.push(
      increasePoint(
        ctx,
        POINT_SOURCE_LP,
        adderssToProcess[i],
        accountSnapshot,
        accruedPoints,
        timeDiff,
        BigInt(timestamp)
      )
    );
  }
  await Promise.all(updateAccountPromises);
}

async function increasePoint(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  accountSnapshot: AccountSnapshotLP,
  accruedPoints: bigint,
  timeDiff: bigint,
  updatedAt: bigint
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

export async function processAllLPAccounts(ctx: EthContext) {
  await updateLPtoSYRates(ctx);
  const allAddresses = await getAllAddresses(ctx);
  await processAccounts(ctx, allAddresses);
}
