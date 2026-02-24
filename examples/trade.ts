/**
 * Example: Buy and sell prediction market shares
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx examples/trade.ts buy 1 YES 10
 *   PRIVATE_KEY=0x... npx tsx examples/trade.ts sell 1 NO 5
 *
 * Arguments:
 *   action    — "buy" or "sell"
 *   marketId  — On-chain market ID (number)
 *   side      — "YES" or "NO"
 *   shares    — Number of shares (e.g. 10)
 *
 * Environment:
 *   PRIVATE_KEY                — Wallet private key
 *   PREDICTION_MARKET_ADDRESS  — Contract address
 *   USD1_ADDRESS               — USD1 stablecoin address
 *   RPC_URL                    — BSC RPC URL
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import predictionMarketAbi from "../references/QLWYPredictionMarket.abi.json";

// ─── Config ──────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const MARKET_ADDRESS = (process.env.PREDICTION_MARKET_ADDRESS ||
  "0x06e7D3035650749C846978B732b8dd7a3b48bE75") as Address;
const USD1_ADDRESS = (process.env.USD1_ADDRESS ||
  "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d") as Address;
const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed1.binance.org";

const erc20Abi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Contract outcome constants: YES = 1, NO = 2
function outcomeToContract(side: string): number {
  if (side.toUpperCase() === "YES") return 1;
  if (side.toUpperCase() === "NO") return 2;
  throw new Error(`Invalid side: ${side}. Must be YES or NO.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [action, marketIdStr, side, sharesStr] = process.argv.slice(2);

  if (!action || !marketIdStr || !side || !sharesStr) {
    console.error("Usage: npx tsx examples/trade.ts <buy|sell> <marketId> <YES|NO> <shares>");
    console.error("Example: npx tsx examples/trade.ts buy 1 YES 10");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable required");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(RPC_URL) });

  const marketId = BigInt(marketIdStr);
  const outcome = outcomeToContract(side);
  const shares = parseEther(sharesStr);

  // Get current price
  const [yesPrice, noPrice] = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "getPrice",
    args: [marketId],
  }) as [bigint, bigint];
  console.log(`Current prices — YES: ${(Number(yesPrice) / 1e18 * 100).toFixed(1)}%  NO: ${(Number(noPrice) / 1e18 * 100).toFixed(1)}%`);

  if (action === "buy") {
    // Get cost estimate
    const totalCost = await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "costToBuy",
      args: [marketId, outcome, shares],
    }) as bigint;
    const maxCost = totalCost * 105n / 100n; // 5% slippage
    console.log(`\nBuying ${sharesStr} ${side} shares...`);
    console.log(`  Estimated cost: ${formatEther(totalCost)} USD1`);
    console.log(`  Max cost (5% slippage): ${formatEther(maxCost)} USD1`);

    // Approve USD1
    const approveTx = await walletClient.writeContract({
      address: USD1_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [MARKET_ADDRESS, maxCost],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Buy
    const buyTx = await walletClient.writeContract({
      address: MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "buy",
      args: [marketId, outcome, shares, maxCost],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
    console.log(`  ✅ Bought! tx: ${buyTx} (block ${receipt.blockNumber})`);
  } else if (action === "sell") {
    // Get payout estimate
    const netPayout = await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "payoutForSell",
      args: [marketId, outcome, shares],
    }) as bigint;
    const minPayout = netPayout * 95n / 100n; // 5% slippage
    console.log(`\nSelling ${sharesStr} ${side} shares...`);
    console.log(`  Estimated payout: ${formatEther(netPayout)} USD1`);
    console.log(`  Min payout (5% slippage): ${formatEther(minPayout)} USD1`);

    // Sell
    const sellTx = await walletClient.writeContract({
      address: MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "sell",
      args: [marketId, outcome, shares, minPayout],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: sellTx });
    console.log(`  ✅ Sold! tx: ${sellTx} (block ${receipt.blockNumber})`);
  } else {
    console.error(`Unknown action: ${action}. Use "buy" or "sell".`);
    process.exit(1);
  }

  // Show updated price
  const [newYes, newNo] = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "getPrice",
    args: [marketId],
  }) as [bigint, bigint];
  console.log(`\nUpdated prices — YES: ${(Number(newYes) / 1e18 * 100).toFixed(1)}%  NO: ${(Number(newNo) / 1e18 * 100).toFixed(1)}%`);
}

main().catch(console.error);

