DROP TABLE "roadClosureSequences" CASCADE;--> statement-breakpoint
DROP TABLE "roadClosures" CASCADE;--> statement-breakpoint
ALTER TABLE "regionMarkers" ADD COLUMN "string" text DEFAULT 'tricycle_region' NOT NULL;--> statement-breakpoint
DROP TYPE "public"."closure_direction";