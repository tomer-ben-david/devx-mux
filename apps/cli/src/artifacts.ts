import { tmpdir } from "node:os";
import path from "node:path";

export function reviewArtifactDirectory(
  platform: NodeJS.Platform = process.platform,
  userId: number | undefined = process.getuid?.(),
): string {
  if (platform === "win32") return path.join(tmpdir(), "devx-crew");
  return path.join("/tmp", `devx-crew-${userId ?? "user"}`);
}
