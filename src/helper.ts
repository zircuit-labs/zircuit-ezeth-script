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

// @TODO: to modify this when liquid lockers launch
export function isLiquidLockerAddress(addr: string) {
    addr = addr.toLowerCase();
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

// returns all addresses in the storage
export async function getAllLPAddresses(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const addresses = (await ctx.store.list(AccountSnapshotLP))
        .map((snapshot) => snapshot.id.toString().toLowerCase().slice(0, -2));
    return [...new Set(addresses)];
}

export async function getAllYTSnapshots(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const snapshots = await ctx.store.list(AccountSnapshotYT)
    const addresses = snapshots.map((snapshot) => snapshot.id.toString().toLowerCase().slice(0, -2));
    return {
        snapshots,
        addresses
    }
}

export async function getAllSYSnapshots(ctx : EthContext) {
    // removes the suffix comprised of two letters coming from POINT_SOURCE
    const snapshots = await ctx.store.list(AccountSnapshotSY)
    const addresses = snapshots.map((snapshot) => snapshot.id.toString().toLowerCase().slice(0, -2));
    return {
        snapshots,
        addresses
    }
}