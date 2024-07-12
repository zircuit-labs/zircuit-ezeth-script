import { LogLevel } from "@sentio/sdk";
import { EthContext } from "@sentio/sdk/eth";
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES } from "../consts.js";
import { AccountSnapshotYT, AccountSnapshotSY } from "../schema/schema.ts";

import {
  EVENT_POINT_INCREASE,
  POINT_SOURCE,
  POINT_SOURCE_YT,
} from "../types.js";

export async function updatePointsYT(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingStartTimestamp: bigint,
  holdingEndTimestamp: bigint,
  updatedAt: bigint,
  accountSnapshot: AccountSnapshotYT
) {
  await ctx.store.upsert(accountSnapshot);
  updatePoints(
    ctx,
    label,
    account,
    amountEzEthHolding,
    holdingStartTimestamp,
    holdingEndTimestamp,
    updatedAt
  );
}

export async function updatePointsSY(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingStartTimestamp: bigint,
  holdingEndTimestamp: bigint,
  updatedAt: bigint,
  accountSnapshot: AccountSnapshotSY
) {
  await ctx.store.upsert(accountSnapshot);
  updatePoints(
    ctx,
    label,
    account,
    amountEzEthHolding,
    holdingStartTimestamp,
    holdingEndTimestamp,
    updatedAt
  );
}

function updatePoints(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingStartTimestamp: bigint,
  holdingEndTimestamp: bigint,
  updatedAt: bigint,
) {
  const holdingPeriod = holdingEndTimestamp - holdingStartTimestamp;

  const zPoint = calcPointsFromHolding(
    amountEzEthHolding,
    holdingStartTimestamp,
    holdingEndTimestamp
  );

  if (label == POINT_SOURCE_YT) {
    const zPointTreasuryFee = calcTreasuryFee(zPoint);
    increasePoint(
      ctx,
      label,
      account,
      amountEzEthHolding,
      holdingPeriod,
      zPoint - zPointTreasuryFee,
      updatedAt
    );
    increasePoint(
      ctx,
      label,
      PENDLE_POOL_ADDRESSES.TREASURY,
      0n,
      holdingPeriod,
      zPointTreasuryFee,
      updatedAt
    );
  } else {
    increasePoint(
      ctx,
      label,
      account,
      amountEzEthHolding,
      holdingPeriod,
      zPoint,
      updatedAt
    );
  }
}

function calcPointsFromHolding(
  amountEzEthHolding: bigint,
  holdingStartTimestamp: bigint,
  holdingEndTimestamp: bigint
): bigint {
  const cuttoffTimestamp = MISC_CONSTS.CUTOFF_TIME;
  if (holdingStartTimestamp >= cuttoffTimestamp) return BigInt(0);
  if (holdingEndTimestamp >= cuttoffTimestamp)
    holdingEndTimestamp = cuttoffTimestamp;

  const holdingPeriod = holdingEndTimestamp - holdingStartTimestamp;

  return amountEzEthHolding * 
    MISC_CONSTS.EZETH_POINT_RATE * 
    holdingPeriod * MISC_CONSTS.PENDLE_DEFAULT_MULTIPLIER /
    (MISC_CONSTS.ONE_E18 * 3600n);
}

function increasePoint(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingPeriod: bigint,
  zPoint: bigint,
  updatedAt: bigint
) {
  ctx.eventLogger.emit(EVENT_POINT_INCREASE, {
    label,
    account,
    amountEzEthHolding: amountEzEthHolding.scaleDown(18),
    holdingPeriod,
    zPoint: zPoint.scaleDown(18),
    updatedAt,
    severity: LogLevel.INFO,
  });
}

function calcTreasuryFee(amount: bigint): bigint {
  return (amount * 3n) / 100n;
}
