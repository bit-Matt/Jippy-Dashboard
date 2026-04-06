CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"valid_until" timestamp NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"token" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "invitations_email_unique" UNIQUE("email"),
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;