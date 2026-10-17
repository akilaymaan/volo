CREATE TABLE "candidate_attempt" (
	"interview_id" text NOT NULL,
	"email" text NOT NULL,
	"response_id" text NOT NULL,
	CONSTRAINT "candidate_attempt_interview_id_email_pk" PRIMARY KEY("interview_id","email")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "session_hash" text;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "session_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "delete_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "interview_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "last_reply_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "turn_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_attempt" ADD CONSTRAINT "candidate_attempt_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_attempt" ADD CONSTRAINT "candidate_attempt_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Preserve historical orphan survey rows; enforce the relationship for new rows.
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
--> statement-breakpoint
INSERT INTO "candidate_attempt" ("interview_id", "email", "response_id")
SELECT DISTINCT ON ("interview_id", lower(trim("email")))
  "interview_id", lower(trim("email")), "id"
FROM "response"
WHERE trim("email") <> ''
ORDER BY "interview_id", lower(trim("email")), ("status" = 'completed') DESC, "created_at" DESC;
--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_retention_days_check" CHECK ("retention_days" BETWEEN 1 AND 3650);