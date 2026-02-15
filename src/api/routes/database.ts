import type http from "node:http";
import { handleDatabaseRoute } from "../database.js";
import type { ServerState } from "../types.js";

export async function handleDatabaseRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  _method: string,
  state: ServerState,
): Promise<boolean> {
  if (pathname.startsWith("/api/database/")) {
    return handleDatabaseRoute(req, res, state.runtime, pathname);
  }
  return false;
}
