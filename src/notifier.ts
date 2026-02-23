import { spawnSync } from "child_process";

export function sendNotification(title: string, body: string): void {
  if (process.platform !== "darwin") return;
  try {
    const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safeBody = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    spawnSync("osascript", [
      "-e",
      `display notification "${safeBody}" with title "${safeTitle}"`,
    ]);
  } catch {
    // fail silently
  }
}
