# Transformations

A transformation is one change a teacher can ask for. `apps/api/src/transformations`
holds the registry that names them; `transformations.kind` and
`suggested_transformations.kind` in the database key into it.

The registry also holds draft prompt experiments. Drafts are visible to the
development harness but cannot be exposed by a product capability.

## Naming

`<family>-<verb>-<artefact>`, lowercase and hyphen-separated:
`scaffold-add-word-bank`, `scaffold-simplify-instructions`,
`scaffold-chunk-tasks`.

The verb slot exists because removing, replacing and modifying a scaffold are
coming, and `scaffold-remove-word-bank` should be the obvious sibling of the kind
that added it.

A name says nothing about resource type or support level. Which resources a kind
is offered for is the capability's decision; how much support it gives is
`supportLevels`, so a menu can compare levels across kinds rather than parsing
suffixes.

## A definition

Each kind lives in its own directory under `definitions/`, holding its definition
and any prompt it needs:

```text
definitions/scaffold-add-word-bank/
  index.ts   the definition
  prompt.ts  its prompt template
```

A definition carries:

| Field                  |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| `kind`                 | The stable internal name stored in the database.                       |
| `status`               | `draft` for experiments or `active` for product-ready work.            |
| `label`                | What the teacher reads.                                                |
| `params`               | Strict arguments beyond the support level, if it takes any.            |
| `target`               | The whole document, or one node selected from declared node types.     |
| `outputs`              | What it produces, in order: a revision, companion documents, or both.  |
| `supportLevels`        | The levels of support it offers, weakest first.                        |
| `barriers`             | The pupil barriers it addresses.                                       |
| `materialRequirements` | The parts of the Oak lesson it consumes, and whether each is required. |
| `isAvailable`          | Whether to offer the kind, given the work so far.                      |
| `execution`            | `deterministic` with an `apply`, or `model` with a prompt.             |

`supportLevels` and `barriers` are optional: a kind that offers no support dial,
or addresses no particular barrier, declares neither. A level is declared with the
teacher-facing description of what it adds, because "mid" alone tells a teacher
nothing, and a kind's `params` schema is derived from the levels it declares, so
the control a teacher sees and the arguments the database accepts cannot disagree.

`outputs` declares what a run produces and in what order. Execution is checked
against it, so a kind cannot quietly return a revision where a companion document
was promised.

Node targets declare their accepted node types, for example `{ scope: "node",
nodeTypes: ["question"] }`. The same declaration validates execution and drives
the target picker; a question transformation cannot be run against an existing
paragraph or response-space ID.

An active model definition must have a structured contribution. A model without
one is necessarily a draft, and its raw text is an experiment rather than a
product transformation.

## Prompts

Prompts are defined with `defineTransformationPrompt`, which delegates to the AI
package while restricting placeholders to the transformation input vocabulary,
and take the same identifier as their kind.
Bump the prompt's `version` whenever its body changes, as
[model invocation](MODEL_INVOCATION.md) describes.

A placeholder is a requirement rather than an option. The executor sends a prompt
exactly the placeholders it declares and refuses to run one whose material the
request does not carry. So a prompt asking for `{{lessonContext}}` cannot be run
against the worksheet alone, and a prompt covering several support levels
receives `{{supportLevel}}` and branches on it. Where the levels need genuinely
different instructions, a directory can hold a prompt each.

The text every prompt shares lives in `prompt-parts/` and arrives the same way,
as placeholders: `{{identity}}`, `{{scaffoldPrinciples}}`, `{{language}}` and
`{{lessonKeywords}}`. A part is a function of the request rather than a constant,
which is what `{{language}}` needs — it states the ages behind the resource's own
key stage and year group, and cannot be known when the template is defined.

Material from outside the resource is declared through `materialRequirements`
and selectively resolved. `lesson.keywords` is the first such projection, not a
special case in the document model. Future projections can add other useful
parts of the original Oak lesson without sending every available field to every
transformation. `{{lessonKeywords}}` carries Oak's own keywords and definitions,
which a vocabulary scaffold prefers over model-authored wording for the same term.

