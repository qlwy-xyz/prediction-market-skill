---
name: prediction-market
description: Integrate QLWY prediction market into applications. Use when user says "prediction market", "create market", "buy shares", "sell shares", "settle market", "market arbitration", "LMSR", "binary outcome", "trading predictions", "claim winnings", or mentions prediction/forecasting markets.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm:*), Bash(npx:*), Bash(bun:*), Bash(curl:*), WebFetch
model: opus
license: MIT
metadata:
  author: qlwy
  version: '1.0.0'
---

# QLWY Prediction Market Integration

Integrate permissionless binary prediction markets with LMSR AMM, creator-initiated settlement, and Mythic NFT arbitration into frontends, backends, and smart contracts.

## Overview

QLWY Prediction Market allows anyone to create binary YES/NO prediction markets on any topic. Markets use the LMSR (Logarithmic Market Scoring Rule) automated market maker for pricing, USD1 stablecoin for trading, and a multi-layer settlement system (creator → dispute → Mythic NFT arbitration).

## Quick Decision Guide

| Building...                        | Use This Method                |
| ---------------------------------- | ------------------------------ |
| Frontend with React/Next.js        | REST API + viem contract calls |
| Backend bot or automation          | REST API + viem contract calls |
| Smart contract composability       | Direct contract integration    |
| Telegram bot / social integration  | REST API only                  |

## Architecture

```text
┌─────────────┐     ┌─────────────┐     ┌──────────────────────────┐
│  Frontend /  │────▶│  REST API   │────▶│  PostgreSQL (off-chain)  │
│  Agent       │     │  (Elysia)   │     │  markets, trades, topics │
└──────┬───────┘     └─────────────┘     └──────────────────────────┘
       │
       │  viem / ethers.js
       ▼
┌──────────────────────────────────┐
│  QLWYPredictionMarket Contract   │
│  (on-chain: trading, settlement) │
└──────────────────────────────────┘
```

**Key principle**: Market creation starts off-chain (REST API → AI analysis → IPFS metadata), then the user activates it on-chain. All trading (buy/sell) and settlement happen on-chain. The API syncs on-chain events back to the database for querying.

## Core Concepts

| Concept           | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| **LMSR AMM**      | Logarithmic Market Scoring Rule — continuous pricing, no order book     |
| **Outcomes**       | YES (1), NO (2), INVALID (0)                                          |
| **USD1**          | Stablecoin used for all trading (18 decimals on-chain)                 |
| **Shares**        | WAD precision (1e18). Each winning share pays out 1 USD1               |
| **Subsidy**       | Initial liquidity deposit by creator. Sets the LMSR `b` parameter      |
| **Fees**          | 1% creator + 1% protocol + 1% LP = 3% total on each trade            |
| **Settlement**    | Creator proposes → 24h dispute window → optional Mythic NFT arbitration|

## Market Lifecycle

```text
PENDING → TRADING → (expired) → DISPUTE_PERIOD → RESOLVED
                                      ↓
                                 ARBITRATION → RESOLVED
```

1. **PENDING** — Created via API, AI analyzes suitability, metadata uploaded to IPFS
2. **TRADING** — Activated on-chain with `createMarket()`. Users buy/sell shares
3. **Expired** — After `expiresAt`, no more trading. Creator has 24h to settle
4. **DISPUTE_PERIOD** — Creator proposes outcome, 24h window for anyone to dispute
5. **ARBITRATION** — If disputed, Mythic NFT holders vote (72h, 20% quorum)
6. **RESOLVED** — Final outcome set, winners can claim payouts

---

## REST API Reference

**Base URL**: `https://api.qlwy.xyz` (Elysia server)

**Authentication**: `Authorization: Bearer <token>` header for write operations. Two auth methods are supported:

1. **Privy JWT** — For frontend users who log in via Privy (browser-based)
2. **SIWE Wallet Signature** — For bots/agents that authenticate with a wallet private key (see below)

### Wallet Signature Login (SIWE)

Agents and bots can authenticate by signing a message with their wallet private key, then exchanging it for a JWT.

```bash
POST /auth/siwe
```

**Request**:

```json
{
  "message": "Sign in to QLWY Prediction Market\nAddress: 0xYourWalletAddress\nIssued At: 2026-02-24T12:00:00.000Z",
  "signature": "0x..."
}
```

**Response**:

```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "address": "0x..."
}
```

