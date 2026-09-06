CREATE TYPE "public"."rbfr_confidence_level_enum" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."rbfr_confirm_status_enum" AS ENUM('CONFIRMED', 'PROPOSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rbfr_data_source_enum" AS ENUM('manual_estimate', 'lab_test', 'literature', 'expert_review', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."rbfr_domain_type_enum" AS ENUM('DIRECT', 'INTEGRATED');--> statement-breakpoint
CREATE TYPE "public"."rbfr_fill_direction_enum" AS ENUM('CCW', 'CW');--> statement-breakpoint
CREATE TYPE "public"."rbfr_formula_status_enum" AS ENUM('DRAFT', 'CALC', 'REVIEW', 'FIXED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."rbfr_incompat_severity_enum" AS ENUM('BLOCK', 'WARN');--> statement-breakpoint
CREATE TYPE "public"."rbfr_interaction_type_enum" AS ENUM('synergy', 'conflict', 'neutral', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."rbfr_profile_type_enum" AS ENUM('PRIMARY', 'CROSS');--> statement-breakpoint
CREATE TYPE "public"."rbfr_reg_type_enum" AS ENUM('ALLOW', 'BAN', 'LIMIT', 'COND', 'NODATA');--> statement-breakpoint
CREATE TYPE "public"."rbfr_review_status_enum" AS ENUM('PENDING', 'REVIEWING', 'APPROVED', 'CHANGES', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rbfr_risk_level_enum" AS ENUM('상', '중', '하');--> statement-breakpoint
CREATE TYPE "public"."rbfr_tox_status_enum" AS ENUM('NONE', 'LISTED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."rbfr_user_role_enum" AS ENUM('REVIEWER', 'DESIGNER', 'DATA', 'VIEWER');--> statement-breakpoint
CREATE TABLE "rbfr_cell_mapping" (
	"rule_version" varchar(16) NOT NULL,
	"ratio_from" numeric(5, 2) NOT NULL,
	"ratio_to" numeric(5, 2) NOT NULL,
	"cell_count" smallint NOT NULL,
	CONSTRAINT "rbfr_cell_mapping_rule_version_ratio_from_pk" PRIMARY KEY("rule_version","ratio_from")
);
--> statement-breakpoint
CREATE TABLE "rbfr_cell_rule_limits" (
	"rule_version" varchar(16) PRIMARY KEY NOT NULL,
	"profile_code" varchar(24) NOT NULL,
	"total_min" smallint DEFAULT 15 NOT NULL,
	"total_max" smallint DEFAULT 18 NOT NULL,
	"fill_direction" "rbfr_fill_direction_enum" DEFAULT 'CCW' NOT NULL,
	"start_cell" smallint DEFAULT 1 NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" varchar(64),
	"approved_at" timestamp with time zone,
	"note" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "rbfr_code_items" (
	"code_type" varchar(24) NOT NULL,
	"code" varchar(32) NOT NULL,
	"name_ko" varchar(64) NOT NULL,
	"name_en" varchar(64),
	"descr" varchar(255),
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rbfr_code_items_code_type_code_pk" PRIMARY KEY("code_type","code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_countries" (
	"country_code" varchar(8) PRIMARY KEY NOT NULL,
	"name_ko" varchar(48) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_profiles" (
	"profile_code" varchar(24) PRIMARY KEY NOT NULL,
	"name_ko" varchar(32) NOT NULL,
	"name_en" varchar(48),
	"profile_type" "rbfr_profile_type_enum" NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_role_domains" (
	"domain_code" varchar(24) PRIMARY KEY NOT NULL,
	"profile_code" varchar(24) NOT NULL,
	"name_ko" varchar(32) NOT NULL,
	"name_en" varchar(32),
	"domain_type" "rbfr_domain_type_enum" NOT NULL,
	"sort_order" smallint NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rbfr_role_domains_profile_sort_uq" UNIQUE("profile_code","sort_order")
);
--> statement-breakpoint
CREATE TABLE "rbfr_user_roles" (
	"user_id" integer NOT NULL,
	"role_code" "rbfr_user_role_enum" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" integer,
	CONSTRAINT "rbfr_user_roles_user_id_role_code_pk" PRIMARY KEY("user_id","role_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_cas" (
	"ingredient_id" integer NOT NULL,
	"cas_no" varchar(64) NOT NULL,
	"note" varchar(64),
	CONSTRAINT "rbfr_ingredient_cas_ingredient_id_cas_no_pk" PRIMARY KEY("ingredient_id","cas_no")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_certs" (
	"ingredient_id" integer NOT NULL,
	"cert_code" varchar(32) NOT NULL,
	"is_eligible" boolean NOT NULL,
	"issuer" varchar(128),
	"cert_no" varchar(64),
	"doc_url" varchar(500),
	"valid_until" date,
	"checked_at" date,
	"note" varchar(255),
	CONSTRAINT "rbfr_ingredient_certs_ingredient_id_cert_code_pk" PRIMARY KEY("ingredient_id","cert_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_dictionary" (
	"dict_id" serial PRIMARY KEY NOT NULL,
	"name_ko" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"cas_no" varchar(64),
	"origin_desc" text,
	"synonym" varchar(255),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rbfr_ingredient_dictionary_name_ko_unique" UNIQUE("name_ko")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_flags" (
	"ingredient_id" integer NOT NULL,
	"noadd_code" varchar(32) NOT NULL,
	CONSTRAINT "rbfr_ingredient_flags_ingredient_id_noadd_code_pk" PRIMARY KEY("ingredient_id","noadd_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_history" (
	"history_id" bigserial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"field_name" varchar(64) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_incompat" (
	"ingredient_id" integer NOT NULL,
	"other_id" integer NOT NULL,
	"severity" "rbfr_incompat_severity_enum" DEFAULT 'WARN' NOT NULL,
	"reason" varchar(255),
	CONSTRAINT "rbfr_ingredient_incompat_ingredient_id_other_id_pk" PRIMARY KEY("ingredient_id","other_id")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_a_id" integer NOT NULL,
	"ingredient_b_id" integer NOT NULL,
	"domain_code" varchar(24) NOT NULL,
	"interaction_type" "rbfr_interaction_type_enum" NOT NULL,
	"coefficient" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"confidence_level" "rbfr_confidence_level_enum",
	"data_source" "rbfr_data_source_enum" DEFAULT 'unknown' NOT NULL,
	"measured_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "rbfr_ingredient_interactions_pair_domain_uq" UNIQUE("ingredient_a_id","ingredient_b_id","domain_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_prices" (
	"price_id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'KRW' NOT NULL,
	"price_unit" varchar(16) DEFAULT 'KG' NOT NULL,
	"trade_name" varchar(255),
	"is_high_cost" boolean DEFAULT false NOT NULL,
	"base_date" date NOT NULL,
	"supplier" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_purposes" (
	"ingredient_id" integer NOT NULL,
	"purpose_code" varchar(48) NOT NULL,
	CONSTRAINT "rbfr_ingredient_purposes_ingredient_id_purpose_code_pk" PRIMARY KEY("ingredient_id","purpose_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_regulations" (
	"reg_id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"country_code" varchar(8) NOT NULL,
	"reg_type" "rbfr_reg_type_enum" NOT NULL,
	"limit_pct" numeric(7, 4),
	"condition_txt" text,
	"source" varchar(255),
	"source_url" varchar(500),
	"checked_at" date,
	"ai_checked_at" date,
	"status" "rbfr_confirm_status_enum" DEFAULT 'CONFIRMED' NOT NULL,
	"found_by" varchar(32),
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"note" varchar(500),
	CONSTRAINT "rbfr_ingredient_regulations_uq" UNIQUE("ingredient_id","country_code","status")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_role_evidence_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"domain_code" varchar(24) NOT NULL,
	"upload_id" varchar(64) NOT NULL,
	"file_name" varchar(255),
	"uploaded_by" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_roles" (
	"ingredient_id" integer NOT NULL,
	"domain_code" varchar(24) NOT NULL,
	"contribution" smallint NOT NULL,
	"evidence" text,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rbfr_ingredient_roles_ingredient_id_domain_code_pk" PRIMARY KEY("ingredient_id","domain_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_textures" (
	"ingredient_id" integer NOT NULL,
	"texture_code" varchar(32) NOT NULL,
	"score" numeric(4, 3) NOT NULL,
	CONSTRAINT "rbfr_ingredient_textures_ingredient_id_texture_code_pk" PRIMARY KEY("ingredient_id","texture_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredient_tox" (
	"ingredient_id" integer NOT NULL,
	"indicator" varchar(48) NOT NULL,
	"status" "rbfr_tox_status_enum" NOT NULL,
	"checked_at" date,
	"source" varchar(255),
	CONSTRAINT "rbfr_ingredient_tox_ingredient_id_indicator_pk" PRIMARY KEY("ingredient_id","indicator")
);
--> statement-breakpoint
CREATE TABLE "rbfr_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"inci_name" varchar(255) NOT NULL,
	"name_ko" varchar(255) NOT NULL,
	"ec_no" varchar(32),
	"func_desc" text,
	"origin_desc" text,
	"synonym" varchar(255),
	"category" varchar(48),
	"ewg_grade" smallint,
	"conc_min" numeric(7, 4),
	"conc_max" numeric(7, 4),
	"solubility" varchar(16),
	"ph_min" numeric(4, 2),
	"ph_max" numeric(4, 2),
	"hlb" numeric(5, 2),
	"sg_min" numeric(6, 4),
	"sg_max" numeric(6, 4),
	"visc_type" varchar(32),
	"visc_coef" numeric(8, 4),
	"emulsion_role" varchar(32),
	"stability_note" text,
	"blend_cond" text,
	"caution" text,
	"is_base" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rbfr_ingredients_inci_name_unique" UNIQUE("inci_name")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_condition_codes" (
	"formula_id" integer NOT NULL,
	"code_type" varchar(24) NOT NULL,
	"code" varchar(32) NOT NULL,
	CONSTRAINT "rbfr_formula_condition_codes_formula_id_code_type_code_pk" PRIMARY KEY("formula_id","code_type","code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_conditions" (
	"formula_id" integer PRIMARY KEY NOT NULL,
	"target_code" varchar(32),
	"batch_size" numeric(12, 2) DEFAULT '100' NOT NULL,
	"target_price" numeric(14, 2),
	"target_ph_min" numeric(4, 2),
	"target_ph_max" numeric(4, 2),
	"extra_note" text
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_countries" (
	"formula_id" integer NOT NULL,
	"country_code" varchar(8) NOT NULL,
	CONSTRAINT "rbfr_formula_countries_formula_id_country_code_pk" PRIMARY KEY("formula_id","country_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_ingredients" (
	"formula_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"phase" varchar(16),
	"actual_pct" numeric(7, 4),
	"is_recommended" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_pct" numeric(7, 4),
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "rbfr_formula_ingredients_formula_id_ingredient_id_pk" PRIMARY KEY("formula_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_ratios" (
	"formula_id" integer NOT NULL,
	"domain_code" varchar(24) NOT NULL,
	"target_ratio" numeric(5, 2) NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"cell_count" smallint,
	"evidence" text,
	CONSTRAINT "rbfr_formula_ratios_formula_id_domain_code_pk" PRIMARY KEY("formula_id","domain_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_reviews" (
	"review_id" serial PRIMARY KEY NOT NULL,
	"formula_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"reviewer_id" integer,
	"status" "rbfr_review_status_enum" DEFAULT 'PENDING' NOT NULL,
	"comment" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_sensory_stability_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"formula_id" integer NOT NULL,
	"stickiness_score" smallint,
	"freshness_score" smallint,
	"absorption_score" smallint,
	"spreadability_score" smallint,
	"afterfeel_score" smallint,
	"viscosity_score" smallint,
	"separation_risk" "rbfr_risk_level_enum",
	"precipitation_risk" "rbfr_risk_level_enum",
	"color_change_risk" "rbfr_risk_level_enum",
	"odor_change_risk" "rbfr_risk_level_enum",
	"ph_stability_score" smallint,
	"heat_stability_score" smallint,
	"low_temp_stability_score" smallint,
	"overall_stability_score" smallint,
	"test_condition" text,
	"data_source" "rbfr_data_source_enum" DEFAULT 'unknown' NOT NULL,
	"confidence_level" "rbfr_confidence_level_enum",
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_formula_versions" (
	"version_id" serial PRIMARY KEY NOT NULL,
	"formula_id" integer NOT NULL,
	"version_no" smallint NOT NULL,
	"fixed_at" timestamp with time zone NOT NULL,
	"fixed_by" integer NOT NULL,
	"app_version" varchar(32) NOT NULL,
	"rule_version" varchar(16),
	"batch_size" numeric(12, 2) NOT NULL,
	"total_cells" smallint,
	"total_cost" numeric(14, 2),
	"snapshot_json" text NOT NULL,
	"note" text,
	CONSTRAINT "rbfr_formula_versions_formula_version_uq" UNIQUE("formula_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "rbfr_formulas" (
	"formula_id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"lab_no" varchar(48),
	"formula_name" varchar(255) NOT NULL,
	"form_code" varchar(32),
	"status" "rbfr_formula_status_enum" DEFAULT 'DRAFT' NOT NULL,
	"owner_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rbfr_formulas_lab_no_unique" UNIQUE("lab_no")
);
--> statement-breakpoint
CREATE TABLE "rbfr_projects" (
	"project_id" serial PRIMARY KEY NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"descr" varchar(500),
	"owner_id" integer NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_version_ratios" (
	"version_id" integer NOT NULL,
	"domain_code" varchar(24) NOT NULL,
	"target_ratio" numeric(5, 2) NOT NULL,
	"result_ratio" numeric(5, 2),
	"cell_count" smallint,
	"is_main" boolean DEFAULT false NOT NULL,
	CONSTRAINT "rbfr_version_ratios_version_id_domain_code_pk" PRIMARY KEY("version_id","domain_code")
);
--> statement-breakpoint
CREATE TABLE "rbfr_version_recipe" (
	"version_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"ingredient_id" integer,
	"inci_name" varchar(255) NOT NULL,
	"name_ko" varchar(255),
	"phase" varchar(16),
	"pct" numeric(7, 4) NOT NULL,
	"grams" numeric(12, 4),
	"main_domain" varchar(24),
	"reason" text,
	"unit_price" numeric(14, 2),
	CONSTRAINT "rbfr_version_recipe_version_id_line_no_pk" PRIMARY KEY("version_id","line_no")
);
--> statement-breakpoint
CREATE TABLE "rbfr_app_settings" (
	"setting_key" varchar(64) PRIMARY KEY NOT NULL,
	"setting_val" text,
	"descr" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbfr_audit_log" (
	"log_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(48) NOT NULL,
	"target" varchar(128),
	"detail" text,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rbfr_cell_rule_limits" ADD CONSTRAINT "rbfr_cell_rule_limits_profile_code_rbfr_profiles_profile_code_fk" FOREIGN KEY ("profile_code") REFERENCES "public"."rbfr_profiles"("profile_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_role_domains" ADD CONSTRAINT "rbfr_role_domains_profile_code_rbfr_profiles_profile_code_fk" FOREIGN KEY ("profile_code") REFERENCES "public"."rbfr_profiles"("profile_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_cas" ADD CONSTRAINT "rbfr_ingredient_cas_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_certs" ADD CONSTRAINT "rbfr_ingredient_certs_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_flags" ADD CONSTRAINT "rbfr_ingredient_flags_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_incompat" ADD CONSTRAINT "rbfr_ingredient_incompat_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_incompat" ADD CONSTRAINT "rbfr_ingredient_incompat_other_id_rbfr_ingredients_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_interactions" ADD CONSTRAINT "rbfr_ingredient_interactions_ingredient_a_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_a_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_interactions" ADD CONSTRAINT "rbfr_ingredient_interactions_ingredient_b_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_b_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_interactions" ADD CONSTRAINT "rbfr_ingredient_interactions_domain_code_rbfr_role_domains_domain_code_fk" FOREIGN KEY ("domain_code") REFERENCES "public"."rbfr_role_domains"("domain_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_prices" ADD CONSTRAINT "rbfr_ingredient_prices_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_purposes" ADD CONSTRAINT "rbfr_ingredient_purposes_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_regulations" ADD CONSTRAINT "rbfr_ingredient_regulations_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_roles" ADD CONSTRAINT "rbfr_ingredient_roles_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_roles" ADD CONSTRAINT "rbfr_ingredient_roles_domain_code_rbfr_role_domains_domain_code_fk" FOREIGN KEY ("domain_code") REFERENCES "public"."rbfr_role_domains"("domain_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_textures" ADD CONSTRAINT "rbfr_ingredient_textures_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_ingredient_tox" ADD CONSTRAINT "rbfr_ingredient_tox_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_condition_codes" ADD CONSTRAINT "rbfr_formula_condition_codes_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_conditions" ADD CONSTRAINT "rbfr_formula_conditions_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_countries" ADD CONSTRAINT "rbfr_formula_countries_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_ingredients" ADD CONSTRAINT "rbfr_formula_ingredients_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_ingredients" ADD CONSTRAINT "rbfr_formula_ingredients_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_ratios" ADD CONSTRAINT "rbfr_formula_ratios_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_ratios" ADD CONSTRAINT "rbfr_formula_ratios_domain_code_rbfr_role_domains_domain_code_fk" FOREIGN KEY ("domain_code") REFERENCES "public"."rbfr_role_domains"("domain_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_reviews" ADD CONSTRAINT "rbfr_formula_reviews_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_sensory_stability_records" ADD CONSTRAINT "rbfr_formula_sensory_stability_records_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formula_versions" ADD CONSTRAINT "rbfr_formula_versions_formula_id_rbfr_formulas_formula_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."rbfr_formulas"("formula_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_formulas" ADD CONSTRAINT "rbfr_formulas_project_id_rbfr_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."rbfr_projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_version_ratios" ADD CONSTRAINT "rbfr_version_ratios_version_id_rbfr_formula_versions_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."rbfr_formula_versions"("version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_version_recipe" ADD CONSTRAINT "rbfr_version_recipe_version_id_rbfr_formula_versions_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."rbfr_formula_versions"("version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbfr_version_recipe" ADD CONSTRAINT "rbfr_version_recipe_ingredient_id_rbfr_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."rbfr_ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_cas_cas_idx" ON "rbfr_ingredient_cas" USING btree ("cas_no");--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_certs_valid_idx" ON "rbfr_ingredient_certs" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_dictionary_name_en_idx" ON "rbfr_ingredient_dictionary" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_history_ing_changed_idx" ON "rbfr_ingredient_history" USING btree ("ingredient_id","changed_at");--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_prices_ing_base_date_idx" ON "rbfr_ingredient_prices" USING btree ("ingredient_id","base_date");--> statement-breakpoint
CREATE INDEX "rbfr_ingredient_regulations_status_idx" ON "rbfr_ingredient_regulations" USING btree ("status","checked_at");--> statement-breakpoint
CREATE INDEX "rbfr_formula_reviews_formula_status_idx" ON "rbfr_formula_reviews" USING btree ("formula_id","status");--> statement-breakpoint
CREATE INDEX "rbfr_formula_reviews_reviewer_status_idx" ON "rbfr_formula_reviews" USING btree ("reviewer_id","status");--> statement-breakpoint
CREATE INDEX "rbfr_formulas_project_status_idx" ON "rbfr_formulas" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "rbfr_formulas_owner_status_idx" ON "rbfr_formulas" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "rbfr_formulas_name_idx" ON "rbfr_formulas" USING btree ("formula_name");--> statement-breakpoint
CREATE INDEX "rbfr_projects_owner_idx" ON "rbfr_projects" USING btree ("owner_id","is_closed");--> statement-breakpoint
CREATE INDEX "rbfr_audit_log_user_idx" ON "rbfr_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rbfr_audit_log_action_idx" ON "rbfr_audit_log" USING btree ("action","created_at");