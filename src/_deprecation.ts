/**
 * One-shot console.warn helpers for renamed input fields.
 *
 * Each (oldName, newName) pair warns at most once per process. Call
 * {@link _resetWarned} from tests to keep them independent.
 */

const warned = new Set<string>();

export function warnDeprecatedField(
  oldName: string,
  newName: string,
  removal = '1.0',
): void {
  if (warned.has(oldName)) {
    return;
  }
  warned.add(oldName);
  // eslint-disable-next-line no-console
  console.warn(
    `@foxnose/langchain: ${oldName} is deprecated; use ${newName} instead. ` +
      `${oldName} will be removed in @foxnose/langchain ${removal}.`,
  );
}

/** Internal — only for tests. */
export function _resetWarned(): void {
  warned.clear();
}
