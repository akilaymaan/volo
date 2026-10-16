// AI_MOCK=1 swaps Claude and Sarvam for deterministic fakes (used by the e2e suite and for UI demos without keys).
export const isMock = () => process.env.AI_MOCK === "1";
