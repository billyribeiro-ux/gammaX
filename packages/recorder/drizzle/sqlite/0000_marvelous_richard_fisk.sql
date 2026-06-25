CREATE TABLE `chain_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`underlying` text NOT NULL,
	`capture_ts` integer NOT NULL,
	`source` text NOT NULL,
	`spot` real NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cs_underlying_ts` ON `chain_snapshots` (`underlying`,`capture_ts`);--> statement-breakpoint
CREATE TABLE `iv_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`underlying` text NOT NULL,
	`ts` integer NOT NULL,
	`atm_iv_0dte` real,
	`atm_iv_cm30` real,
	`z_score` real,
	`roc_pct_per_min` real
);
--> statement-breakpoint
CREATE INDEX `iv_underlying_ts` ON `iv_samples` (`underlying`,`ts`);--> statement-breakpoint
CREATE TABLE `signal_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` text NOT NULL,
	`graded_at` integer NOT NULL,
	`horizon_mins` integer NOT NULL,
	`result` text NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `out_signal` ON `signal_outcomes` (`signal_id`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`underlying` text NOT NULL,
	`confidence` real NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sig_ts` ON `signals` (`ts`);--> statement-breakpoint
CREATE TABLE `surfaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`expiry_scope` text NOT NULL,
	`as_of` integer NOT NULL,
	`spot` real NOT NULL,
	`net_gex` real NOT NULL,
	`regime` text NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `surf_scope_ts` ON `surfaces` (`scope`,`expiry_scope`,`as_of`);--> statement-breakpoint
CREATE TABLE `trade_prints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`underlying` text NOT NULL,
	`ts` integer NOT NULL,
	`price` real NOT NULL,
	`size` integer NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tp_underlying_ts` ON `trade_prints` (`underlying`,`ts`);