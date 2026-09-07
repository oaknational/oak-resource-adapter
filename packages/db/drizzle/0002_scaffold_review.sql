ALTER TABLE "resource_adapter"."adaptations" ADD COLUMN "replacement_request_id" uuid;--> statement-breakpoint
ALTER TABLE "resource_adapter"."adaptations" ADD CONSTRAINT "adaptations_replacement_request_id_unique" UNIQUE("replacement_request_id");--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD COLUMN "undo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD COLUMN "accepted_at" timestamp (3) with time zone;
--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD CONSTRAINT "suggested_transformations_undo_count_check" CHECK ("resource_adapter"."suggested_transformations"."undo_count" >= 0);--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD CONSTRAINT "transformation_attempts_attempt_number_check" CHECK ("resource_adapter"."transformation_attempts"."attempt_number" >= 1);--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD CONSTRAINT "transformation_attempts_acceptance_check" CHECK ("resource_adapter"."transformation_attempts"."accepted_at" IS NULL OR "resource_adapter"."transformation_attempts"."completed_at" IS NOT NULL);--> statement-breakpoint
-- Work already applied counts as accepted. The pattern covers every internal
-- suggestion-generation kind, which are operations rather than teacher choices.
UPDATE "resource_adapter"."transformation_attempts" AS "attempt"
SET "accepted_at" = "attempt"."completed_at"
FROM "resource_adapter"."transformations" AS "transformation",
     "resource_adapter"."jobs" AS "job"
WHERE "attempt"."transformation_id" = "transformation"."id"
  AND "attempt"."job_id" = "job"."id"
  AND "attempt"."completed_at" IS NOT NULL
  AND "job"."status" = 'succeeded'
  AND "transformation"."kind" NOT LIKE 'suggestions.%';
