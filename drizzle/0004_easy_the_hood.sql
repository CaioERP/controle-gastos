CREATE TYPE "public"."limit_period" AS ENUM('monthly', 'weekly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'telegram', 'push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('threshold_80', 'threshold_100', 'pace_warning', 'unusual_expense', 'invoice_due_soon', 'consent_expiring', 'sync_error', 'price_hike', 'cancelled_subscription');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurrence_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"telegram" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"entity_type" text,
	"entity_id" uuid,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"read_at" timestamp with time zone,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"description" text NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"payment_method" "payment_method",
	"frequency" "recurrence_frequency" DEFAULT 'monthly' NOT NULL,
	"expected_day" smallint,
	"amount_cents" bigint NOT NULL,
	"tolerance_percent" integer DEFAULT 10 NOT NULL,
	"status" "recurrence_status" DEFAULT 'active' NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"first_date" date NOT NULL,
	"last_date" date NOT NULL,
	"last_amount_cents" bigint NOT NULL,
	"auto_detected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_limit_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"limit_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"threshold" integer NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"payment_method" "payment_method",
	"account_id" uuid,
	"period" "limit_period" DEFAULT 'monthly' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"thresholds" integer[] DEFAULT '{80, 100}' NOT NULL,
	"notify_pace" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limit_dispatches" ADD CONSTRAINT "spending_limit_dispatches_limit_id_spending_limits_id_fk" FOREIGN KEY ("limit_id") REFERENCES "public"."spending_limits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limits" ADD CONSTRAINT "spending_limits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limits" ADD CONSTRAINT "spending_limits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_fingerprint_idx" ON "notifications" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "notifications_read_created_idx" ON "notifications" USING btree ("read_at","created_at");--> statement-breakpoint
CREATE INDEX "recurrences_status_idx" ON "recurrences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recurrences_category_idx" ON "recurrences" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "recurrences_merchant_idx" ON "recurrences" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "limit_dispatch_uniq_idx" ON "spending_limit_dispatches" USING btree ("limit_id","period_key","threshold");--> statement-breakpoint
CREATE INDEX "spending_limits_category_idx" ON "spending_limits" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "spending_limits_payment_method_idx" ON "spending_limits" USING btree ("payment_method");--> statement-breakpoint
CREATE INDEX "spending_limits_active_idx" ON "spending_limits" USING btree ("is_active");