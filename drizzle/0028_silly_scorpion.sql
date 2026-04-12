ALTER TABLE "routes" ADD COLUMN "vehicle_type_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_color" text DEFAULT '#FFF000' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "available_from" text DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "available_to" text DEFAULT '23:59' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "polyline_going_to" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "polyline_going_back" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "is_public_viewable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;