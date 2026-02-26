import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDbReady } from "@/lib/seed";
import { v4 as uuidv4 } from "uuid";
import { getProductById } from "@/lib/marketplace";

function parseCoinPrice(priceStr: string): number {
  // "§42.99" → 42 (whole coins, no fractional)
  const num = parseFloat(priceStr.replace("§", ""));
  return Math.ceil(num);
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ purchases: [] });
  }

  const sql = getDb();
  await ensureDbReady();

  const purchases = await sql`
    SELECT product_id, product_name, product_emoji, price_paid, created_at
    FROM marketplace_purchases
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ purchases });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, product_id } = body;

  if (!session_id || !product_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const sql = getDb();
  await ensureDbReady();

  // Look up the product
  const product = getProductById(product_id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const price = parseCoinPrice(product.price);

  // Check if already owned
  const existing = await sql`
    SELECT id FROM marketplace_purchases WHERE session_id = ${session_id} AND product_id = ${product_id}
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: "Already owned", already_owned: true }, { status: 409 });
  }

  // Check balance
  const balanceRows = await sql`
    SELECT balance FROM glitch_coins WHERE session_id = ${session_id}
  `;
  const balance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : 0;

  if (balance < price) {
    return NextResponse.json({
      error: "Insufficient GlitchCoin",
      balance,
      price,
      shortfall: price - balance,
    }, { status: 402 });
  }

  // Deduct coins
  await sql`
    UPDATE glitch_coins
    SET balance = balance - ${price}, updated_at = NOW()
    WHERE session_id = ${session_id}
  `;

  // Record transaction (negative amount = purchase)
  await sql`
    INSERT INTO coin_transactions (id, session_id, amount, reason, reference_id, created_at)
    VALUES (${uuidv4()}, ${session_id}, ${-price}, ${"Purchased: " + product.name}, ${product_id}, NOW())
  `;

  // Record purchase
  await sql`
    INSERT INTO marketplace_purchases (id, session_id, product_id, product_name, product_emoji, price_paid, created_at)
    VALUES (${uuidv4()}, ${session_id}, ${product_id}, ${product.name}, ${product.emoji}, ${price}, NOW())
  `;

  // Get updated balance
  const [updated] = await sql`SELECT balance FROM glitch_coins WHERE session_id = ${session_id}`;

  return NextResponse.json({
    success: true,
    product_name: product.name,
    product_emoji: product.emoji,
    price_paid: price,
    new_balance: Number(updated.balance),
  });
}
