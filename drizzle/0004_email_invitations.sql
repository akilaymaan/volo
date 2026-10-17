CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "invitation_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "invitation_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_interview_email_idx" ON "invitation" USING btree ("interview_id","email");--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE set null ON UPDATE no action;