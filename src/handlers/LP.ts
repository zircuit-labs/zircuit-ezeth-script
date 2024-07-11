
import { updatePoints } from "../points/point-manager.js";
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES } from "../consts.js";
import { EthContext } from "@sentio/sdk/eth";
import { LogLevel } from "@sentio/sdk";

import { 
  AccountSnapshotLP,
  RateSnapshotLP,
  RerunSnapshot,
} from "../schema/schema.ts";

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
  getAllLPAddresses,
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

const RATE_KEY = `RATES:${POINT_SOURCE_LP}`;
const RERUN_KEY = `RERUN:${POINT_SOURCE_LP}`;

/**
 * @dev This function calculates the cumulative rate to convert LP into equivilent SY
 * This function calculates three different rates:
 * 1. the rate for liquid lockers - penpie
 * 2. TODO: the rate for liquid lockers - EQB
 * 3. TODO: the rate for the Zircuit points (time)
 * and update the three different rates + timestamp to data store
 */
export async function updateLPtoSYRates(ctx: EthContext) {
  let rateSnapshot = await ctx.store.get(RateSnapshotLP, RATE_KEY);
  let timestamp = BigInt(getUnixTimestamp(ctx.timestamp));

  // cuttoff time
  if (timestamp > MISC_CONSTS.CUTOFF_TIME) timestamp = MISC_CONSTS.CUTOFF_TIME;

  if (!rateSnapshot) {
    rateSnapshot = new RateSnapshotLP({
      id: RATE_KEY,
      lastUpdatedAt: timestamp,
      cummulativeRate: BigInt(0),
      cummulativeRatePenPie: BigInt(0),
      cummulativeRateEQB: BigInt(0),
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
        (timestamp - rateSnapshot.lastUpdatedAt) * 
        (liquidLockerActiveBal * state.totalSy * 
          MISC_CONSTS.PENDLE_DEFAULT_MULTIPLIER * 
          MISC_CONSTS.EZETH_POINT_RATE) / 
        (liquidLockerBal * totalShare );

    } else if (liquidLocker.name === "EQB") {
      rateSnapshot.cummulativeRateEQB +=
        (timestamp - rateSnapshot.lastUpdatedAt) * 
        (liquidLockerActiveBal * state.totalSy * 
          MISC_CONSTS.PENDLE_DEFAULT_MULTIPLIER * 
          MISC_CONSTS.EZETH_POINT_RATE) / 
        (liquidLockerBal * totalShare );
    }
  }

  // the points multiplier needs to be handled here

  const cummulativeRate =
    rateSnapshot.cummulativeRate +
    ((timestamp - rateSnapshot?.lastUpdatedAt) * 
      state.totalSy *
      MISC_CONSTS.PENDLE_DEFAULT_MULTIPLIER *
      MISC_CONSTS.EZETH_POINT_RATE) /
    totalShare;

  rateSnapshot.cummulativeRate = cummulativeRate;
  rateSnapshot.lastUpdatedAt = timestamp;

  await ctx.store.upsert(rateSnapshot);
}

export async function processLPAccounts(
  ctx: EthContext,
  addressesToAdd: string[] = []
) {
  let timestamp = BigInt(getUnixTimestamp(ctx.timestamp));
  let rerunSnapshot = await ctx.store.get(RerunSnapshot, RERUN_KEY);
  let rateSnapshot = await ctx.store.get(RateSnapshotLP, RATE_KEY);

  if(!rerunSnapshot)
    rerunSnapshot = new RerunSnapshot({
      id: RERUN_KEY,
      ended: false,
      updatedAt: timestamp,
    })

  if(rerunSnapshot.ended) return;

  if (!rateSnapshot) {
    rateSnapshot = new RateSnapshotLP({
      id: RATE_KEY,
      lastUpdatedAt: timestamp,
      cummulativeRate: BigInt(0),
      cummulativeRatePenPie: BigInt(0),
      cummulativeRateEQB: BigInt(0),
    });
  }
  
  const addressesSet: Set<string> = new Set<string>();

  // cuttoff time
  if (timestamp > MISC_CONSTS.CUTOFF_TIME) {
    timestamp = MISC_CONSTS.CUTOFF_TIME;
    if(!rerunSnapshot.ended) {
      rerunSnapshot.ended = true;
      const allAddresses = await getAllLPAddresses(ctx);
      for (let address of allAddresses)
        addressesSet.add(address);
    }
  }

  for (let address of addressesToAdd)
    addressesSet.add(address);

  addressesSet.delete(MISC_CONSTS.ZERO_ADDRESS.toLowerCase());
  addressesSet.delete(PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[0].address.toLowerCase());
  addressesSet.delete(PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[1].address.toLowerCase());

  const addressesToProcess: string[] = [...addressesSet];

  let usersSharesPenPie: bigint[] = [];
  let usersSharesEQB: bigint[] = [];

  const usersShares =  await readAllUserActiveBalances(ctx, addressesToProcess)
  try {
    usersSharesPenPie = await readAllUserERC20Balances(
      ctx,
      addressesToProcess,
      PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[0].receiptToken
    )
  } catch(err) {
    if (isSentioInternalError(err)) {
      throw err;
    } 
  }

  try {
    usersSharesEQB = await readAllUserERC20Balances(
      ctx,
      addressesToProcess,
      PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS[1].receiptToken
    )
  } catch(err) {
    if (isSentioInternalError(err)) {
      throw err;
    }
  }

  const updateAccountPromises = [];

  for (let i = 0; i < addressesToProcess.length; i++) {
    const accountId = addressesToProcess[i] + POINT_SOURCE_LP;
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
        (rateSnapshot.cummulativeRate - accountSnapshot.lastCumulativeRate) +
      accountSnapshot.lastSharePenPie *
        (rateSnapshot.cummulativeRatePenPie - accountSnapshot.lastCummulativeRatePenPie) +
      accountSnapshot.lastShareEQB *
        (rateSnapshot.cummulativeRateEQB - accountSnapshot.lastCummulativeRateEQB);

    const timeDiff = timestamp - accountSnapshot.lastUpdatedAt;

    accountSnapshot.lastShare = usersShares[i];
    accountSnapshot.lastUpdatedAt = timestamp;
    accountSnapshot.lastCumulativeRate = rateSnapshot.cummulativeRate;
    accountSnapshot.lastCummulativeRateEQB = rateSnapshot.cummulativeRateEQB;
    accountSnapshot.lastCummulativeRatePenPie = rateSnapshot.cummulativeRatePenPie;
    accountSnapshot.lastSharePenPie = usersSharesPenPie.length > 0 ? usersSharesPenPie[i] : BigInt(0);
    accountSnapshot.lastShareEQB = usersSharesEQB.length > 0 ? usersSharesEQB[i] : BigInt(0);

    const accruedPoints =
      cumulativeRateDiff /
      (MISC_CONSTS.ONE_E18 * 3600n);

    updateAccountPromises.push(
      increasePoint(
        ctx,
        POINT_SOURCE_LP,
        addressesToProcess[i],
        accountSnapshot,
        accruedPoints,
        timeDiff,
        timestamp,
        cumulativeRateDiff
      )
    );
  }
  await Promise.all(updateAccountPromises);
  rerunSnapshot.updatedAt = timestamp;
  await ctx.store.upsert(rerunSnapshot);
}

async function increasePoint(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  accountSnapshot: AccountSnapshotLP,
  accruedPoints: bigint,
  timeDiff: bigint,
  updatedAt: bigint,
  cumulativeRateDiff: bigint,
) {
  ctx.eventLogger.emit(EVENT_USER_SHARE, {
    label,
    account,
    share: cumulativeRateDiff,
  });

  ctx.eventLogger.emit(EVENT_POINT_INCREASE, {
    label,
    account: account,
    amountEzEthHolding: cumulativeRateDiff,
    holdingPeriod: timeDiff,
    zPoint: accruedPoints.scaleDown(18),
    updatedAt,
    severity: LogLevel.INFO,
  });
  await ctx.store.upsert(accountSnapshot);
}