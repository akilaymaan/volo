CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"response_id" text,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"units" jsonb NOT NULL,
	"estimated_cost_microusd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_account_created_idx" ON "usage_event" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_expires_at_idx" ON "invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "response_delete_after_idx" ON "response" USING btree ("delete_after");