**Notes**:
- Message must include `Address: 0x...` (checksummed) and `Issued At: <ISO timestamp>`
- Timestamp must be within 5 minutes of server time
- Returned JWT is valid for 7 days
- Use the token as `Authorization: Bearer <token>` for all subsequent API calls

**TypeScript example (viem)**:

```typescript
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(PRIVATE_KEY);
const message = `Sign in to QLWY Prediction Market\nAddress: ${account.address}\nIssued At: ${new Date().toISOString()}`;
const signature = await account.signMessage({ message });

const res = await fetch('https://api.qlwy.xyz/auth/siwe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, signature }),
});
const { token } = await res.json();
// Use token for authenticated requests: Authorization: Bearer ${token}
```

### Create Market

```bash
POST /markets
```

**Request**:

```json
{
  "statement": "BTC will exceed $100,000 by March 2026",
  "image": "data:image/png;base64,..." // optional
}
```

**Response**:

```json
{
  "success": true,
  "marketId": "abc123-...",
  "hasExpiry": true,
  "expiryAt": 1740000000,
  "topic": {
    "id": 5,
    "name": "Bitcoin",
    "slug": "bitcoin",
    "isNew": false
  },
  "relatedMarkets": [
    { "id": "xyz...", "statement": "...", "similarity": 0.85 }
  ],
  "remaining": 4
}
```

**Notes**:
- AI automatically analyzes the statement for suitability, extracts expiry, generates description and rules
- Returns related markets found via embedding similarity
- Rate limited: per-request throttle + daily limit per user
- Market starts in PENDING status (not yet on-chain)

### Prepare for On-chain Activation

```bash
GET /markets/:id/prepare-onchain?expiresAt=1740000000
```

**Response**:

```json
{
  "success": true,
  "metadataUri": "ipfs://Qm...",
  "metadataHash": "0x...",
  "expiresAt": 1740000000,
  "gatewayUrl": "https://gateway.pinata.cloud/ipfs/Qm..."
}
```

**Notes**:
- Uploads metadata JSON to IPFS via Pinata
- Returns `metadataUri` and `metadataHash` needed for `createMarket()` contract call
- Twitter-sourced markets have a 1-hour protection period for the original author

### List Markets

```bash
GET /markets?sort=latest&limit=50&cursor=2026-01-01T00:00:00Z&topicId=5
```

| Parameter | Values                                | Default  |
| --------- | ------------------------------------- | -------- |
| `sort`    | `latest`, `trending`, `recommended`   | `latest` |
| `limit`   | 1–100                                 | 50       |
| `cursor`  | ISO timestamp (for `latest` pagination) | —      |
| `topicId` | Filter by topic ID                    | —        |

### Get Market Detail

```bash
GET /markets/:id
```

### Get Market by On-chain ID

```bash
GET /markets/by-onchain/:onchainId
```

### Markets by Creator

```bash
GET /markets/by-creator/:address
```

### Markets by Trader

```bash
GET /markets/by-trader/:address
```

Returns all markets where the address has traded or provided liquidity.

### Market Activity (Trades + Holders)

```bash
GET /markets/:id/activity
```

**Response**:

```json
{
  "events": [
    {
      "type": "buy",
      "trader": "0x...",
      "outcome": 0,
      "shares": 10.5,
      "amount": 5.25,
      "blockNumber": 123456,
      "transactionHash": "0x...",
      "timestamp": 1740000000
    }
  ],
  "holders": [
    { "address": "0x...", "yesShares": 10.5, "noShares": 0 }
  ],
  "liquidityProviders": [
    { "address": "0x...", "totalAmount": 100, "subsidyCount": 1 }
  ]
}
```

**Note**: Frontend uses outcome mapping: `0 = YES`, `1 = NO` (different from contract: `1 = YES`, `2 = NO`).

### Related Markets

```bash
GET /markets/:id/related
```

Returns up to 5 similar markets by embedding similarity, sorted by volume.

### Comments

```bash
GET  /markets/:id/comments?userAddress=0x...
POST /markets/:id/comments         { content, author, parentId? }
DELETE /markets/comments/:commentId?author=0x...
POST /markets/comments/:commentId/like    { userAddress }
DELETE /markets/comments/:commentId/like?userAddress=0x...
```

### Topics

```bash
GET /topics/trending?limit=20
GET /topics/search?q=bitcoin
GET /topics/:slug
GET /topics/:slug/related
```

