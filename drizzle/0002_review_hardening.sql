ALTER TABLE "response" ADD COLUMN "analysis_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "request_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_response_id_unique" UNIQUE("response_id");