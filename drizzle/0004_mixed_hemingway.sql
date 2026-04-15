CREATE TYPE "public"."closure_type" AS ENUM('indefinite', 'scheduled');--> statement-breakpoint
ALTER TABLE "road_closure" ADD COLUMN "closure_type" "closure_type" DEFAULT 'indefinite' NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure" ADD COLUMN "end_date" timestamp;