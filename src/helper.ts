import { MISC_CONSTS, PENDLE_POOL_ADDRESSES } from "./consts.ts";
import { EthContext } from "@sentio/sdk/eth";
import os from 'os';

import { 
    AccountSnapshotSY,
    AccountSnapshotYT,
    AccountSnapshotLP, 
} from "./schema/schema.ts"

export function isPendleOrZeroAddress(addr: string) {
    return addr == PENDLE_POOL_ADDRESSES.SY ||
        addr == PENDLE_POOL_ADDRESSES.YT ||
        addr == PENDLE_POOL_ADDRESSES.LP ||
        addr == MISC_CONSTS.ZERO_ADDRESS;
}

export function isLiquidLockerOrZeroAddress(addr: string) {
    if(addr == MISC_CONSTS.ZERO_ADDRESS) return true;
    return PENDLE_POOL_ADDRESSES.LIQUID_LOCKERS.some((liquidLockerInfo) => liquidLockerInfo.address == addr);
}

export function getUnixTimestamp(date: Date) {
    return Math.floor(date.getTime() / 1000);
}

export function isSentioInternalError(err: any): boolean {
    if (
        err.code === os.constants.errno.ECONNRESET ||
        err.code === os.constants.errno.ECONNREFUSED ||
        err.code === os.constants.errno.ECONNABORTED ||
        err.toString().includes('ECONNREFUSED') ||
        err.toString().includes('ECONNRESET') ||
        err.toString().includes('ECONNABORTED')
    ) {
        return true;
    }
    return false;
}

export async function getAllLPSnapshots(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const snapshots = await ctx.store.list(AccountSnapshotLP)
    const addresses = snapshots.map((snapshot) => snapshot.id.toString());
    return {
        snapshots,
        addresses
    }
}
export async function getAllYTSnapshots(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const snapshots = await ctx.store.list(AccountSnapshotYT)
    const addresses = snapshots.map((snapshot) => snapshot.id.toString());
    return {
        snapshots,
        addresses
    }
}

export async function getAllSYSnapshots(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const snapshots = await ctx.store.list(AccountSnapshotSY)
    const addresses = snapshots.map((snapshot) => snapshot.id.toString());
    return {
        snapshots,
        addresses
    }
}