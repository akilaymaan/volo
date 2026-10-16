import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------- better-auth tables ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- app tables ----------

export type Question = { id: string; question: string; followUps: number };
export type TranscriptTurn = { role: "agent" | "user"; text: string; at: number };

export type Analytics = {
  overallScore: number;
  recommendation: "strong_yes" | "yes" | "maybe" | "no";
  overallFeedback: string;
  callSummary: string;
  sentiment: "positive" | "neutral" | "negative";
  communication: { score: number; feedback: string };
  softSkillSummary: string;
  strengths: string[];
  improvements: string[];
  questionSummaries: {
    question: string;
    status: "answered" | "not_answered" | "not_asked";
    summary: string;
  }[];
  quotes: { quote: string; analysis: string; type: "strength" | "improvement" }[];
};

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});

export const interviewer = pgTable("interviewer", {
  id: text("id").primaryKey(),
  // null owner = built-in preset visible to everyone
  ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  voice: text("voice").notNull(),
  color: text("color").notNull(),
  empathy: integer("empathy").notNull(),
  exploration: integer("exploration").notNull(),
  rapport: integer("rapport").notNull(),
  speed: integer("speed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const interview = pgTable(
  "interview",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewer.id),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    description: text("description").notNull().default(""),
    language: text("language").notNull().default("en-IN"),
    durationMins: integer("duration_mins").notNull().default(10),
    questions: jsonb("questions").$type<Question[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    themeColor: text("theme_color").notNull().default("#6d28d9"),
    logoUrl: text("logo_url"),
    // empty = anyone with the link may respond
    allowedEmails: jsonb("allowed_emails").$type<string[]>().notNull().default([]),
    insights: jsonb("insights").$type<string[]>().notNull().default([]),
    insightsUpdatedAt: timestamp("insights_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("interview_owner_idx").on(t.ownerId)],
);

export const response = pgTable(
  "response",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interview.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    status: text("status").$type<"in_progress" | "completed">().notNull().default("in_progress"),
    candidateStatus: text("candidate_status")
      .$type<"none" | "shortlisted" | "maybe" | "rejected">()
      .notNull()
      .default("none"),
    transcript: jsonb("transcript").$type<TranscriptTurn[]>().notNull().default([]),
    durationSec: integer("duration_sec").notNull().default(0),
    tabSwitchCount: integer("tab_switch_count").notNull().default(0),
    analysisStatus: text("analysis_status")
      .$type<"pending" | "running" | "done" | "failed">()
      .notNull()
      .default("pending"),
    analysisStartedAt: timestamp("analysis_started_at", { withTimezone: true }),
    analytics: jsonb("analytics").$type<Analytics>(),
    // Every /api/call/turn request (including retries) counts against the abuse cap
    requestCount: integer("request_count").notNull().default(0),
    hasRecording: boolean("has_recording").notNull().default(false),
    isViewed: boolean("is_viewed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("response_interview_idx").on(t.interviewId)],
);

export const recording = pgTable("recording", {
  // shortcut: recordings live in Postgres (≈2–4 MB each); move to object storage at scale
  responseId: text("response_id")
    .primaryKey()
    .references(() => response.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  interviewId: text("interview_id")
    .notNull()
    .references(() => interview.id, { onDelete: "cascade" }),
  responseId: text("response_id").unique(),
  satisfaction: integer("satisfaction").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Interview = typeof interview.$inferSelect;
export type Interviewer = typeof interviewer.$inferSelect;
export type Response = typeof response.$inferSelect;
