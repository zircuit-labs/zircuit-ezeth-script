
import { TransferEvent } from "../types/eth/pendlemarket.js";
import { ERC20Context } from "@sentio/sdk/eth/builtin/erc20";
import { updatePoints } from "../points/point-manager.js";
import { readAllUserERC20Balances } from "../multicall.js";

import {
  EVENT_USER_SHARE,
  POINT_SOURCE_SY
} from "../types.js";

import {
  getUnixTimestamp,
  isPendleAddress,
  getAllSYAddresses,
} from "../helper.js";

import {
  AccountSnapshotSY,
  RerunSnapshot,
} from "../schema/schema.ts";

import { 
  PENDLE_POOL_ADDRESSES,
  MISC_CONSTS 
} from "../consts.js";

const RERUN_KEY = `RERUN:${POINT_SOURCE_SY}`;

/**
 * @dev 1 SY EZETH = 1 EZETH
 */

export async function processSYAccounts(
  ctx: ERC20Context,
  addressesToAdd: string[] = []
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
      const previousAddresses = await getAllSYAddresses(ctx);
      for (let address of previousAddresses)
        addressesSet.add(address);
    }
  }

  if(timestamp > (rerunSnapshot.updatedAt + MISC_CONSTS.FULL_EXECUTION_INTERVAL)) {
    const previousAddresses = await getAllSYAddresses(ctx);
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

  const allSYBalances = await readAllUserERC20Balances(
    ctx,
    addressesToProcess,
    ctx.contract.address,
  );

  for (let i = 0; i < addressesToProcess.length; i++) {
    const address = addressesToProcess[i];
    const balance = allSYBalances[i];
    const accountId = address + POINT_SOURCE_SY;
    let accountSnapshot = await ctx.store.get(AccountSnapshotSY, accountId);

    if(!accountSnapshot)
      accountSnapshot = new AccountSnapshotSY({
        id: accountId,
        lastBalance: BigInt(0),
        lastUpdatedAt: timestamp,
      })

    updatePoints(
      ctx,
      POINT_SOURCE_SY,
      address,
      accountSnapshot.lastBalance,
      accountSnapshot.lastUpdatedAt,
      timestamp,
      timestamp
    );

    
    accountSnapshot.lastUpdatedAt = timestamp;
    accountSnapshot.lastUpdatedAt = balance;

    ctx.eventLogger.emit(EVENT_USER_SHARE, {
      label: POINT_SOURCE_SY,
      address,
      share: balance,
    });

    await ctx.store.upsert(accountSnapshot);
  }
  await ctx.store.upsert(rerunSnapshot);
}
