DROP TABLE "road_closure_points" CASCADE;--> statement-breakpoint
ALTER TABLE "road_closure" ADD COLUMN "polygon" geometry(Polygon,4326);