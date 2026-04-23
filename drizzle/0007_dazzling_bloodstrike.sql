CREATE TYPE "public"."feedback_state" AS ENUM('Active', 'Resolved', 'Closed');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"details" text NOT NULL,
	"state" "feedback_state" DEFAULT 'Active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_state_created_at_idx" ON "feedback" USING btree ("state","created_at");