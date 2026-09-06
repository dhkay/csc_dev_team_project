CREATE TABLE "marketing_video_finals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer NOT NULL,
	"parent_source_id" integer,
	"frame_upload_id" varchar(200),
	"outro_upload_id" varchar(200),
	"title" varchar(300) NOT NULL,
	"aspect_ratio" varchar(16) DEFAULT '1:1' NOT NULL,
	"render_job_id" varchar(64),
	"render_status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"result_upload_id" varchar(200),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_video_finals" ADD CONSTRAINT "marketing_video_finals_parent_source_id_marketing_video_projects_id_fk" FOREIGN KEY ("parent_source_id") REFERENCES "public"."marketing_video_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_video_finals_owner_idx" ON "marketing_video_finals" USING btree ("organization_id","owner_user_id");