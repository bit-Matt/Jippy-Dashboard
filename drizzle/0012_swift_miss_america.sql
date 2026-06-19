CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stop_number" integer NOT NULL,
	"address" text NOT NULL,
	"point" geometry(Point,4326),
	"is_public" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;