import { LogLevel } from "@sentio/sdk";
import { EthContext } from "@sentio/sdk/eth";
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES } from "../consts.js";
import { EVENT_POINT_INCREASE, POINT_SOURCE, POINT_SOURCE_YT } from "../types.js";

/**
 *
 * @param amountEzEthHolding amount of Ez Eth user holds during the period
 * @param holdingPeriod amount of time user holds the Ez Eth
 * @returns Zircuit point
 *
 * @dev to be reviewed by Zircuit team
 */
function calcPointsFromHolding(
  amountEzEthHolding: bigint,
  holdingPeriod: bigint
): bigint {
  // * ezETH exchangeRate
  return amountEzEthHolding * MISC_CONSTS.EZETH_POINT_RATE / MISC_CONSTS.ONE_E18 * holdingPeriod / 3600n;
}

export function updatePoints(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingPeriod: bigint,
  updatedAt: number
) {
  const zPoint = calcPointsFromHolding(
    amountEzEthHolding,
    holdingPeriod
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

function increasePoint(
  ctx: EthContext,
  label: POINT_SOURCE,
  account: string,
  amountEzEthHolding: bigint,
  holdingPeriod: bigint,
  zPoint: bigint,
  updatedAt: number
) {
  ctx.eventLogger.emit(EVENT_POINT_INCREASE, {
    label,
    account: account.toLowerCase(),
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
