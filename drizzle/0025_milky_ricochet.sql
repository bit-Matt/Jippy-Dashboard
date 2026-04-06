ALTER TABLE "invitations" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "road_closure_snapshot" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "road_closure" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_markers" ADD CONSTRAINT "region_markers_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD CONSTRAINT "region_snapshots_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure_snapshot" ADD CONSTRAINT "road_closure_snapshot_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure" ADD CONSTRAINT "road_closure_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;