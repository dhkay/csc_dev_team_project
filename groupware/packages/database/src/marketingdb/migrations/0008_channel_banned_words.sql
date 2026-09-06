CREATE TABLE "marketing_channel_banned_word_links" (
	"banned_word_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_channel_banned_word_links_banned_word_id_channel_id_pk" PRIMARY KEY("banned_word_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "marketing_channel_banned_word_links" ADD CONSTRAINT "marketing_channel_banned_word_links_banned_word_id_marketing_banned_words_id_fk" FOREIGN KEY ("banned_word_id") REFERENCES "public"."marketing_banned_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_channel_banned_word_links" ADD CONSTRAINT "marketing_channel_banned_word_links_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_channel_banned_word_links_channel_idx" ON "marketing_channel_banned_word_links" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_banned_word_links_org_idx" ON "marketing_channel_banned_word_links" USING btree ("organization_id");