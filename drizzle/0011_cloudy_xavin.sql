CREATE TYPE "public"."closure_direction" AS ENUM('one_way', 'both');--> statement-breakpoint
CREATE TABLE "roadClosureSequences" (
	"id" text PRIMARY KEY NOT NULL,
	"closure_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"address" text,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadClosures" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text,
	"color" text DEFAULT '#ef4444' NOT NULL,
	"type" text NOT NULL,
	"direction" "closure_direction",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roadClosureSequences" ADD CONSTRAINT "roadClosureSequences_closure_id_roadClosures_id_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."roadClosures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index_road_closure" ON "roadClosureSequences" USING gist ("point");--> statement-breakpoint
CREATE INDEX "road_closure_seq_idx" ON "roadClosureSequences" USING btree ("closure_id","sequence_number");