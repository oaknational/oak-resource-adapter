UPDATE "resource_adapter"."transformations"
SET "kind" = 'scaffold-add-task-glossary'
WHERE "kind" = 'scaffold-add-task-vocabulary';--> statement-breakpoint
UPDATE "resource_adapter"."suggested_transformations"
SET "kind" = 'scaffold-add-task-glossary'
WHERE "kind" = 'scaffold-add-task-vocabulary';
