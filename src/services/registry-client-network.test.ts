import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFromNetwork } from "./registry-client-network.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../diagnostics/integration-observability", () => ({
    createIntegrationTelemetrySpan: () => ({
        success: vi.fn(),
        failure: vi.fn()
    })
}));

describe("registry-client-network", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("fetchFromNetwork", () => {
        it("should fetch generated registry successfully", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    registry: {
                        "test-plugin": {
                            git: { repo: "test/repo", v0: { branch: null }, v1: { branch: null }, v2: { branch: "main" } },
                            npm: { repo: "test-plugin", v0: null, v1: null, v2: "1.0.0" },
                            supports: { v0: false, v1: false, v2: true },
                            description: "Test plugin",
                            homepage: null,
                            topics: [],
                            stargazers_count: 10,
                            language: "TypeScript"
                        }
                    }
                })
            });

            const applyLocalWorkspaceApps = vi.fn();
            const applyNodeModulePlugins = vi.fn();
            const sanitizeSandbox = vi.fn();

            const result = await fetchFromNetwork({
                generatedRegistryUrl: "https://generated.com",
                indexRegistryUrl: "https://index.com",
                applyLocalWorkspaceApps,
                applyNodeModulePlugins,
                sanitizeSandbox
            });

            expect(mockFetch).toHaveBeenCalledWith("https://generated.com", { redirect: "error" });
            expect(result.size).toBe(1);
            expect(result.get("test-plugin")?.gitRepo).toBe("test/repo");
            expect(applyLocalWorkspaceApps).toHaveBeenCalledWith(result);
            expect(applyNodeModulePlugins).toHaveBeenCalledWith(result);
        });

        it("should handle generated registry app metadata correctly", async () => {
             mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    registry: {
                        "test-app": {
                            git: { repo: "test/app", v0: { branch: null }, v1: { branch: null }, v2: { branch: "main" } },
                            npm: { repo: "test-app", v0: null, v1: null, v2: "1.0.0" },
                            supports: { v0: false, v1: false, v2: true },
                            description: "Test app",
                            homepage: null,
                            topics: [],
                            stargazers_count: 10,
                            language: "TypeScript",
                            kind: "app",
                            app: {
                                displayName: "Test App",
                                category: "game",
                                launchType: "url",
                                launchUrl: null,
                                icon: null,
                                capabilities: [],
                                minPlayers: null,
                                maxPlayers: null,
                                viewer: {
                                    url: "https://viewer.com",
                                    sandbox: "allow-scripts"
                                }
                            }
                        }
                    }
                })
            });

            const applyLocalWorkspaceApps = vi.fn();
            const applyNodeModulePlugins = vi.fn();
            const sanitizeSandbox = vi.fn((val) => val === "allow-scripts" ? "allow-scripts allow-same-origin" : val);

            const result = await fetchFromNetwork({
                generatedRegistryUrl: "https://generated.com",
                indexRegistryUrl: "https://index.com",
                applyLocalWorkspaceApps,
                applyNodeModulePlugins,
                sanitizeSandbox
            });

            expect(result.get("test-app")?.kind).toBe("app");
            expect(result.get("test-app")?.appMeta?.displayName).toBe("Test App");
            expect(result.get("test-app")?.appMeta?.viewer?.sandbox).toBe("allow-scripts allow-same-origin");
            expect(sanitizeSandbox).toHaveBeenCalledWith("allow-scripts");
        });

        it("should fallback to index registry if generated registry fails", async () => {
             mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        "fallback-plugin": "github:fallback/repo"
                    })
                });

            const applyLocalWorkspaceApps = vi.fn();
            const applyNodeModulePlugins = vi.fn();
            const sanitizeSandbox = vi.fn();

            const result = await fetchFromNetwork({
                generatedRegistryUrl: "https://generated.com",
                indexRegistryUrl: "https://index.com",
                applyLocalWorkspaceApps,
                applyNodeModulePlugins,
                sanitizeSandbox
            });

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch).toHaveBeenLastCalledWith("https://index.com", { redirect: "error" });
            expect(result.size).toBe(1);
            expect(result.get("fallback-plugin")?.gitRepo).toBe("fallback/repo");
            expect(applyLocalWorkspaceApps).toHaveBeenCalledWith(result);
            expect(applyNodeModulePlugins).toHaveBeenCalledWith(result);
        });

        it("should throw if both generated and index registries fail", async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: "Not Found"
                });

             const applyLocalWorkspaceApps = vi.fn();
            const applyNodeModulePlugins = vi.fn();
            const sanitizeSandbox = vi.fn();

            await expect(fetchFromNetwork({
                generatedRegistryUrl: "https://generated.com",
                indexRegistryUrl: "https://index.com",
                applyLocalWorkspaceApps,
                applyNodeModulePlugins,
                sanitizeSandbox
            })).rejects.toThrow("index.json: 404 Not Found");
        });

        it("should throw if index fetch throws network error", async () => {
             mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500
                })
                .mockRejectedValueOnce(new Error("Network Error"));

             const applyLocalWorkspaceApps = vi.fn();
            const applyNodeModulePlugins = vi.fn();
            const sanitizeSandbox = vi.fn();

            await expect(fetchFromNetwork({
                generatedRegistryUrl: "https://generated.com",
                indexRegistryUrl: "https://index.com",
                applyLocalWorkspaceApps,
                applyNodeModulePlugins,
                sanitizeSandbox
            })).rejects.toThrow("Network Error");
        });
    });
});
