/**
 * Example: Query prediction markets via REST API
 *
 * No wallet needed — read-only operations.
 *
 * Usage:
 *   npx tsx examples/query-markets.ts
 *
 * Environment:
 *   API_BASE  — API base URL (default: https://api.qlwy.xyz)
 */

const API_BASE = process.env.API_BASE || "https://api.qlwy.xyz";

async function main() {
  // ─── 1. List trending markets ───────────────────────────────────────────────
  console.log("=== Trending Markets ===\n");
  const trending = await fetch(`${API_BASE}/markets?sort=trending&limit=5`).then(
    (r) => r.json()
  );
  for (const m of trending.markets ?? []) {
    console.log(`  [${m.id}] ${m.statement}`);
    console.log(`       Status: ${m.status}  |  Volume: ${m.volume ?? 0} USD1`);
    console.log();
  }

  // ─── 2. Get a single market detail ──────────────────────────────────────────
  const firstId = trending.markets?.[0]?.id;
  if (firstId) {
    console.log(`=== Market Detail: ${firstId} ===\n`);
    const detail = await fetch(`${API_BASE}/markets/${firstId}`).then((r) =>
      r.json()
    );
    console.log(JSON.stringify(detail, null, 2));
    console.log();

    // ─── 3. Get activity (trades + holders) ─────────────────────────────────
    console.log(`=== Activity ===\n`);
    const activity = await fetch(`${API_BASE}/markets/${firstId}/activity`).then(
      (r) => r.json()
    );
    console.log(`  Trades: ${activity.events?.length ?? 0}`);
    console.log(`  Holders: ${activity.holders?.length ?? 0}`);
    console.log(`  LPs: ${activity.liquidityProviders?.length ?? 0}`);
    console.log();

    // ─── 4. Get comments ────────────────────────────────────────────────────
    console.log(`=== Comments ===\n`);
    const comments = await fetch(
      `${API_BASE}/markets/${firstId}/comments`
    ).then((r) => r.json());
    console.log(`  Total comments: ${comments.comments?.length ?? 0}`);
    console.log();
  }

  // ─── 5. Trending topics ─────────────────────────────────────────────────────
  console.log("=== Trending Topics ===\n");
  const topics = await fetch(`${API_BASE}/topics/trending?limit=5`).then((r) =>
    r.json()
  );
  for (const t of topics.topics ?? []) {
    console.log(`  ${t.name} (${t.slug}) — ${t.marketCount ?? 0} markets`);
  }

  // ─── 6. User profile ───────────────────────────────────────────────────────
  const exampleAddr = trending.markets?.[0]?.creatorAddress;
  if (exampleAddr) {
    console.log(`\n=== Profile: ${exampleAddr} ===\n`);
    const profile = await fetch(`${API_BASE}/profile/${exampleAddr}`).then(
      (r) => r.json()
    );
    console.log(JSON.stringify(profile, null, 2));
  }
}

main().catch(console.error);

