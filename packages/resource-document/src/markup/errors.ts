import { ResourceDocumentParseError } from "../errors.js";

export function invalidMarkup(
  message: string,
  line?: number,
): ResourceDocumentParseError {
  return new ResourceDocumentParseError(
    "invalid_markup",
    line === undefined ? message : `${message} (line ${line})`,
    line === undefined ? {} : { line },
  );
}

/** Annotates a markup failure with the innermost enclosing line, once. */
export function atLine<Result>(line: number, parse: () => Result): Result {
  try {
    return parse();
  } catch (error) {
    if (
      error instanceof ResourceDocumentParseError &&
      error.code === "invalid_markup" &&
      error.context.line === undefined
    ) {
      throw invalidMarkup(error.message, line);
    }
    throw error;
  }
}
