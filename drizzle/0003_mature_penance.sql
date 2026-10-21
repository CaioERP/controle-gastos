CREATE TYPE "public"."asset_class" AS ENUM('fixed_income', 'stocks', 'fii', 'etf', 'funds', 'treasury', 'crypto', 'pension', 'other');--> statement-breakpoint
CREATE TYPE "public"."benchmark_code" AS ENUM('cdi', 'selic', 'ipca', 'ibov');--> statement-breakpoint
CREATE TYPE "public"."investment_indexer" AS ENUM('cdi', 'ipca', 'selic', 'prefixado', 'other');--> statement-breakpoint
CREATE TYPE "public"."investment_tx_type" AS ENUM('buy', 'sell', 'income', 'tax', 'fee', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('brapi', 'tesouro', 'coingecko', 'pluggy', 'manual');--> statement-breakpoint
CREATE TABLE "asset_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"price_cents" bigint NOT NULL,
	"source" "price_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"ticker" text,
	"isin" text,
	"cnpj" text,
	"name" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"issuer" text,
	"indexer" "investment_indexer",
	"rate_bps" integer,
	"maturity_date" date,
	"is_tax_exempt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "benchmark_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark" "benchmark_code" NOT NULL,
	"date" date NOT NULL,
	"value_micros" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"source" "source" NOT NULL,
	"external_id" text NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"average_price_cents" bigint,
	"invested_cents" bigint DEFAULT 0 NOT NULL,
	"current_value_cents" bigint DEFAULT 0 NOT NULL,
	"net_value_cents" bigint,
	"profit_cents" bigint,
	"as_of_date" date NOT NULL,
	"is_redeemed" boolean DEFAULT false NOT NULL,
	"user_edited_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "source" NOT NULL,
	"external_id" text NOT NULL,
	"type" "investment_tx_type" NOT NULL,
	"date" date NOT NULL,
	"quantity" numeric(20, 8),
	"unit_price_cents" bigint,
	"amount_cents" bigint NOT NULL,
	"fee_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"description" text,
	"linked_transaction_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"cash_accounts_cents" bigint DEFAULT 0 NOT NULL,
	"investments_cents" bigint DEFAULT 0 NOT NULL,
	"open_invoices_cents" bigint DEFAULT 0 NOT NULL,
	"future_installments_cents" bigint DEFAULT 0 NOT NULL,
	"assets_cents" bigint DEFAULT 0 NOT NULL,
	"liabilities_cents" bigint DEFAULT 0 NOT NULL,
	"net_worth_cents" bigint DEFAULT 0 NOT NULL,
	"breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "net_worth_snapshots_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "asset_prices" ADD CONSTRAINT "asset_prices_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_prices_asset_date_uq" ON "asset_prices" USING btree ("asset_id","date");--> statement-breakpoint
CREATE INDEX "assets_ticker_idx" ON "assets" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "assets_asset_class_idx" ON "assets" USING btree ("asset_class");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_series_benchmark_date_uq" ON "benchmark_series" USING btree ("benchmark","date");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_source_external_uq" ON "holdings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "holdings_account_idx" ON "holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "holdings_asset_idx" ON "holdings" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transactions_source_external_uq" ON "investment_transactions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "investment_transactions_holding_date_idx" ON "investment_transactions" USING btree ("holding_id","date");--> statement-breakpoint
CREATE INDEX "investment_transactions_linked_tx_idx" ON "investment_transactions" USING btree ("linked_transaction_id");