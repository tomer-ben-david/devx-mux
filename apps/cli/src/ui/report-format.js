/**
 * Rewrites the absolute file paths of the named repository's local checkout in
 * `text` into repository-relative paths, so a report reads
 * `apps/cli/src/x.ts:35` instead of `/Users/<me>/dev/projects/<repo>/apps/cli/src/x.ts:35`.
 * Candidates without the repository segment (other checkouts, web URLs) are
 * returned unchanged. The page applies this at display time; reports on disk
 * and the JSON API stay verbatim.
 */

// A path candidate: one `/` followed by path characters, not preceded by a
// word character, `:`, or another `/` (mid-word tokens and both slashes of a
// `https://` scheme never start a match).
const PATH_LIKE = /(?<![:/\w])\/(?!\/)[\w./:-]+/g;

export function toRepoRelativePaths(text, repository) {
  const marker = `/${repository}/`;
  return text.replace(PATH_LIKE, (candidate) => {
    const start = candidate.indexOf(marker);
    return start === -1 ? candidate : candidate.slice(start + marker.length);
  });
}
