import { readFileSync } from "node:fs";
import { FIXTURE_PATH } from "./global-setup";

export function fixtures() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as {
    projectId: string;
    planId: string;
    clientId: string;
    pendingTaskId: string;
    approvedTaskId: string;
    validToken: string;
    revokedToken: string;
    expiredToken: string;
  };
}
