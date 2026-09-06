CREATE TYPE "public"."user_role_enum" AS ENUM('ROOT', 'ADMIN', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."user_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."user_type_enum" AS ENUM('APP_USER', 'WEB_USER', 'ADMIN_USER');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"nickname" varchar(100),
	"role" "user_role_enum" DEFAULT 'EMPLOYEE' NOT NULL,
	"status" "user_status_enum" DEFAULT 'ACTIVE' NOT NULL,
	"user_type" "user_type_enum" DEFAULT 'WEB_USER' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
