ALTER TABLE "routes" ADD COLUMN "polyline_going_to" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "polyline_going_back" text DEFAULT '' NOT NULL;