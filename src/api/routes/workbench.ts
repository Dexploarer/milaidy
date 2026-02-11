import http from "node:http";
import { type ServerState } from "../types.js";
import { readJsonBody, json, error } from "../utils.js";

export async function handleWorkbenchRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  // ── GET /api/workbench/overview ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/overview") {
    const goals: unknown[] = [];
    const todos: unknown[] = [];
    const summary = {
      totalGoals: 0,
      completedGoals: 0,
      totalTodos: 0,
      completedTodos: 0,
    };
    const autonomy = { enabled: true, thinking: false };
    let goalsAvailable = false;
    let todosAvailable = false;

    if (state.runtime) {
      // Goals: access via the GOAL_DATA service registered by @elizaos/plugin-goals
      try {
        const goalService = state.runtime.getService("GOAL_DATA" as never) as {
          getDataService?: () => {
            getGoals: (
              filters: Record<string, unknown>,
            ) => Promise<Record<string, unknown>[]>;
          } | null;
        } | null;
        const goalData = goalService?.getDataService?.();
        goalsAvailable = goalData != null;
        if (goalData) {
          const dbGoals = await goalData.getGoals({
            ownerId: state.runtime.agentId,
            ownerType: "agent",
          });
          goals.push(...dbGoals);
          summary.totalGoals = dbGoals.length;
          summary.completedGoals = dbGoals.filter(
            (g) => g.isCompleted === true,
          ).length;
        }
      } catch {
        // Plugin not loaded or errored — goals unavailable
      }

      // Todos: create a data service on the fly (plugin-todo pattern)
      try {
        const todoModuleId = "@elizaos/plugin-todo";
        const todoModule = (await import(todoModuleId)) as unknown as Record<
          string,
          unknown
        >;
        const createTodoDataService = todoModule.createTodoDataService as
          | ((rt: unknown) => {
              getTodos: (
                filters: Record<string, unknown>,
              ) => Promise<Record<string, unknown>[]>;
            })
          | undefined;
        if (createTodoDataService) {
          const todoData = createTodoDataService(state.runtime);
          todosAvailable = true;
          const dbTodos = await todoData.getTodos({
            agentId: state.runtime.agentId,
          });
          todos.push(...dbTodos);
          summary.totalTodos = dbTodos.length;
          summary.completedTodos = dbTodos.filter(
            (t) => t.isCompleted === true,
          ).length;
        }
      } catch {
        // Plugin not loaded or errored — todos unavailable
      }
    }

    json(res, {
      goals,
      todos,
      summary,
      autonomy,
      goalsAvailable,
      todosAvailable,
    });
    return true;
  }

  // ── PATCH /api/workbench/goals/:id ───────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/goals/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const goalId = pathname.slice("/api/workbench/goals/".length);
    const body = await readJsonBody(req, res);
    if (!body) return true;
    json(res, { ok: true, goalId, updated: body });
    return true;
  }

  // ── POST /api/workbench/goals ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/goals") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const body = await readJsonBody(req, res);
    if (!body) return true;
    json(res, { ok: true, goal: body });
    return true;
  }

  // ── PATCH /api/workbench/todos/:id ───────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/todos/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const todoId = pathname.slice("/api/workbench/todos/".length);
    const body = await readJsonBody(req, res);
    if (!body) return true;
    json(res, { ok: true, todoId, updated: body });
    return true;
  }

  // ── POST /api/workbench/todos ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const body = await readJsonBody(req, res);
    if (!body) return true;
    json(res, { ok: true, todo: body });
    return true;
  }

  return false;
}
