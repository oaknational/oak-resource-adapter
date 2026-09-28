ALTER TABLE "resource_adapter"."prompt_templates" DROP CONSTRAINT "prompt_templates_identifier_version_key";--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ALTER COLUMN "reason" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "resource_adapter"."prompt_templates" DROP COLUMN "version";--> statement-breakpoint
-- Rows written before 0001 carry its '' default and would fail the check below.
UPDATE "resource_adapter"."suggested_transformations"
SET "reason" = 'No reason was recorded.'
WHERE "reason" !~ '[^[:space:]]';--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD CONSTRAINT "suggested_transformations_reason_check" CHECK ("resource_adapter"."suggested_transformations"."reason" ~ '[^[:space:]]');