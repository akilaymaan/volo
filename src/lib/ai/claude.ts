import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// The live interviewer is latency-sensitive (the candidate waits on every reply), so it runs on Haiku
export const INTERVIEWER_MODEL = process.env.CLAUDE_INTERVIEWER_MODEL || "claude-haiku-5-5";

let client: Anthropic | undefined;

type Effort = "low" | "medium" | "high";

/** One Claude call that returns schema-validated JSON. */
export async function structured<S extends z.ZodType>(
  schema: S,
  opts: {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
    effort: Effort;
    maxTokens?: number;
    model?: string;
  },
): Promise<z.infer<S>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  const model = opts.model ?? MODEL;
  // Server-side refusal fallback ("default" mode) exists only on these model families
  const fallback = /claude-(opus-5|fable-5|sonnet-5-5)/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  // Claude 4.5-and-older models take neither adaptive thinking nor effort
  const legacy = /claude-(haiku|sonnet|opus)-4-[0-5]|claude-3/.test(model);

  const res = await client.beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: opts.messages,
    ...(legacy ? {} : { thinking: { type: "adaptive" as const } }),
    output_config: {
      ...(legacy ? {} : { effort: opts.effort }),
      format: betaZodOutputFormat(schema),
    },
    ...fallback,
  });

  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (res.parsed_output == null) {
    throw new Error(`Claude returned no structured output (stop_reason: ${res.stop_reason})`);
  }
  return res.parsed_output as z.infer<S>;
}

export type MessageParam = Anthropic.Beta.BetaMessageParam;
