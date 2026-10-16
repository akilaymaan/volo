// Languages supported end-to-end by Sarvam STT (saaras) and TTS (bulbul:v3)
export const LANGUAGES = [
  { code: "en-IN", label: "English", native: "English" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "bn-IN", label: "Bengali", native: "বাংলা" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
  { code: "pa-IN", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "od-IN", label: "Odia", native: "ଓଡ଼ିଆ" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const languageLabel = (code: string) =>
  LANGUAGES.find((l) => l.code === code)?.label ?? code;

// A curated subset of Sarvam bulbul:v3 speakers
export const VOICES = [
  { id: "ritu", label: "Ritu", tone: "Female · warm" },
  { id: "priya", label: "Priya", tone: "Female · bright" },
  { id: "kavya", label: "Kavya", tone: "Female · friendly" },
  { id: "neha", label: "Neha", tone: "Female · calm" },
  { id: "shreya", label: "Shreya", tone: "Female · crisp" },
  { id: "shubh", label: "Shubh", tone: "Male · warm" },
  { id: "aditya", label: "Aditya", tone: "Male · confident" },
  { id: "rahul", label: "Rahul", tone: "Male · friendly" },
  { id: "rohan", label: "Rohan", tone: "Male · calm" },
  { id: "kabir", label: "Kabir", tone: "Male · deep" },
] as const;

export const AVATAR_COLORS = [
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#f43f5e",
  "#f59e0b",
  "#6366f1",
  "#14b8a6",
  "#ec4899",
];

// Interviewer personality sliders (1–10)
export const TRAITS = [
  { key: "empathy", label: "Empathy", low: "Neutral", high: "Warm and reassuring" },
  { key: "exploration", label: "Depth", low: "Broad", high: "Probing follow-ups" },
  { key: "rapport", label: "Rapport", low: "Formal", high: "Conversational" },
  { key: "speed", label: "Pace", low: "Relaxed", high: "Brisk" },
] as const;

export const CANDIDATE_STATUSES = {
  none: { label: "Not reviewed", className: "bg-muted text-muted-foreground" },
  shortlisted: {
    label: "Shortlisted",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  maybe: { label: "Maybe", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  rejected: { label: "Rejected", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
} as const;

export const RECOMMENDATIONS = {
  strong_yes: { label: "Strong hire", className: "text-emerald-600 dark:text-emerald-400" },
  yes: { label: "Hire", className: "text-emerald-600 dark:text-emerald-400" },
  maybe: { label: "Maybe", className: "text-amber-600 dark:text-amber-400" },
  no: { label: "No hire", className: "text-rose-600 dark:text-rose-400" },
} as const;

// Abuse guards for the public interview endpoints
export const LIMITS = {
  maxTurns: 120,
  maxRequests: 300,
  maxChunks: 12,
  maxChunkBytes: 4 * 1024 * 1024,
  maxRecordingBytes: 25 * 1024 * 1024,
  graceSec: 120,
};
