CREATE TYPE "public"."access_token_permission" AS ENUM('r', 'rw');--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"permissions" "access_token_permission" NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;