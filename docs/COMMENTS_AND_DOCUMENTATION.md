# Comments and documentation

Comment where the code cannot speak for itself, and nowhere else. Surplus
comments are not free: they age badly, they drift out of step with the code
around them, and they train the next reader to skim past the comments that
matter.

Do not write:

- **Restatements.** A comment that says what the next line already says.
- **Justifications for the change.** "We switched to X because Y", "this is
  needed so that Z". That is commit message and pull request material. A
  comment pins it to the file long after the alternative it argues against has
  been forgotten.
- **Conversation residue.** "As discussed", "for now", "this replaces the old
  approach", "note that we decided to", "deliberately". If a line only makes
  sense to someone who watched the code being written, delete it.
- **History.** Git records what changed and when. A comment describing what the
  code used to do is stale the moment it lands.
- **Docstrings that repeat the signature.** The types already say what the
  parameters are and what comes back.
- **Value judgements.** "which is easy to conflate", "this is obviously fine",
  "simply". Describe what the code does; do not editorialise about how hard,
  obvious or elegant it is.
- **Speculative edge cases.** A caveat for something that will not happen.
  There are infinite such cases and we do not mention the others.
- **Explanations of the self-evident.** An `.env.example` key does not need a
  paragraph explaining what an API key is.

Do write, briefly:

- A constraint that is not visible from the surrounding code: a wire format to
  match, an ordering requirement, a workaround for an upstream bug — link the
  issue.
- A warning where the obvious simplification is wrong, so the next person does
  not tidy a bug back in.

The same test applies to this directory: a new document needs a reader and a
job. Prefer extending an existing one, and do not restate what the code, the
schema or the `package.json` scripts already state. Length is a signal — when a
document grows past what a reader will hold, it has usually absorbed detail that
belongs in the code.

Proportionality is the test throughout. A small change does not need a
paragraph, and a comment nobody would miss should not be checked in.

When reviewing a pull request, treat surplus comments and documentation as
findings rather than cosmetics, and say plainly when a comment should simply be
deleted. Claude can run that pass on its own with `/review-comments`.
