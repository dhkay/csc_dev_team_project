CREATE TABLE "marketing_video_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"owner_user_id" integer NOT NULL,
	"channel_id" integer,
	"saved_plan_id" integer,
	"title" varchar(300) NOT NULL,
	"aspect_ratio" varchar(16) DEFAULT '9:16' NOT NULL,
	"video_model" varchar(100) DEFAULT '' NOT NULL,
	"video_mode" varchar(20) DEFAULT '' NOT NULL,
	"tts_model" varchar(100) DEFAULT '' NOT NULL,
	"tts_voice" varchar(100) DEFAULT '' NOT NULL,
	"tts_pitch" varchar(20) DEFAULT '' NOT NULL,
	"scenes" jsonb NOT NULL,
	"background" jsonb,
	"render_job_id" varchar(64),
	"render_status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"result_upload_id" varchar(200),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_video_projects" ADD CONSTRAINT "marketing_video_projects_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_video_projects" ADD CONSTRAINT "marketing_video_projects_saved_plan_id_marketing_saved_plans_id_fk" FOREIGN KEY ("saved_plan_id") REFERENCES "public"."marketing_saved_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_video_projects_owner_idx" ON "marketing_video_projects" USING btree ("organization_id","owner_user_id");