-- IF NOT EXISTS is a hand edit to what drizzle-kit generated. In staging and
-- production this schema is created by Terraform in oaknational/Cloud-Config,
-- which also owns it and grants the app roles on it, so a bare CREATE SCHEMA
-- fails there. Locally the schema does not exist yet and this creates it.
CREATE SCHEMA IF NOT EXISTS "resource_adapter";
--> statement-breakpoint
CREATE TYPE "resource_adapter"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "resource_adapter"."resource_document_origin" AS ENUM('oak_resource', 'generated');--> statement-breakpoint
CREATE TABLE "resource_adapter"."adaptations" (
	"capability_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"head_resource_document_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_slug" text,
	"programme_slug" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."jobs" (
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"input" jsonb NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp (3) with time zone,
	"status" "resource_adapter"."job_status" DEFAULT 'queued' NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"workflow_run_id" text,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "jobs_workflow_run_id_unique" UNIQUE("workflow_run_id")
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."model_invocations" (
	"completed_at" timestamp (3) with time zone,
	"correlation_key" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"error_name" text,
	"error_status" integer,
	"id" uuid PRIMARY KEY NOT NULL,
	"input_tokens" integer,
	"model" text NOT NULL,
	"output_tokens" integer,
	"prompt_template_id" uuid,
	"provider" text NOT NULL,
	"provider_response_id" text,
	"request" jsonb NOT NULL,
	"role" text NOT NULL,
	"response" jsonb,
	"started_at" timestamp (3) with time zone NOT NULL,
	"transformation_attempt_id" uuid NOT NULL,
	"transport" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."prompt_templates" (
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"git_sha" text,
	"hash" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"template" text NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "prompt_templates_hash_unique" UNIQUE("hash"),
	CONSTRAINT "prompt_templates_identifier_version_key" UNIQUE("identifier","version")
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."resource_artifacts" (
	"byte_size" bigint NOT NULL,
	"checksum" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"format" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime_type" text NOT NULL,
	"resource_document_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	CONSTRAINT "resource_artifacts_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."resource_documents" (
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"document" jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" "resource_adapter"."resource_document_origin" NOT NULL,
	"position" integer,
	"retrieved_at" timestamp (3) with time zone,
	"source_id" text,
	"source_reference" jsonb,
	"transformation_attempt_id" uuid,
	CONSTRAINT "resource_documents_attempt_position_key" UNIQUE("transformation_attempt_id","position"),
	CONSTRAINT "resource_documents_generated_has_attempt_and_position" CHECK (("resource_adapter"."resource_documents"."origin" = 'generated'
            AND "resource_adapter"."resource_documents"."transformation_attempt_id" IS NOT NULL
            AND "resource_adapter"."resource_documents"."position" IS NOT NULL
            AND "resource_adapter"."resource_documents"."position" >= 0)
       OR ("resource_adapter"."resource_documents"."origin" <> 'generated'
            AND "resource_adapter"."resource_documents"."transformation_attempt_id" IS NULL
            AND "resource_adapter"."resource_documents"."position" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."suggested_transformations" (
	"accepted_transformation_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer NOT NULL,
	"resource_document_id" uuid NOT NULL,
	"target_block_id" text,
	"transformation_attempt_id" uuid NOT NULL,
	CONSTRAINT "suggested_transformations_attempt_position_key" UNIQUE("transformation_attempt_id","position"),
	CONSTRAINT "suggested_transformations_accepted_key" UNIQUE("accepted_transformation_id"),
	CONSTRAINT "suggested_transformations_position_check" CHECK ("resource_adapter"."suggested_transformations"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."transformation_attempts" (
	"attempt_number" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"transformation_id" uuid NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transformation_attempts_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "transformation_attempts_number_key" UNIQUE("transformation_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."transformation_inputs" (
	"input_role" text NOT NULL,
	"position" integer NOT NULL,
	"resource_document_id" uuid NOT NULL,
	"transformation_id" uuid NOT NULL,
	CONSTRAINT "transformation_inputs_pkey" PRIMARY KEY("transformation_id","resource_document_id"),
	CONSTRAINT "transformation_inputs_position_key" UNIQUE("transformation_id","position"),
	CONSTRAINT "transformation_inputs_position_check" CHECK ("resource_adapter"."transformation_inputs"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resource_adapter"."transformations" (
	"adaptation_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_block_id" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transformations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "resource_adapter"."adaptations" ADD CONSTRAINT "adaptations_head_document_fk" FOREIGN KEY ("head_resource_document_id") REFERENCES "resource_adapter"."resource_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."model_invocations" ADD CONSTRAINT "model_invocations_attempt_fk" FOREIGN KEY ("transformation_attempt_id") REFERENCES "resource_adapter"."transformation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."model_invocations" ADD CONSTRAINT "model_invocations_prompt_template_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "resource_adapter"."prompt_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."resource_artifacts" ADD CONSTRAINT "resource_artifacts_document_fk" FOREIGN KEY ("resource_document_id") REFERENCES "resource_adapter"."resource_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."resource_documents" ADD CONSTRAINT "resource_documents_attempt_fk" FOREIGN KEY ("transformation_attempt_id") REFERENCES "resource_adapter"."transformation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD CONSTRAINT "suggested_transformations_document_fk" FOREIGN KEY ("resource_document_id") REFERENCES "resource_adapter"."resource_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD CONSTRAINT "suggested_transformations_attempt_fk" FOREIGN KEY ("transformation_attempt_id") REFERENCES "resource_adapter"."transformation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."suggested_transformations" ADD CONSTRAINT "suggested_transformations_accepted_fk" FOREIGN KEY ("accepted_transformation_id") REFERENCES "resource_adapter"."transformations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD CONSTRAINT "transformation_attempts_transformation_fk" FOREIGN KEY ("transformation_id") REFERENCES "resource_adapter"."transformations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_attempts" ADD CONSTRAINT "transformation_attempts_job_fk" FOREIGN KEY ("job_id") REFERENCES "resource_adapter"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_inputs" ADD CONSTRAINT "transformation_inputs_transformation_fk" FOREIGN KEY ("transformation_id") REFERENCES "resource_adapter"."transformations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformation_inputs" ADD CONSTRAINT "transformation_inputs_document_fk" FOREIGN KEY ("resource_document_id") REFERENCES "resource_adapter"."resource_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_adapter"."transformations" ADD CONSTRAINT "transformations_adaptation_id_adaptations_id_fk" FOREIGN KEY ("adaptation_id") REFERENCES "resource_adapter"."adaptations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adaptations_clerk_user_id_created_at_idx" ON "resource_adapter"."adaptations" USING btree ("clerk_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_status_created_at_idx" ON "resource_adapter"."jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "model_invocations_attempt_idx" ON "resource_adapter"."model_invocations" USING btree ("transformation_attempt_id");--> statement-breakpoint
CREATE INDEX "model_invocations_prompt_template_idx" ON "resource_adapter"."model_invocations" USING btree ("prompt_template_id");--> statement-breakpoint
CREATE INDEX "resource_artifacts_document_idx" ON "resource_adapter"."resource_artifacts" USING btree ("resource_document_id");--> statement-breakpoint
CREATE INDEX "resource_documents_attempt_idx" ON "resource_adapter"."resource_documents" USING btree ("transformation_attempt_id");--> statement-breakpoint
CREATE INDEX "resource_documents_source_id_idx" ON "resource_adapter"."resource_documents" USING btree ("source_id") WHERE "resource_adapter"."resource_documents"."origin" <> 'generated';--> statement-breakpoint
CREATE INDEX "suggested_transformations_document_idx" ON "resource_adapter"."suggested_transformations" USING btree ("resource_document_id");--> statement-breakpoint
CREATE INDEX "transformation_inputs_document_idx" ON "resource_adapter"."transformation_inputs" USING btree ("resource_document_id");--> statement-breakpoint
CREATE INDEX "transformations_adaptation_id_created_at_idx" ON "resource_adapter"."transformations" USING btree ("adaptation_id","created_at");