/**
 * Guards against spreadsheet formula injection (the queue lives in a Google
 * Sheet). Subjects can't start with = + - @; body lines can't start with
 * = + @, and the body as a whole can't start with '-'. Lines starting with
 * '-' are allowed later in the body so bullet lists keep working.
 *
 * Messages are shown to the user, so they say what to change.
 */

const SUBJECT_FORBIDDEN_START = ["=", "+", "-", "@"];
const BODY_LINE_FORBIDDEN_START = ["=", "+", "@"];

function startsWithAny(text: string, chars: readonly string[]): string | null {
  const first = text.trimStart().charAt(0);
  return chars.includes(first) ? first : null;
}

export function subjectProblem(subject: string): string | null {
  const c = startsWithAny(subject, SUBJECT_FORBIDDEN_START);
  return c ? `Subject can't start with '${c}'. Please rephrase.` : null;
}

export function bodyProblem(body: string): string | null {
  const first = startsWithAny(body, ["-"]);
  if (first) return `The email can't start with '${first}'. Please rephrase.`;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const c = startsWithAny(lines[i]!, BODY_LINE_FORBIDDEN_START);
    if (c) return `Line ${i + 1} of the email can't start with '${c}'. Please rephrase.`;
  }
  return null;
}
