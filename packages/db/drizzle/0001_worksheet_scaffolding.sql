ALTER TABLE "resource_adapter"."prompt_templates" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_adapter"."adaptations" ADD COLUMN "abandoned_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "resource_adapter"."jobs" ADD COLUMN "concurrency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD COLUMN "completed_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "adaptations_resumable_idx" ON "resource_adapter"."adaptations" USING btree ("clerk_user_id","capability_id","lesson_slug","programme_slug","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_concurrency_key_created_at_idx" ON "resource_adapter"."jobs" USING btree ("concurrency_key","created_at" DESC NULLS LAST) WHERE "resource_adapter"."jobs"."concurrency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_active_concurrency_key_unique" ON "resource_adapter"."jobs" USING btree ("concurrency_key") WHERE "resource_adapter"."jobs"."concurrency_key" is not null and "resource_adapter"."jobs"."status" in ('queued', 'running');