/**
 * Last path segment of a remote address, without the `.git` suffix.
 *
 * Mirrors `git::clone::repo_name_from_url` in Rust: the clone dialog pre-fills
 * the folder name from here, and the backend falls back to the same rule when the
 * field is left empty, so both sides must agree. Handles `https://host/o/repo.git`,
 * `ssh://git@host:22/o/repo` and the scp-style `git@host:o/repo.git` — plus a
 * Windows-style local path, where the separator is a backslash.
 *
 * Returns an empty string when the address carries no usable segment; the caller
 * then treats the name as something the user has to type.
 */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[/\\]+$/, "");
  const segments = trimmed.split(/[/:\\]/);
  const last = segments[segments.length - 1] ?? "";
  return last.endsWith(".git") ? last.slice(0, -".git".length) : last;
}