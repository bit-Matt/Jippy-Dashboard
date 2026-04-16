ALTER TABLE "route_snapshots" ADD COLUMN "fleet_count" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "fleet_count" integer DEFAULT 100 NOT NULL;