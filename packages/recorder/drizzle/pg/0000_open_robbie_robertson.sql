CREATE TABLE "chain_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"underlying" text NOT NULL,
	"capture_ts" bigint NOT NULL,
	"source" text NOT NULL,
	"spot" double precision NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iv_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"underlying" text NOT NULL,
	"ts" bigint NOT NULL,
	"atm_iv_0dte" double precision,
	"atm_iv_cm30" double precision,
	"z_score" double precision,
	"roc_pct_per_min" double precision
);
--> statement-breakpoint
CREATE TABLE "signal_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"graded_at" bigint NOT NULL,
	"horizon_mins" integer NOT NULL,
	"result" text NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" bigint NOT NULL,
	"kind" text NOT NULL,
	"underlying" text NOT NULL,
	"confidence" real NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surfaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"expiry_scope" text NOT NULL,
	"as_of" bigint NOT NULL,
	"spot" double precision NOT NULL,
	"net_gex" double precision NOT NULL,
	"regime" text NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_prints" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"underlying" text NOT NULL,
	"ts" bigint NOT NULL,
	"price" double precision NOT NULL,
	"size" integer NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cs_underlying_ts" ON "chain_snapshots" USING btree ("underlying","capture_ts");--> statement-breakpoint
CREATE INDEX "iv_underlying_ts" ON "iv_samples" USING btree ("underlying","ts");--> statement-breakpoint
CREATE INDEX "out_signal" ON "signal_outcomes" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "sig_ts" ON "signals" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "surf_scope_ts" ON "surfaces" USING btree ("scope","expiry_scope","as_of");--> statement-breakpoint
CREATE INDEX "tp_underlying_ts" ON "trade_prints" USING btree ("underlying","ts");