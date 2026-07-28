CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."resource_document_origin" AS ENUM('oak_resource', 'generated');--> statement-breakpoint
CREATE TABLE "attempt_input_resource_documents" (
	"generation_attempt_id" uuid NOT NULL,
	"input_role" text NOT NULL,
	"position" integer NOT NULL,
	"resource_document_id" uuid NOT NULL,
	CONSTRAINT "attempt_input_resource_documents_pkey" PRIMARY KEY("generation_attempt_id","resource_document_id"),
	CONSTRAINT "attempt_input_resource_documents_attempt_position_key" UNIQUE("generation_attempt_id","position"),
	CONSTRAINT "attempt_input_resource_documents_position_check" CHECK ("attempt_input_resource_documents"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"attempt_number" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"generation_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_attempts_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "generation_attempts_generation_id_attempt_number_key" UNIQUE("generation_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"capability_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"lesson_slug" text,
	"programme_slug" text,
	"request" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"input" jsonb NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp (3) with time zone,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"workflow_run_id" text,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "jobs_workflow_run_id_unique" UNIQUE("workflow_run_id")
);
--> statement-breakpoint
CREATE TABLE "model_invocations" (
	"completed_at" timestamp (3) with time zone,
	"correlation_key" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"error_name" text,
	"error_status" integer,
	"generation_attempt_id" uuid NOT NULL,
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
	"transport" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
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
CREATE TABLE "resource_artifacts" (
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
CREATE TABLE "resource_documents" (
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"document" jsonb NOT NULL,
	"generation_attempt_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" "resource_document_origin" NOT NULL,
	"position" integer,
	"retrieved_at" timestamp (3) with time zone,
	"source_id" text,
	"source_reference" jsonb,
	CONSTRAINT "resource_documents_generation_attempt_id_position_key" UNIQUE("generation_attempt_id","position"),
	CONSTRAINT "resource_documents_generated_has_attempt_and_position" CHECK (("resource_documents"."origin" = 'generated'
            AND "resource_documents"."generation_attempt_id" IS NOT NULL
            AND "resource_documents"."position" IS NOT NULL
            AND "resource_documents"."position" >= 0)
       OR ("resource_documents"."origin" <> 'generated'
            AND "resource_documents"."generation_attempt_id" IS NULL
            AND "resource_documents"."position" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "attempt_input_resource_documents" ADD CONSTRAINT "attempt_input_resource_documents_attempt_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_input_resource_documents" ADD CONSTRAINT "attempt_input_resource_documents_document_fk" FOREIGN KEY ("resource_document_id") REFERENCES "public"."resource_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_invocations" ADD CONSTRAINT "model_invocations_generation_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_invocations" ADD CONSTRAINT "model_invocations_prompt_template_id_prompt_templates_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_artifacts" ADD CONSTRAINT "resource_artifacts_resource_document_id_resource_documents_id_fk" FOREIGN KEY ("resource_document_id") REFERENCES "public"."resource_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_documents" ADD CONSTRAINT "resource_documents_generation_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_input_resource_documents_document_idx" ON "attempt_input_resource_documents" USING btree ("resource_document_id");--> statement-breakpoint
CREATE INDEX "generations_clerk_user_id_created_at_idx" ON "generations" USING btree ("clerk_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_status_created_at_idx" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "model_invocations_generation_attempt_id_idx" ON "model_invocations" USING btree ("generation_attempt_id");--> statement-breakpoint
CREATE INDEX "model_invocations_prompt_template_id_idx" ON "model_invocations" USING btree ("prompt_template_id");--> statement-breakpoint
CREATE INDEX "resource_artifacts_resource_document_id_idx" ON "resource_artifacts" USING btree ("resource_document_id");--> statement-breakpoint
CREATE INDEX "resource_documents_generation_attempt_id_idx" ON "resource_documents" USING btree ("generation_attempt_id");--> statement-breakpoint
CREATE INDEX "resource_documents_source_id_idx" ON "resource_documents" USING btree ("source_id") WHERE "resource_documents"."origin" <> 'generated';