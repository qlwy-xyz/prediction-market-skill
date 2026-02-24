# QLWY Prediction Market Skill

Agent skill for integrating with QLWY's permissionless binary prediction markets.

## Install

```bash
npx skills add qlwy/prediction-market-skill
```

## What's Included

| File | Description |
|------|-------------|
| `SKILL.md` | Machine-readable skill definition for AI agents |
| `references/QLWYPredictionMarket.abi.json` | Prediction market contract ABI |
| `references/QLWYPredictionArbitration.abi.json` | Arbitration contract ABI |
| `examples/query-markets.ts` | Query markets via REST API (read-only) |
| `examples/create-market.ts` | Full market creation flow (API + on-chain) |
| `examples/trade.ts` | Buy and sell shares |
| `examples/settle-and-claim.ts` | Settle markets and claim winnings |

## Quick Start

```bash
# Query markets (no wallet needed)
npx tsx examples/query-markets.ts

# Buy 10 YES shares on market #1
PRIVATE_KEY=0x... npx tsx examples/trade.ts buy 1 YES 10

# Create a new market
PRIVATE_KEY=0x... npx tsx examples/create-market.ts "ETH will reach $5000 by June 2026"
```

## Deployed Contracts (BSC Mainnet)

| Contract | Address |
|----------|---------|
| QLWYPredictionMarket | `0x06e7D3035650749C846978B732b8dd7a3b48bE75` |
| QLWYPredictionArbitration | `0x68402589585D20fF9756598A7Eb3b4A000853803` |
| USD1 Stablecoin | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` |

## License

MIT

