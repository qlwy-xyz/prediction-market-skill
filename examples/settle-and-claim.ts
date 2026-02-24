/**
 * Example: Settle a market and claim winnings
 *
 * Usage:
 *   # Creator settles with YES outcome
 *   PRIVATE_KEY=0x... npx tsx examples/settle-and-claim.ts settle 1 YES
 *
 *   # After dispute period, finalize
 *   PRIVATE_KEY=0x... npx tsx examples/settle-and-claim.ts finalize 1
 *
 *   # Claim winnings
 *   PRIVATE_KEY=0x... npx tsx examples/settle-and-claim.ts claim 1
 *
 * Environment:
 *   PRIVATE_KEY                — Wallet private key
 *   PREDICTION_MARKET_ADDRESS  — Contract address
 *   RPC_URL                    — BSC RPC URL
 */

import {
  createPublicClient,
  createWalletClient,
  http,
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
const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed1.binance.org";

function outcomeToContract(side: string): number {
  const s = side.toUpperCase();
  if (s === "YES") return 1;
  if (s === "NO") return 2;
  if (s === "INVALID") return 0;
  throw new Error(`Invalid outcome: ${side}. Must be YES, NO, or INVALID.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [action, marketIdStr, outcomeStr] = process.argv.slice(2);

  if (!action || !marketIdStr) {
    console.error("Usage:");
    console.error("  settle <marketId> <YES|NO|INVALID>");
    console.error("  finalize <marketId>");
    console.error("  claim <marketId>");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY required");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(RPC_URL) });
  const marketId = BigInt(marketIdStr);

  // Read market info
  const market = await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  }) as any[];
  console.log(`Market #${marketIdStr}`);
  console.log(`  Creator: ${market[0]}`);
  console.log(`  Status:  ${market[1]}`);
  console.log();

  switch (action) {
    case "settle": {
      if (!outcomeStr) {
        console.error("settle requires outcome: YES, NO, or INVALID");
        process.exit(1);
      }
      const outcome = outcomeToContract(outcomeStr);
      console.log(`Settling market with outcome: ${outcomeStr} (${outcome})...`);
      const tx = await walletClient.writeContract({
        address: MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: "settleMarket",
        args: [marketId, outcome],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✅ Settled! tx: ${tx}`);
      console.log("  ⏳ 24h dispute period started. After that, call 'finalize'.");
      break;
    }

    case "finalize": {
      console.log("Finalizing market after dispute period...");
      const tx = await walletClient.writeContract({
        address: MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: "finalizeAfterDisputePeriod",
        args: [marketId],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✅ Finalized! tx: ${tx}`);
      console.log("  Winners can now claim their payouts.");
      break;
    }

    case "claim": {
      console.log("Claiming winnings...");
      const tx = await walletClient.writeContract({
        address: MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: "claimWinnings",
        args: [marketId],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✅ Claimed! tx: ${tx} (block ${receipt.blockNumber})`);
      break;
    }

    default:
      console.error(`Unknown action: ${action}. Use settle, finalize, or claim.`);
      process.exit(1);
  }
}

main().catch(console.error);

