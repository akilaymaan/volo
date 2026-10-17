import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { usageEvent } from "@/lib/db/schema";

type Context = { accountId: string; responseId?: string; operation: string };
type Units = typeof usageEvent.$inferInsert.units;
const context = new AsyncLocalStorage<Context>();

export const withUsage = <T>(scope: Context, fn: () => Promise<T>) => context.run(scope, fn);

/** Rates are explicit configuration, never guessed from a model name. Null means unpriced. */
export function estimateMicrousd(model: string, units: Units): number | null {
  if (units.audioBytes !== undefined) return null; // STT bills duration, not uploaded bytes.
  if (units.characters !== undefined) {
    const rate = process.env.SARVAM_TTS_USD_PER_MILLION_CHARACTERS;
    return rate && Number.isFinite(Number(rate)) && Number(rate) >= 0 ? Math.round(units.characters * Number(rate)) : null;
  }
  try {
    const rates = JSON.parse(process.env.ANTHROPIC_PRICING_JSON || "{}")[model] as Record<string, number> | undefined;
    if (!rates) return null;
    const pairs = [
      [units.inputTokens ?? 0, rates.input], [units.outputTokens ?? 0, rates.output],
      [units.cacheReadTokens ?? 0, rates.cacheRead], [units.cacheWriteTokens ?? 0, rates.cacheWrite],
    ];
    if (pairs.some(([count, price]) => count > 0 && (!Number.isFinite(price) || price < 0))) return null;
    const value = Math.round(pairs.reduce((sum, [count, price]) => sum + (count ? count * price : 0), 0));
    return Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
  } catch { return null; }
}

export async function recordUsage(model: string, units: Units) {
  const scope = context.getStore();
  if (!scope) return;
  try {
    await db.insert(usageEvent).values({
      id: nanoid(24), ...scope, model, units,
      estimatedCostMicrousd: estimateMicrousd(model, units),
    });
  } catch {
    // A ledger outage must not discard a candidate's paid-for answer.
    console.error("[usage] ledger write failed", { operation: scope.operation });
  }
}