### User Profiles

```bash
GET /profile/:address
PUT /profile   { username?, bio?, avatar? }
```

- Username: 2–30 chars, unique, changeable once per day
- Avatar: accepts base64 data URI (auto-uploaded to IPFS)

---

## Smart Contract Reference

### Contract: QLWYPredictionMarket

**Stablecoin**: USD1 (ERC-20, 18 decimals)

**Outcome Constants**: `YES = 1`, `NO = 2`, `INVALID = 0`

**Share Precision**: WAD (1e18)

### Create Market (On-chain)

After getting `metadataUri` and `metadataHash` from the API's `/prepare-onchain` endpoint:

```typescript
import { parseEther } from 'viem';

const tx = await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'createMarket',
  args: [
    metadataUri,           // string: "ipfs://Qm..."
    metadataHash,          // bytes32: keccak256 of metadata JSON
    expiresAt,             // uint48: unix timestamp
    parseEther('100'),     // uint256: subsidy amount in USD1 (min 10)
  ],
});
```

**Prerequisites**: User must have approved USD1 to the contract address.

### Buy Shares

```typescript
// 1. Get cost estimate
const totalCost = await publicClient.readContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'costToBuy',
  args: [marketId, outcome, shares],  // outcome: 1=YES, 2=NO; shares in WAD
});

// 2. Approve USD1
await walletClient.writeContract({
  address: USD1_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [PREDICTION_MARKET_ADDRESS, totalCost],
});

// 3. Buy
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'buy',
  args: [
    marketId,              // uint256
    1,                     // uint8: YES=1, NO=2
    parseEther('10'),      // int256: shares in WAD
    totalCost * 105n / 100n, // uint256: maxCost with 5% slippage
  ],
});
```

### Sell Shares

```typescript
// 1. Get payout estimate
const netPayout = await publicClient.readContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'payoutForSell',
  args: [marketId, outcome, shares],
});

// 2. Sell
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'sell',
  args: [
    marketId,              // uint256
    1,                     // uint8: YES=1, NO=2
    parseEther('10'),      // int256: shares in WAD
    netPayout * 95n / 100n, // uint256: minPayout with 5% slippage tolerance
  ],
});
```

### Get Price

```typescript
const [yesPrice, noPrice] = await publicClient.readContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'getPrice',
  args: [marketId],
});
// yesPrice and noPrice are in WAD (1e18 = 100%)
// e.g. 700000000000000000n = 70%
```

### Settlement Flow

```typescript
// Step 1: Creator settles after market expires
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'settleMarket',
  args: [marketId, 1], // 1=YES, 2=NO, 0=INVALID
});
// → Market enters DisputePeriod (24h)

// Step 2a: If no dispute after 24h, anyone can finalize
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'finalizeAfterDisputePeriod',
  args: [marketId],
});

// Step 2b: OR someone disputes (pays arbitration fee)
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'dispute',
  args: [marketId, 2, arbitrationFee], // disputedOutcome=NO, fee in USD1
});
// → Market enters Arbitration (Mythic NFT holders vote)

// Step 3: After arbitration resolves
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'resolveFromArbitration',
  args: [marketId],
});
```

**Grace period**: If creator doesn't settle within 24h after expiry, anyone can call `settleMarket(marketId, 0)` to force INVALID.

### Claim Winnings

```typescript
// After market is resolved
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'claimWinnings',
  args: [marketId],
});
// YES/NO winners: each share pays 1 USD1
// INVALID: each share (YES or NO) pays 0.5 USD1
```

### Add Liquidity (Subsidy)

```typescript
// Anyone can add liquidity to increase market depth
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'addSubsidy',
  args: [marketId, parseEther('50')], // min 10 USD1
});
// LP gets proportional claim on remaining pool after resolution
```

### Fee Claims

```typescript
// Creator claims accumulated trading fees (1% of volume)
await walletClient.writeContract({
  functionName: 'claimCreatorFee',
  args: [marketId],
});

// LP claims share of remaining subsidy pool after resolution
await walletClient.writeContract({
  functionName: 'claimSubsidy',
  args: [marketId],
});
```

---

## Common Integration Patterns

### Full Market Creation Flow (Frontend)

