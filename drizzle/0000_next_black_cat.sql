CREATE TYPE "public"."role" AS ENUM('administrator_user', 'regular_user');--> statement-breakpoint
CREATE TYPE "public"."route_sequence_type" AS ENUM('going_to', 'going_back');--> statement-breakpoint
CREATE TYPE "public"."snapshot_state" AS ENUM('ready', 'wip', 'for_approval');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_role" text,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"http_method" text,
	"route_path" text,
	"status_code" integer,
	"summary" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"metadata" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"valid_until" timestamp NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"token" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"owner_id" text,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "invitations_email_unique" UNIQUE("email"),
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "region_markers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_name" text NOT NULL,
	"color" text DEFAULT '#000000' NOT NULL,
	"shape" text NOT NULL,
	"is_public_viewable" boolean DEFAULT false NOT NULL,
	"active_snapshot_id" uuid NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_marker_sequences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_snapshot_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_name" text NOT NULL,
	"color" text DEFAULT '#000000' NOT NULL,
	"shape" text NOT NULL,
	"snapshotState" "snapshot_state" DEFAULT 'wip' NOT NULL,
	"region_id" uuid NOT NULL,
	"owner_id" text,
	"version_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_stations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_snapshot_id" uuid NOT NULL,
	"address" text DEFAULT 'Unknown' NOT NULL,
	"available_from" text DEFAULT '00:00' NOT NULL,
	"available_to" text DEFAULT '23:59' NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_closure_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"road_closure_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_closure" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"shape" text NOT NULL,
	"is_public_viewable" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_sequences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"route_snapshot_id" uuid NOT NULL,
	"sequence_type" "route_sequence_type" DEFAULT 'going_to' NOT NULL,
	"sequence_number" integer NOT NULL,
	"address" text DEFAULT 'Unknown Address' NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	"route_number" text NOT NULL,
	"route_name" text NOT NULL,
	"route_color" text DEFAULT '#FFF000' NOT NULL,
	"route_details" text DEFAULT '' NOT NULL,
	"available_from" text DEFAULT '00:00' NOT NULL,
	"available_to" text DEFAULT '23:59' NOT NULL,
	"polyline_going_to" text NOT NULL,
	"polyline_going_back" text NOT NULL,
	"snapshotState" "snapshot_state" DEFAULT 'wip' NOT NULL,
	"route_id" text NOT NULL,
	"owner_id" text,
	"version_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	"route_number" text NOT NULL,
	"route_name" text NOT NULL,
	"route_color" text DEFAULT '#FFF000' NOT NULL,
	"route_details" text DEFAULT '' NOT NULL,
	"available_from" text DEFAULT '00:00' NOT NULL,
	"available_to" text DEFAULT '23:59' NOT NULL,
	"polyline_going_to" text NOT NULL,
	"polyline_going_back" text NOT NULL,
	"is_public_viewable" boolean DEFAULT false NOT NULL,
	"active_snapshot_id" uuid NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'regular_user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"requires_route" boolean DEFAULT true NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "vehicle_types" ("id", "name", "requires_route")
    VALUES ('00000000-0000-7000-8000-000000000001', 'Modernized', true)
    ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
UPDATE "routes"
    SET "vehicle_type_id" = '00000000-0000-7000-8000-000000000001'
    WHERE "vehicle_type_id" IS NULL;
--> statement-breakpoint
UPDATE "route_snapshots"
    SET "vehicle_type_id" = '00000000-0000-7000-8000-000000000001'
    WHERE "vehicle_type_id" IS NULL;
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_markers" ADD CONSTRAINT "region_markers_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_marker_sequences" ADD CONSTRAINT "region_marker_sequences_region_snapshot_id_region_snapshots_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD CONSTRAINT "region_snapshots_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_stations" ADD CONSTRAINT "region_stations_region_snapshot_id_region_snapshots_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure_points" ADD CONSTRAINT "road_closure_points_road_closure_id_road_closure_id_fk" FOREIGN KEY ("road_closure_id") REFERENCES "public"."road_closure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure" ADD CONSTRAINT "road_closure_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_sequences" ADD CONSTRAINT "route_sequences_route_snapshot_id_route_snapshots_id_fk" FOREIGN KEY ("route_snapshot_id") REFERENCES "public"."route_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_actor_idx" ON "activity_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "spatial_index_region" ON "region_marker_sequences" USING gist ("point");--> statement-breakpoint
CREATE INDEX "region_seq_idx" ON "region_marker_sequences" USING btree ("region_snapshot_id","sequence_number");--> statement-breakpoint
CREATE INDEX "spatial_index_region_station" ON "region_stations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "region_station_ref_idx" ON "region_stations" USING btree ("region_snapshot_id");--> statement-breakpoint
CREATE INDEX "spatial_index_road_closure_region" ON "road_closure_points" USING gist ("point");--> statement-breakpoint
CREATE INDEX "road_closure_region_ref_idx" ON "road_closure_points" USING btree ("road_closure_id");--> statement-breakpoint
CREATE INDEX "spatial_index" ON "route_sequences" USING gist ("point");--> statement-breakpoint
CREATE INDEX "route_seq_idx" ON "route_sequences" USING btree ("route_snapshot_id","sequence_number");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
