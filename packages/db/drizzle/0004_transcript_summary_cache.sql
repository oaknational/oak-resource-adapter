CREATE TABLE "resource_adapter"."transcript_summary_cache" (
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"invocation_id" uuid NOT NULL,
	"key" text PRIMARY KEY NOT NULL,
	"lesson_slug" text NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"summary" jsonb NOT NULL
);
