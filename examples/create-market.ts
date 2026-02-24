/**
 * Example: Full market creation flow (API + On-chain)
 *
 * Steps:
 *   1. Sign in via SIWE (wallet signature → JWT)
 *   2. POST /markets — AI analyzes statement, creates off-chain record
 *   3. GET /markets/:id/prepare-onchain — uploads metadata to IPFS
 *   4. Approve USD1 to contract
 *   5. Call createMarket() on-chain
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx examples/create-market.ts "BTC will hit $150k by July 2026"
 *
 * Environment:
 *   PRIVATE_KEY                — Wallet private key (with USD1 balance)
 *   API_BASE                   — API base URL (default: https://api.qlwy.xyz)
 *   PREDICTION_MARKET_ADDRESS  — Contract address
 *   USD1_ADDRESS               — USD1 stablecoin address
 *   RPC_URL                    — BSC RPC URL
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import predictionMarketAbi from "../references/QLWYPredictionMarket.abi.json";

// ─── Config ──────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const API_BASE = process.env.API_BASE || "https://api.qlwy.xyz";
const MARKET_ADDRESS = (process.env.PREDICTION_MARKET_ADDRESS ||
  "0x06e7D3035650749C846978B732b8dd7a3b48bE75") as Address;
const USD1_ADDRESS = (process.env.USD1_ADDRESS ||
  "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d") as Address;
const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed1.binance.org";

// ─── Minimal ERC-20 ABI ──────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const statement = process.argv[2];
  if (!statement) {
    console.error("Usage: npx tsx examples/create-market.ts \"Your prediction statement\"");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable required");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(RPC_URL) });

  // Step 1: Login via SIWE (wallet signature → JWT)
  console.log("Step 1: Signing in via SIWE...");
  const siweMessage = `Sign in to QLWY Prediction Market\nAddress: ${account.address}\nIssued At: ${new Date().toISOString()}`;
  const signature = await account.signMessage({ message: siweMessage });
  const loginRes = await fetch(`${API_BASE}/auth/siwe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: siweMessage, signature }),
  });
  const loginData = (await loginRes.json()) as { success: boolean; token?: string; error?: string };
  if (!loginData.success || !loginData.token) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  console.log(`  ✅ Authenticated as ${account.address}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginData.token}`,
  };

  // Step 2: Create market via API
  console.log("\nStep 2: Creating market via API...");
  const createRes = await fetch(`${API_BASE}/markets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ statement }),
  });
  const createData = await createRes.json();
  if (!createData.success) {
    console.error("Failed:", createData);
    process.exit(1);
  }
  const marketId = createData.marketId;
  console.log(`  ✅ Market created: ${marketId}`);
  console.log(`  Expiry: ${new Date((createData.expiryAt || 0) * 1000).toISOString()}`);

  // Step 3: Prepare on-chain (IPFS upload)
  console.log("\nStep 3: Preparing on-chain data...");
  const prepareRes = await fetch(
    `${API_BASE}/markets/${marketId}/prepare-onchain?expiresAt=${createData.expiryAt}`,
    { headers }
  );
  const prepareData = await prepareRes.json();
  console.log(`  ✅ IPFS: ${prepareData.metadataUri}`);

  // Step 4: Approve USD1
  const subsidyAmount = parseEther("100"); // 100 USD1 initial liquidity
  console.log("\nStep 4: Approving USD1...");
  const approveTx = await walletClient.writeContract({
    address: USD1_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [MARKET_ADDRESS, subsidyAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`  ✅ Approved: ${approveTx}`);

  // Step 5: Create market on-chain
  console.log("\nStep 5: Creating market on-chain...");
  const createTx = await walletClient.writeContract({
    address: MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "createMarket",
    args: [
      prepareData.metadataUri,
      prepareData.metadataHash as `0x${string}`,
      createData.expiryAt,
      subsidyAmount,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  console.log(`  ✅ On-chain tx: ${createTx}`);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log("\n🎉 Market created successfully!");
}

main().catch(console.error);

