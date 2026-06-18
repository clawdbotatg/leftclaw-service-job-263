# The Proving Grounds

Permissioned-by-burn onchain registry for LeftClaw-verified builds on Base. Wallets earn soulbound stamps for using registered apps, claim CLAWD bounties for early adoption, leave proof-of-use-gated reviews, and tip reviewers for quality feedback.

## Live App

https://bafybeifkagi6isokrorqc4x43sxxkxm66prkykpaxtbzbhqhlf2pzfnqpy.ipfs.community.bgipfs.com/

## Contracts on Base

| Contract | Address | Basescan |
|----------|---------|---------|
| ProvingGroundsRegistry | 0x5c218Ca6fFE511e6200a4AaE63407c7b25c010a0 | https://basescan.org/address/0x5c218Ca6fFE511e6200a4AaE63407c7b25c010a0 |
| ProvingStamp (ERC721) | 0x843A475c1353Cff17190f7d8aE226f5407DadaC7 | https://basescan.org/address/0x843A475c1353Cff17190f7d8aE226f5407DadaC7 |
| ProvingFeedback | 0xF08c56f44C55eA8D4603491235ab296c975024Fc | https://basescan.org/address/0xF08c56f44C55eA8D4603491235ab296c975024Fc |
| CLAWD Token | 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07 | https://basescan.org/address/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07 |

All contracts verified on Basescan. CLAWD decimals: 18.

## Client Actions Required

Call acceptOwnership() on each contract from the client wallet (0x34aA3F359A9D614239015126635CE7732c18fDF3):

  cast send 0x5c218Ca6fFE511e6200a4AaE63407c7b25c010a0 "acceptOwnership()" --private-key $PK --rpc-url $RPC
  cast send 0x843A475c1353Cff17190f7d8aE226f5407DadaC7 "acceptOwnership()" --private-key $PK --rpc-url $RPC
  cast send 0xF08c56f44C55eA8D4603491235ab296c975024Fc "acceptOwnership()" --private-key $PK --rpc-url $RPC

Strongly recommended: move admin to a multisig (Safe) before any real CLAWD flows through this.

## Pages

- / - Registry feed
- /register - Register a new build (CLAWD burn + bounty pool)
- /build?id=N - Build detail: claim stamp, reviews, tips
- /wallet - My stamps and CLAWD balance

## Local Development

  yarn install
  yarn fork --network base
  yarn deploy
  yarn start

## Stack

- Contracts: Solidity 0.8.20, Foundry, OpenZeppelin v5
- Frontend: Next.js 16, Scaffold-ETH 2, RainbowKit, wagmi, viem
- Deployment: IPFS via bgipfs, Base mainnet
- Token: CLAWD ERC20 on Base
