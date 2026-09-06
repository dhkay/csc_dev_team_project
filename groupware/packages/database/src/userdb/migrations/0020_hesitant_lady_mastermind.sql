CREATE TABLE "department_ai_tools" (
	"organization_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"ai_tool_id" integer NOT NULL,
	"granted_by" integer,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_ai_tools_department_id_ai_tool_id_pk" PRIMARY KEY("department_id","ai_tool_id")
);
--> statement-breakpoint
ALTER TABLE "department_ai_tools" ADD CONSTRAINT "department_ai_tools_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_ai_tools" ADD CONSTRAINT "department_ai_tools_org_grant_fk" FOREIGN KEY ("organization_id","ai_tool_id") REFERENCES "public"."organization_ai_tools"("organization_id","ai_tool_id") ON DELETE cascade ON UPDATE no action;