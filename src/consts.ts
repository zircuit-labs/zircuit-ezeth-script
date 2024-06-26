import { EthChainId } from "@sentio/sdk/eth";

export const CONFIG = {
  BLOCKCHAIN: EthChainId.ETHEREUM,
};

export const MISC_CONSTS = {
  ONE_E18: BigInt("1000000000000000000"),
  ONE_DAY_IN_MINUTE: 60 * 24,
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  MULTICALL_BATCH: 256,
  EZETH_POINT_RATE: BigInt("1004450000000000000"),
};

export const PENDLE_POOL_ADDRESSES = {
  // retrieved from Pendle pool contract readTokens()
  SY: "0x7a493be5c2ce014cd049bf178a1ac0db1b434744",
  // retrieved from Pendle pool contract readTokens()
  YT: "0x87baF4B42c075Db7eb1932A0a49A5465e9a5Ce9f",
  // using new pool contract
  LP: "0xEe6BdFAc6767eFEf0879B924feA12a3437d281A2",
  // the block which the new contract is deployed
  START_BLOCK: 20158641,
  TREASURY: "0x8270400d528c34e1596ef367eedec99080a1b592",
  EQB_STAKING: "0x787fcbac35c8dbe2ed4c5ef92b0e82b4c63c2371",
  PENPIE_RECEIPT_TOKEN: "0x73f8f505245870fd9070c204fe74835dd9c6ac28",
  // STAKEDAO_RECEIPT_TOKEN: "0xdd9df6a77b4a4a07875f55ce5cb6b933e52cb30a",
  MULTICALL: "0xca11bde05977b3631167028862be2a173976ca11",
  LIQUID_LOCKERS: [
    {
      // Penpie
      address: "0x6e799758cee75dae3d84e09d40dc416ecf713652",
      receiptToken: "0x73f8f505245870fd9070c204fe74835dd9c6ac28",
    },
    {
      // EQB
      address: "0x64627901dadb46ed7f275fd4fc87d086cff1e6e3",
      receiptToken: "0x787fcbac35c8dbe2ed4c5ef92b0e82b4c63c2371",
    },
    // {   // STAKEDAO
    //     address: '0xd8fa8dc5adec503acc5e026a98f32ca5c1fa289a',
    //     receiptToken: '0xdd9df6a77b4a4a07875f55ce5cb6b933e52cb30a',
    // }
  ],
};

export const V1_END_TIMESTAMP = 1719446399n; // 2024-06-26 23:59:59 UTC

export const MULTIPLIERS = {
  campaign: {
    startTimestamp: 1719187200n, // 2024-06-24 00:00:00 UTC
    endTimestamp: 1720655999n, // 2024-07-10 23:59:59 UTC
    multiplier: 200n,
  },
  multiplier: 150n,
  baseFactor: 100n,
  expiry: 1724284800n,
};
