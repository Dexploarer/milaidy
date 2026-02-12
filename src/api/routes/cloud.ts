import type http from "node:http";
import { type CloudRouteState, handleCloudRoute } from "../cloud-routes.js";
import type { ServerState } from "../types.js";

export async function handleCloudRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
): Promise<boolean> {
  if (pathname.startsWith("/api/cloud/")) {
    const cloudState: CloudRouteState = {
      config: state.config,
      cloudManager: state.cloudManager,
      runtime: state.runtime,
    };
    return handleCloudRoute(req, res, pathname, method, cloudState);
  }
  return false;
}
