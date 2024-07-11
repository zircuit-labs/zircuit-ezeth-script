
import { updatePoints } from "../points/point-manager.js";
import { LogLevel } from "@sentio/sdk";
import { EthContext } from "@sentio/sdk/eth";

import { 
  AccountSnapshotYT,
  RerunSnapshot,
} from "../schema/schema.ts";

import {
  PendleYieldTokenContext,
  RedeemInterestEvent,
  TransferEvent,
} from "../types/eth/pendleyieldtoken.js";

import {
  getUnixTimestamp,
  isPendleAddress,
  getAllYTAddresses,
} from "../helper.js";

import {
  EVENT_USER_SHARE,
  POINT_SOURCE_YT,
} from "../types.js";

import { 
  PENDLE_POOL_ADDRESSES,
  MISC_CONSTS 
} from "../consts.js";

import { readAllUserERC20Balances, readAllYTPositions } from "../multicall.js";

const RERUN_KEY = `RERUN:${POINT_SOURCE_YT}`;

export async function processYTAccounts(
  ctx: PendleYieldTokenContext,
  addressesToAdd: string[] = [],
) {
  let timestamp = BigInt(getUnixTimestamp(ctx.timestamp));
  let rerunSnapshot = await ctx.store.get(RerunSnapshot, RERUN_KEY);
  if(!rerunSnapshot)
    rerunSnapshot = new RerunSnapshot({
      id: RERUN_KEY,
      ended: false,
      updatedAt: timestamp,
    })

  if(rerunSnapshot.ended) return;

  const addressesSet: Set<string> = new Set<string>();

  if (timestamp > MISC_CONSTS.CUTOFF_TIME) {
    timestamp = MISC_CONSTS.CUTOFF_TIME;
    if(!rerunSnapshot.ended) {
      rerunSnapshot.ended = true;
      const previousAddresses = await getAllYTAddresses(ctx);
      for (let address of previousAddresses)
        addressesSet.add(address);
    }
  }

  if(timestamp > (rerunSnapshot.updatedAt + MISC_CONSTS.FULL_EXECUTION_INTERVAL)) {
    const previousAddresses = await getAllYTAddresses(ctx);
    for (let address of previousAddresses)
      addressesSet.add(address);
    rerunSnapshot.updatedAt = timestamp;
  }

  for (let address of addressesToAdd)
    addressesSet.add(address);

  addressesSet.delete(PENDLE_POOL_ADDRESSES.SY.toLowerCase());
  addressesSet.delete(PENDLE_POOL_ADDRESSES.YT.toLowerCase());
  addressesSet.delete(PENDLE_POOL_ADDRESSES.LP.toLowerCase());

  const addressesToProcess: string[] = [...addressesSet];
  
  const allYTBalances = await readAllUserERC20Balances(
    ctx,
    addressesToProcess,
    ctx.contract.address
  );

  const allYTPositions = await readAllYTPositions(ctx, addressesToProcess);

  for (let i = 0; i < addressesToProcess.length; i++) {
    const address = addressesToProcess[i];
    const balance = allYTBalances[i];
    const interestData = allYTPositions[i];

    const accountId = address + POINT_SOURCE_YT;
    let accountSnapshot = await ctx.store.get(AccountSnapshotYT, accountId);

    if(!accountSnapshot)
      accountSnapshot = new AccountSnapshotYT({
        id: accountId,
        lastImpliedHolding: BigInt(0),
        lastUpdatedAt: timestamp,
      })

    const holdingPeriod = timestamp - accountSnapshot.lastUpdatedAt;

    updatePoints(
      ctx,
      POINT_SOURCE_YT,
      address,
      accountSnapshot.lastImpliedHolding,
      accountSnapshot.lastUpdatedAt,
      timestamp,
      timestamp,
    )

    if (interestData.lastPYIndex == 0n) {
      accountSnapshot.lastUpdatedAt = timestamp;
      await ctx.store.upsert(accountSnapshot);
      continue;
    }

    const lastImpliedHolding = (balance * MISC_CONSTS.ONE_E18) / interestData.lastPYIndex +
      interestData.accruedInterest;

    accountSnapshot.lastUpdatedAt = timestamp;
    accountSnapshot.lastImpliedHolding = lastImpliedHolding;

    ctx.eventLogger.emit(EVENT_USER_SHARE, {
      label: POINT_SOURCE_YT,
      account: address,
      share: lastImpliedHolding,
    });

    await ctx.store.upsert(accountSnapshot);
  }
  await ctx.store.upsert(rerunSnapshot);
}