`prompt-input.ts` serialises the resource as stable semantic text rather than raw
storage JSON. Prompts therefore depend on headings, questions, pupil content and
teacher answers, not on the incidental representation of a document schema
version.

Because the parts are variables, a stored template body stays stable when shared
text changes, so editing a part does not invalidate every prompt's version. The
exact text sent is recorded against each invocation either way.

## Running a transformation

Preparation and execution are separate stages in `execute.ts`. Preparation
validates the document, JSON params, required material and exact target node,
then renders the prompt. Execution applies deterministic work or invokes the
model. `application-service.ts` adds registry lookup and material resolution;
development routes and future job workers use that same path.

### Three schemas, three jobs

A transformation carries schemas at three layers, and they do not overlap:

| Layer             | Validates                                                     | Lives in                                             |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Params            | What the teacher chose, as stored in `transformations.params` | `defineTransformation`, derived from the declaration |
| Structured output | What the model must return for this exact request             | the prepared contribution                            |
| Document          | What a resource may contain after the change                  | `@oaknational/resource-document`                     |

A model kind with a **contribution** in `contributions/` returns structured
output rather than prose. A contribution prepares its exact schema against the
validated request, so support level can change both the model contract and the
document it produces. `invokeStructured` enforces that schema. Placement is the
contribution's decision, so a prompt cannot move a scaffold somewhere the
transformation did not intend — a scaffold lands beneath its task and before the
space a pupil writes in. Every node a contribution adds carries the contribution
ID in its extensions, which is how a later transformation removes or replaces
exactly this work.

A run ends in one of three outcomes: `APPLIED` with an ordered list of validated
document outputs and their `revised-resource` or `companion-document` purpose;
`TEXT` for a draft prompt experiment; or `UNUSABLE` when the model refused, ran
out, or returned output the schema rejected. Persisting outputs and advancing an
adaptation head belong to the caller.

Model choice lives in `apps/api/src/ai/model-roles.ts`, the one table binding
every role the service can ask for to a model and transport. `TRANSFORMATION_ROLES`
names the subset a transformation may use, so a definition cannot reach for a role
meant for something else, and an unbound role does not compile. A definition names
a role only when it needs something other than `DEFAULT_TRANSFORMATION_ROLE`.
Changing the model or the gateway behind a role is an edit to that table alone.

## Adding a kind

1. Add a directory under `definitions/` with the definition and its prompt.
2. Register it in `registry.ts`.
3. Keep it `draft` while it returns experimental text.
4. Give it a structured contribution and mark it `active`.
5. Add its active kind to each capability that should offer it.

## Which kinds a capability offers

A capability definition in `apps/api/src/capabilities` lists the kinds it offers,
in the order a teacher sees them, and the list is typed against the registry's
keys. Capability definitions may list only active kinds. Being registered exposes
nothing on its own.

`isAvailable` decides whether a listed kind is offered for a particular document
and adaptation. The rules live in `availability.ts` and compose: `always`,
`disabled`, `notAlreadyApplied`, `notAlreadyAppliedToTarget`,
`requiresNodeType`, and `all` to combine them. Availability history carries kind,
params, target and contribution identity, so target-scoped rules need not treat
applying a scaffold to two different questions as the same work.

`listTransformationsForCapability` in `service.ts` resolves a capability's kinds
and applies those rules, returning what a teacher needs to choose between them.

## Development harness

The harness catalogue, prompt preview and synchronous run endpoints live under
`/dev/transformations` and are hidden unless development routes are enabled. The
catalogue carries the Oak material catalogue too, which the harness renders as a
table of what a prompt can be given, the heading each part appears under, and
which transformations ask for it.
They do not create adaptations, jobs or database documents. The harness can use
an output as the next in-memory input, undo it, or reset the fixture, while the
same application preparation and execution services remain available to the
durable job path added later.
