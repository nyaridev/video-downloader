export function normalizeOutputPath(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  // UNC paths (\\server\share\...)
  if (/^\\\\/.test(trimmed)) {
    return trimmed.replace(/[\\/]+/g, "\\");
  }

  // Unix absolute paths (/home/user/...)
  if (trimmed.startsWith("/")) {
    return trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  }

  // Windows drive paths and relative paths — accept both / and \
  return trimmed.replace(/[\\/]+/g, (match) => (match.includes("\\") ? "\\" : "/"));
}
