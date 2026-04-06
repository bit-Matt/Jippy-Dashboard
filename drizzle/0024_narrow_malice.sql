CREATE TABLE "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
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
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_actor_idx" ON "activity_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");