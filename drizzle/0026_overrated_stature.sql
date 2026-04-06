ALTER TABLE "region_stations" ADD COLUMN "available_from" text DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "region_stations" ADD COLUMN "available_to" text DEFAULT '23:59' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD COLUMN "available_from" text DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD COLUMN "available_to" text DEFAULT '23:59' NOT NULL;