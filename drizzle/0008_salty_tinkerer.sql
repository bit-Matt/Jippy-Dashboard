CREATE TYPE "public"."disallowed_direction" AS ENUM('direction_to', 'direction_back', 'both');--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "disallowed_direction" "disallowed_direction" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "polyline" text DEFAULT '' NOT NULL;