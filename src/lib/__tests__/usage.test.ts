import { afterEach, expect, it, vi } from "vitest";
import { estimateMicrousd } from "@/lib/usage";

afterEach(() => vi.unstubAllEnvs());

it("does not invent costs for unknown models, cache rates, STT bytes or missing pricing", () => {
  vi.stubEnv("ANTHROPIC_PRICING_JSON", "{}");
  vi.stubEnv("SARVAM_TTS_USD_PER_MILLION_CHARACTERS", "");
  expect(estimateMicrousd("model", { inputTokens: 10 })).toBeNull();
  expect(estimateMicrousd("stt", { audioBytes: 123 })).toBeNull();
  expect(estimateMicrousd("tts", { characters: 100 })).toBeNull();
  vi.stubEnv("ANTHROPIC_PRICING_JSON", '{"model":{"input":3,"output":15}}');
  expect(estimateMicrousd("model", { inputTokens: 100, cacheReadTokens: 10 })).toBeNull();
  vi.stubEnv("ANTHROPIC_PRICING_JSON", "not json");
  expect(estimateMicrousd("model", { inputTokens: 10 })).toBeNull();
});

it("prices measured token/cache counts and TTS characters with explicit rates", () => {
  vi.stubEnv("ANTHROPIC_PRICING_JSON", '{"model":{"input":3,"output":15,"cacheRead":0.3,"cacheWrite":3.75}}');
  expect(estimateMicrousd("model", { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 1000, cacheWriteTokens: 1000 })).toBe(8550);
  vi.stubEnv("SARVAM_TTS_USD_PER_MILLION_CHARACTERS", "20");
  expect(estimateMicrousd("tts", { characters: 500 })).toBe(10000);
  vi.stubEnv("SARVAM_TTS_USD_PER_MILLION_CHARACTERS", "-1");
  expect(estimateMicrousd("tts", { characters: 500 })).toBeNull();
});
