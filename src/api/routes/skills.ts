import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@elizaos/core";
import { type ServerState } from "../types.js";
import { readJsonBody, json, error, decodePathComponent, validateSkillId } from "../utils.js";
import {
  discoverSkills,
  loadScanReportFromDisk,
  loadSkillAcknowledgments,
  saveSkillAcknowledgments,
  loadSkillPreferences,
  saveSkillPreferences,
} from "../discovery.js";
import { resolveDefaultAgentWorkspaceDir } from "../../providers/workspace.js";
import { saveMilaidyConfig } from "../../config/config.js";

export async function handleSkillsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // ── GET /api/skills/catalog ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/catalog") {
    try {
      const { getCatalogSkills } = await import(
        "../../services/skill-catalog-client.js"
      );
      const all = await getCatalogSkills();
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const perPage = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("perPage")) || 50),
      );
      const sort = url.searchParams.get("sort") ?? "downloads";
      const sorted = [...all];
      if (sort === "downloads")
        sorted.sort(
          (a, b) =>
            b.stats.downloads - a.stats.downloads || b.updatedAt - a.updatedAt,
        );
      else if (sort === "stars")
        sorted.sort(
          (a, b) => b.stats.stars - a.stats.stars || b.updatedAt - a.updatedAt,
        );
      else if (sort === "updated")
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
      else if (sort === "name")
        sorted.sort((a, b) =>
          (a.displayName ?? a.slug).localeCompare(b.displayName ?? b.slug),
        );

      // Resolve installed status from the AgentSkillsService
      const installedSlugs = new Set<string>();
      if (state.runtime) {
        try {
          const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
            | {
                getLoadedSkills?: () => Array<{ slug: string; source: string }>;
              }
            | undefined;
          if (svc && typeof svc.getLoadedSkills === "function") {
            for (const s of svc.getLoadedSkills()) {
              installedSlugs.add(s.slug);
            }
          }
        } catch (err) {
          logger.debug(
            `[api] Service not available: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      // Also check locally discovered skills
      for (const s of state.skills) {
        installedSlugs.add(s.id);
      }

      const start = (page - 1) * perPage;
      const skills = sorted.slice(start, start + perPage).map((s) => ({
        ...s,
        installed: installedSlugs.has(s.slug),
      }));
      json(res, {
        total: all.length,
        page,
        perPage,
        totalPages: Math.ceil(all.length / perPage),
        installedCount: installedSlugs.size,
        skills,
      });
    } catch (err) {
      error(
        res,
        `Failed to load skill catalog: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/skills/catalog/search ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/catalog/search") {
    const q = url.searchParams.get("q");
    if (!q) {
      error(res, "Missing query parameter ?q=", 400);
      return true;
    }
    try {
      const { searchCatalogSkills } = await import(
        "../../services/skill-catalog-client.js"
      );
      const limit = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("limit")) || 30),
      );
      const results = await searchCatalogSkills(q, limit);
      json(res, { query: q, count: results.length, results });
    } catch (err) {
      error(
        res,
        `Skill catalog search failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/skills/catalog/:slug ──────────────────────────────────────
  if (method === "GET" && pathname.startsWith("/api/skills/catalog/")) {
    const slug = decodePathComponent(
      pathname.slice("/api/skills/catalog/".length),
      res,
      "skill slug",
    );
    if (slug === null) return true;
    // Exclude "search" which is handled above
    if (slug && slug !== "search") {
      try {
        const { getCatalogSkill } = await import(
          "../../services/skill-catalog-client.js"
        );
        const skill = await getCatalogSkill(slug);
        if (!skill) {
          error(res, `Skill "${slug}" not found in catalog`, 404);
          return true;
        }
        json(res, { skill });
      } catch (err) {
        error(
          res,
          `Failed to fetch skill: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
      return true;
    }
  }

  // ── POST /api/skills/catalog/refresh ───────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/refresh") {
    try {
      const { refreshCatalog } = await import(
        "../../services/skill-catalog-client.js"
      );
      const skills = await refreshCatalog();
      json(res, { ok: true, count: skills.length });
    } catch (err) {
      error(
        res,
        `Catalog refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/skills/catalog/install ───────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/install") {
    const body = await readJsonBody<{ slug: string; version?: string }>(
      req,
      res,
    );
    if (!body) return true;
    if (!body.slug) {
      error(res, "Missing required field: slug", 400);
      return true;
    }

    if (!state.runtime) {
      error(res, "Agent runtime not available — start the agent first", 503);
      return true;
    }

    try {
      const service = state.runtime.getService("AGENT_SKILLS_SERVICE") as
        | {
            install?: (
              slug: string,
              opts?: { version?: string; force?: boolean },
            ) => Promise<boolean>;
            isInstalled?: (slug: string) => Promise<boolean>;
          }
        | undefined;

      if (!service || typeof service.install !== "function") {
        error(
          res,
          "AgentSkillsService not available — ensure @elizaos/plugin-agent-skills is loaded",
          501,
        );
        return true;
      }

      const alreadyInstalled =
        typeof service.isInstalled === "function"
          ? await service.isInstalled(body.slug)
          : false;

      if (alreadyInstalled) {
        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" is already installed`,
          alreadyInstalled: true,
        });
        return true;
      }

      const success = await service.install(body.slug, {
        version: body.version,
      });

      if (success) {
        // Refresh the skills list so the UI picks up the new skill
        const workspaceDir =
          state.config.agents?.defaults?.workspace ??
          resolveDefaultAgentWorkspaceDir();
        state.skills = await discoverSkills(
          workspaceDir,
          state.config,
          state.runtime,
        );

        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" installed successfully`,
        });
      } else {
        error(res, `Failed to install skill "${body.slug}"`, 500);
      }
    } catch (err) {
      error(
        res,
        `Skill install failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/skills/catalog/uninstall ─────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/uninstall") {
    const body = await readJsonBody<{ slug: string }>(req, res);
    if (!body) return true;
    if (!body.slug) {
      error(res, "Missing required field: slug", 400);
      return true;
    }

    if (!state.runtime) {
      error(res, "Agent runtime not available — start the agent first", 503);
      return true;
    }

    try {
      const service = state.runtime.getService("AGENT_SKILLS_SERVICE") as
        | {
            uninstall?: (slug: string) => Promise<boolean>;
          }
        | undefined;

      if (!service || typeof service.uninstall !== "function") {
        error(
          res,
          "AgentSkillsService not available — ensure @elizaos/plugin-agent-skills is loaded",
          501,
        );
        return true;
      }

      const success = await service.uninstall(body.slug);

      if (success) {
        // Refresh the skills list
        const workspaceDir =
          state.config.agents?.defaults?.workspace ??
          resolveDefaultAgentWorkspaceDir();
        state.skills = await discoverSkills(
          workspaceDir,
          state.config,
          state.runtime,
        );

        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" uninstalled successfully`,
        });
      } else {
        error(
          res,
          `Failed to uninstall skill "${body.slug}" — it may be a bundled skill`,
          400,
        );
      }
    } catch (err) {
      error(
        res,
        `Skill uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/skills ─────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/skills") {
    json(res, { skills: state.skills });
    return true;
  }

  // ── POST /api/skills/refresh ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/refresh") {
    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      state.skills = await discoverSkills(
        workspaceDir,
        state.config,
        state.runtime,
      );
      json(res, { ok: true, skills: state.skills });
    } catch (err) {
      error(
        res,
        `Failed to refresh skills: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/skills/:id/scan ───────────────────────────────────────────
  if (method === "GET" && pathname.match(/^\/api\/skills\/[^/]+\/scan$/)) {
    const rawSkillId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "skill ID",
    );
    if (rawSkillId === null) return true;
    const skillId = validateSkillId(rawSkillId, res);
    if (!skillId) return true;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const report = await loadScanReportFromDisk(
      skillId,
      workspaceDir,
      state.runtime,
    );
    const acks = await loadSkillAcknowledgments(state.runtime);
    const ack = acks[skillId] ?? null;
    json(res, { ok: true, report, acknowledged: !!ack, acknowledgment: ack });
    return true;
  }

  // ── POST /api/skills/:id/acknowledge ──────────────────────────────────
  if (
    method === "POST" &&
    pathname.match(/^\/api\/skills\/[^/]+\/acknowledge$/)
  ) {
    const rawSkillId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "skill ID",
    );
    if (rawSkillId === null) return true;
    const skillId = validateSkillId(rawSkillId, res);
    if (!skillId) return true;
    const body = await readJsonBody<{ enable?: boolean }>(req, res);
    if (!body) return true;

    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const report = await loadScanReportFromDisk(
      skillId,
      workspaceDir,
      state.runtime,
    );
    if (!report) {
      error(res, `No scan report found for skill "${skillId}".`, 404);
      return true;
    }
    if (report.status === "blocked") {
      error(
        res,
        `Skill "${skillId}" is blocked and cannot be acknowledged.`,
        403,
      );
      return true;
    }
    if (report.status === "clean") {
      json(res, {
        ok: true,
        message: "No findings to acknowledge.",
        acknowledged: true,
      });
      return true;
    }

    const findings = report.findings as Array<Record<string, unknown>>;
    const manifestFindings = report.manifestFindings as Array<
      Record<string, unknown>
    >;
    const totalFindings = findings.length + manifestFindings.length;

    if (state.runtime) {
      const acks = await loadSkillAcknowledgments(state.runtime);
      acks[skillId] = {
        acknowledgedAt: new Date().toISOString(),
        findingCount: totalFindings,
      };
      await saveSkillAcknowledgments(state.runtime, acks);
    }

    if (body.enable === true) {
      const skill = state.skills.find((s) => s.id === skillId);
      if (skill) {
        skill.enabled = true;
        if (state.runtime) {
          const prefs = await loadSkillPreferences(state.runtime);
          prefs[skillId] = true;
          await saveSkillPreferences(state.runtime, prefs);
        }
      }
    }

    json(res, {
      ok: true,
      skillId,
      acknowledged: true,
      enabled: body.enable === true,
      findingCount: totalFindings,
    });
    return true;
  }

  // ── POST /api/skills/create ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/create") {
    const body = await readJsonBody<{ name: string; description?: string }>(
      req,
      res,
    );
    if (!body) return true;
    const rawName = body.name?.trim();
    if (!rawName) {
      error(res, "Skill name is required", 400);
      return true;
    }

    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug.length > 64) {
      error(
        res,
        "Skill name must produce a valid slug (1-64 chars, lowercase alphanumeric + hyphens)",
        400,
      );
      return true;
    }

    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const skillDir = path.join(workspaceDir, "skills", slug);

    if (fs.existsSync(skillDir)) {
      error(res, `Skill "${slug}" already exists`, 409);
      return true;
    }

    const description =
      body.description?.trim() || "Describe what this skill does.";
    const template = `---\nname: ${slug}\ndescription: ${description.replace(/"/g, '\\"')}\n---\n\n## Instructions\n\n[Describe what this skill does and how the agent should use it]\n\n## When to Use\n\nUse this skill when [describe trigger conditions].\n\n## Steps\n\n1. [First step]\n2. [Second step]\n3. [Third step]\n`;

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), template, "utf-8");

    state.skills = await discoverSkills(
      workspaceDir,
      state.config,
      state.runtime,
    );
    const skill = state.skills.find((s) => s.id === slug);
    json(res, {
      ok: true,
      skill: skill ?? { id: slug, name: slug, description, enabled: true },
      path: skillDir,
    });
    return true;
  }

  // ── POST /api/skills/:id/open ─────────────────────────────────────────
  if (method === "POST" && pathname.match(/^\/api\/skills\/[^/]+\/open$/)) {
    const rawSkillId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "skill ID",
    );
    if (rawSkillId === null) return true;
    const skillId = validateSkillId(rawSkillId, res);
    if (!skillId) return true;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const candidates = [
      path.join(workspaceDir, "skills", skillId),
      path.join(workspaceDir, "skills", ".marketplace", skillId),
    ];
    let skillPath: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, "SKILL.md"))) {
        skillPath = c;
        break;
      }
    }

    // Try AgentSkillsService for bundled skills — copy to workspace for editing
    if (!skillPath && state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | {
              getLoadedSkills?: () => Array<{
                slug: string;
                path: string;
                source: string;
              }>;
            }
          | undefined;
        if (svc?.getLoadedSkills) {
          const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
          if (loaded) {
            if (loaded.source === "bundled" || loaded.source === "plugin") {
              const targetDir = path.join(workspaceDir, "skills", skillId);
              if (!fs.existsSync(targetDir)) {
                fs.cpSync(loaded.path, targetDir, { recursive: true });
                state.skills = await discoverSkills(
                  workspaceDir,
                  state.config,
                  state.runtime,
                );
              }
              skillPath = targetDir;
            } else {
              skillPath = loaded.path;
            }
          }
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!skillPath) {
      error(res, `Skill "${skillId}" not found`, 404);
      return true;
    }

    const { execFile } = await import("node:child_process");
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer"
          : "xdg-open";
    execFile(opener, [skillPath], (err) => {
      if (err)
        logger.warn(
          `[milaidy-api] Failed to open skill folder: ${err.message}`,
        );
    });
    json(res, { ok: true, path: skillPath });
    return true;
  }

  // ── DELETE /api/skills/:id ────────────────────────────────────────────
  if (
    method === "DELETE" &&
    pathname.match(/^\/api\/skills\/[^/]+$/) &&
    !pathname.includes("/marketplace")
  ) {
    const rawSkillId = decodePathComponent(
      pathname.slice("/api/skills/".length),
      res,
      "skill ID",
    );
    if (rawSkillId === null) return true;
    const skillId = validateSkillId(rawSkillId, res);
    if (!skillId) return true;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const wsDir = path.join(workspaceDir, "skills", skillId);
    const mpDir = path.join(workspaceDir, "skills", ".marketplace", skillId);
    let deleted = false;
    let source = "";

    if (fs.existsSync(path.join(wsDir, "SKILL.md"))) {
      fs.rmSync(wsDir, { recursive: true, force: true });
      deleted = true;
      source = "workspace";
    } else if (fs.existsSync(path.join(mpDir, "SKILL.md"))) {
      try {
        const { uninstallMarketplaceSkill } = await import(
          "../../services/skill-marketplace.js"
        );
        await uninstallMarketplaceSkill(workspaceDir, skillId);
        deleted = true;
        source = "marketplace";
      } catch (err) {
        error(
          res,
          `Failed to uninstall: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
        return true;
      }
    } else if (state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | { uninstall?: (slug: string) => Promise<boolean> }
          | undefined;
        if (svc?.uninstall) {
          deleted = await svc.uninstall(skillId);
          source = "catalog";
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!deleted) {
      error(
        res,
        `Skill "${skillId}" not found or is a bundled skill that cannot be deleted`,
        404,
      );
      return true;
    }

    state.skills = await discoverSkills(
      workspaceDir,
      state.config,
      state.runtime,
    );
    if (state.runtime) {
      const prefs = await loadSkillPreferences(state.runtime);
      delete prefs[skillId];
      await saveSkillPreferences(state.runtime, prefs);
      const acks = await loadSkillAcknowledgments(state.runtime);
      delete acks[skillId];
      await saveSkillAcknowledgments(state.runtime, acks);
    }
    json(res, { ok: true, skillId, source });
    return true;
  }

  // ── GET /api/skills/marketplace/search ─────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      error(res, "Query parameter 'q' is required", 400);
      return true;
    }
    try {
      const limitStr = url.searchParams.get("limit");
      const limit = limitStr ? Math.min(Math.max(Number(limitStr), 1), 50) : 20;
      const { searchSkillsMarketplace } = await import(
          "../../services/skill-marketplace.js"
        );
      const results = await searchSkillsMarketplace(query, { limit });
      json(res, { ok: true, results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, msg, 502);
    }
    return true;
  }

  // ── GET /api/skills/marketplace/installed ─────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/installed") {
    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
        const { listInstalledMarketplaceSkills } = await import(
          "../../services/skill-marketplace.js"
        );
      const installed = await listInstalledMarketplaceSkills(workspaceDir);
      json(res, { ok: true, skills: installed });
    } catch (err) {
      error(
        res,
        `Failed to list installed skills: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/skills/marketplace/install ──────────────────────────────
  if (method === "POST" && pathname === "/api/skills/marketplace/install") {
    const body = await readJsonBody<{
      githubUrl?: string;
      repository?: string;
      path?: string;
      name?: string;
      description?: string;
    }>(req, res);
    if (!body) return true;

    if (!body.githubUrl?.trim() && !body.repository?.trim()) {
      error(res, "Install requires a githubUrl or repository", 400);
      return true;
    }

    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
        const { installMarketplaceSkill } = await import(
          "../../services/skill-marketplace.js"
        );
      const result = await installMarketplaceSkill(workspaceDir, {
        githubUrl: body.githubUrl,
        repository: body.repository,
        path: body.path,
        name: body.name,
        description: body.description,
        source: "skillsmp",
      });
      json(res, { ok: true, skill: result });
    } catch (err) {
      error(
        res,
        `Install failed: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/skills/marketplace/uninstall ────────────────────────────
  if (method === "POST" && pathname === "/api/skills/marketplace/uninstall") {
    const body = await readJsonBody<{ id?: string }>(req, res);
    if (!body) return true;

    if (!body.id?.trim()) {
      error(res, "Request body must include 'id' (skill id to uninstall)", 400);
      return true;
    }

    const uninstallId = validateSkillId(body.id.trim(), res);
    if (!uninstallId) return true;

    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
        const { uninstallMarketplaceSkill } = await import(
          "../../services/skill-marketplace.js"
        );
      const result = await uninstallMarketplaceSkill(workspaceDir, uninstallId);
      json(res, { ok: true, skill: result });
    } catch (err) {
      error(
        res,
        `Uninstall failed: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/skills/marketplace/config ──────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/config") {
    json(res, { keySet: Boolean(process.env.SKILLSMP_API_KEY?.trim()) });
    return true;
  }

  // ── PUT /api/skills/marketplace/config ─────────────────────────────────
  if (method === "PUT" && pathname === "/api/skills/marketplace/config") {
    const body = await readJsonBody<{ apiKey?: string }>(req, res);
    if (!body) return true;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      error(res, "Request body must include 'apiKey'", 400);
      return true;
    }
    process.env.SKILLSMP_API_KEY = apiKey;
    if (!state.config.env) state.config.env = {};
    (state.config.env as Record<string, string>).SKILLSMP_API_KEY = apiKey;
    saveMilaidyConfig(state.config);
    json(res, { ok: true, keySet: true });
    return true;
  }

  // ── PUT /api/skills/:id ────────────────────────────────────────────────
  // IMPORTANT: This wildcard route MUST be after all /api/skills/<specific-path> routes
  if (method === "PUT" && pathname.startsWith("/api/skills/")) {
    const rawSkillId = decodePathComponent(
      pathname.slice("/api/skills/".length),
      res,
      "skill ID",
    );
    if (rawSkillId === null) return true;
    const skillId = validateSkillId(rawSkillId, res);
    if (!skillId) return true;
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return true;

    const skill = state.skills.find((s) => s.id === skillId);
    if (!skill) {
      error(res, `Skill "${skillId}" not found`, 404);
      return true;
    }

    // Block enabling skills with unacknowledged scan findings
    if (body.enabled === true) {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      const report = await loadScanReportFromDisk(
        skillId,
        workspaceDir,
        state.runtime,
      );
      if (
        report &&
        (report.status === "critical" || report.status === "warning")
      ) {
        const acks = await loadSkillAcknowledgments(state.runtime);
        const ack = acks[skillId];
        const findings = report.findings as Array<Record<string, unknown>>;
        const manifestFindings = report.manifestFindings as Array<
          Record<string, unknown>
        >;
        const totalFindings = findings.length + manifestFindings.length;
        if (!ack || ack.findingCount !== totalFindings) {
          error(
            res,
            `Skill "${skillId}" has ${totalFindings} security finding(s) that must be acknowledged first. Use POST /api/skills/${skillId}/acknowledge.`,
            409,
          );
          return true;
        }
      }
    }

    if (body.enabled !== undefined) {
      skill.enabled = body.enabled;
      if (state.runtime) {
        const prefs = await loadSkillPreferences(state.runtime);
        prefs[skillId] = body.enabled;
        await saveSkillPreferences(state.runtime, prefs);
      }
    }

    json(res, { ok: true, skill });
    return true;
  }

  return false;
}