```typescript
// 1. Create market via API (gets AI analysis, IPFS metadata)
const createRes = await fetch('/markets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ statement: 'ETH will reach $5000 by June 2026' }),
});
const { marketId } = await createRes.json();

// 2. Prepare on-chain data
const prepareRes = await fetch(`/markets/${marketId}/prepare-onchain`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { metadataUri, metadataHash, expiresAt } = await prepareRes.json();

// 3. Approve USD1 for subsidy
await walletClient.writeContract({
  address: USD1_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [PREDICTION_MARKET_ADDRESS, parseEther('100')],
});

// 4. Create on-chain
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'createMarket',
  args: [metadataUri, metadataHash, expiresAt, parseEther('100'), 5000],
});
// Event sync service will automatically update the database
```

### Backend Trading Bot

```typescript
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sonic } from 'viem/chains'; // or your target chain

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: sonic, transport: http() });
const walletClient = createWalletClient({ account, chain: sonic, transport: http() });

// Fetch active markets from API
const markets = await fetch('https://api.example.com/markets?sort=trending').then(r => r.json());

// Buy YES shares on a market
const marketId = 1n;
const shares = parseEther('10');
const cost = await publicClient.readContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'costToBuy',
  args: [marketId, 1, shares], // 1 = YES
});

// Approve + Buy
await walletClient.writeContract({
  address: USD1_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [PREDICTION_MARKET_ADDRESS, cost],
});
await walletClient.writeContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
  functionName: 'buy',
  args: [marketId, 1, shares, cost * 110n / 100n],
});
```

---

## Key Configuration

| Parameter                    | Value       | Description                          |
| ---------------------------- | ----------- | ------------------------------------ |
| `creatorFeeBps`              | 100 (1%)    | Fee to market creator per trade      |
| `protocolFeeBps`             | 100 (1%)    | Fee to protocol per trade            |
| `lpFeeBps`                   | 100 (1%)    | Fee to liquidity pool per trade      |
| `minSubsidy`                 | 10 USD1     | Minimum initial liquidity            |
| `minDuration`                | 1 hour      | Minimum market duration              |
| `disputePeriod`              | 24 hours    | Window for disputing settlement      |
| `creatorSettlementGracePeriod` | 24 hours  | Grace period before anyone can force INVALID |

## Contract Events

| Event                        | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `MarketCreated`              | New market created on-chain                  |
| `SharesBought`               | Shares purchased (marketId, buyer, outcome, shares, cost) |
| `SharesSold`                 | Shares sold back to AMM                      |
| `SubsidyAdded`               | Liquidity added to a market                  |
| `CreatorSettlementProposed`  | Creator proposed an outcome                  |
| `OutcomeDisputed`            | Settlement disputed, enters arbitration      |
| `MarketResolved`             | Market finalized with outcome                |
| `WinningsClaimed`            | User claimed winning payout                  |
| `CreatorFeeClaimed`          | Creator claimed accumulated fees             |
| `SubsidyClaimed`             | LP claimed share of remaining pool           |

## Troubleshooting

| Issue                                | Solution                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| "Market not suitable"                | AI rejected the statement — rephrase as a clear, verifiable binary question |
| "Daily limit reached"               | Each user has a daily market creation limit                    |
| `MarketNotTrading` revert            | Market is not in Trading status (may be expired or resolved)   |
| `MarketExpired` revert               | Cannot trade after `expiresAt` timestamp                       |
| `InsufficientShares` revert          | User trying to sell more shares than they hold                 |
| `BelowMinSubsidy` revert            | Subsidy amount less than 10 USD1                               |
| `cost exceeds max` revert            | Price moved, increase `maxCost` (slippage protection triggered)|
| `payout below min` revert            | Price moved, decrease `minPayout` (slippage protection)        |
| `NotCreator` revert on settlement   | Only creator can settle within 24h grace period                |
| `DisputePeriodOver` revert           | Cannot dispute after 24h dispute window                        |
| Wrong outcome display                | Contract uses YES=1, NO=2; frontend uses YES=0, NO=1          |
| Amounts showing wrong decimals       | USD1 is 18 decimals on-chain. Divide by 1e18 for display       |

## Additional Resources

- **LMSR Primer**: Cost function `C(q) = b * ln(exp(qYes/b) + exp(qNo/b))`. Price of YES = `exp(qYes/b) / (exp(qYes/b) + exp(qNo/b))`
- **Subsidy → b parameter**: `b = subsidyAmount * 1e18 / ln(2)`. Larger `b` = tighter spread, less price impact
- **Initial probability**: Always starts at 50:50

