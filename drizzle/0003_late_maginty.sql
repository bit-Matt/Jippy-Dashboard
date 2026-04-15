CREATE TYPE "public"."restriction_type" AS ENUM('universal', 'specific');--> statement-breakpoint
CREATE TABLE "stop_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"stop_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stop_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_vehicle_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stop_id" uuid NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"restriction_type" "restriction_type" NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stop_points" ADD CONSTRAINT "stop_points_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_routes" ADD CONSTRAINT "stop_routes_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_routes" ADD CONSTRAINT "stop_routes_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_vehicle_types" ADD CONSTRAINT "stop_vehicle_types_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_vehicle_types" ADD CONSTRAINT "stop_vehicle_types_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index_stop_points" ON "stop_points" USING gist ("point");--> statement-breakpoint
CREATE INDEX "stop_points_ref_idx" ON "stop_points" USING btree ("stop_id","sequence_number");--> statement-breakpoint
CREATE INDEX "stop_routes_ref_idx" ON "stop_routes" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "stop_vehicle_types_ref_idx" ON "stop_vehicle_types" USING btree ("stop_id");