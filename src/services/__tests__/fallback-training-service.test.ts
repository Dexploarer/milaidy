import { describe, expect, it, vi } from "vitest";
import { FallbackTrainingService } from "../fallback-training-service";
import type { MiladyConfig } from "../../config/config";
import type { AgentRuntime } from "@elizaos/core";

describe("FallbackTrainingService", () => {
  it("initializes without errors", async () => {
    const service = new FallbackTrainingService({
      getRuntime: () => null,
      getConfig: () => ({}) as MiladyConfig,
      setConfig: () => {},
    });
    await expect(service.initialize()).resolves.toBeUndefined();
  });

  it("returns zeros for empty status", () => {
    const service = new FallbackTrainingService({
      getRuntime: () => null,
      getConfig: () => ({}) as MiladyConfig,
      setConfig: () => {},
    });
    expect(service.getStatus()).toEqual({
      runningJobs: 0,
      datasetCount: 0,
      modelCount: 0,
    });
  });

  it("subscribes and unsubscribes correctly when emit is called", () => {
    const service = new FallbackTrainingService({
      getRuntime: () => null,
      getConfig: () => ({}) as MiladyConfig,
      setConfig: () => {},
    });

    const mockListener = vi.fn();
    const unsubscribe = service.subscribe(mockListener);

    // Call an action that triggers an emit
    void service.buildDataset({});

    expect(mockListener).toHaveBeenCalled();

    unsubscribe();
    mockListener.mockClear();

    void service.buildDataset({});
    expect(mockListener).not.toHaveBeenCalled();
  });

  it("listener errors don't crash emit", async () => {
    const service = new FallbackTrainingService({
      getRuntime: () => null,
      getConfig: () => ({}) as MiladyConfig,
      setConfig: () => {},
    });

    const badListener = vi.fn(() => { throw new Error("bad") });
    service.subscribe(badListener);

    // This would throw if emit wasn't catching errors
    await expect(service.buildDataset({})).resolves.toBeDefined();
    expect(badListener).toHaveBeenCalled();
  });

  describe("listTrajectories", () => {
    it("returns runtime_not_started if no runtime is available", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      const result = await service.listTrajectories({});
      expect(result).toEqual({
        available: false,
        reason: "runtime_not_started",
        trajectories: [],
        total: 0,
        limit: 100,
        offset: 0,
      });
    });

    it("returns trajectory_store_unavailable if runtime is available", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => ({}) as AgentRuntime,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      const result = await service.listTrajectories({ limit: 50, offset: 10 });
      expect(result).toEqual({
        available: false,
        reason: "trajectory_store_unavailable",
        trajectories: [],
        total: 0,
        limit: 50,
        offset: 10,
      });
    });
  });

  describe("getTrajectoryById", () => {
    it("returns null", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      await expect(service.getTrajectoryById("123")).resolves.toBeNull();
    });
  });

  describe("dataset management", () => {
    it("builds and lists datasets", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      const listener = vi.fn();
      service.subscribe(listener);

      const dataset = await service.buildDataset({ limit: 100, minLlmCallsPerTrajectory: 5 });

      expect(dataset.id).toMatch(/^dataset-/);
      expect(dataset.limit).toBe(100);
      expect(dataset.minLlmCallsPerTrajectory).toBe(5);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "dataset_built", dataset }));

      const datasets = service.listDatasets();
      expect(datasets).toHaveLength(1);
      expect(datasets[0]).toEqual(dataset);

      const status = service.getStatus();
      expect(status.datasetCount).toBe(1);
    });
  });

  describe("job management", () => {
    it("starts, lists, gets, and cancels jobs", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      const dataset = await service.buildDataset({});

      const listener = vi.fn();
      service.subscribe(listener);

      const job = await service.startTrainingJob({ datasetId: dataset.id });
      expect(job.id).toMatch(/^job-/);
      expect(job.datasetId).toBe(dataset.id);
      expect(job.status).toBe("queued");

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "job_started", job }));

      const jobs = service.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual(job);

      const fetchedJob = service.getJob(job.id);
      expect(fetchedJob).toEqual(job);

      // Update job status to running for getStatus check
      fetchedJob!.status = "running";

      const status = service.getStatus();
      expect(status.runningJobs).toBe(1);

      listener.mockClear();
      const cancelledJob = await service.cancelJob(job.id);
      expect(cancelledJob.status).toBe("cancelled");
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "job_cancelled", job: cancelledJob }));
    });

    it("throws if starting job without datasetId", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      await expect(service.startTrainingJob({})).rejects.toThrowError("datasetId is required");
    });

    it("throws if starting job with unknown datasetId", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      await expect(service.startTrainingJob({ datasetId: "unknown" })).rejects.toThrowError("Dataset not found");
    });

    it("returns null for unknown job", () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      expect(service.getJob("unknown")).toBeNull();
    });

    it("throws if cancelling unknown job", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      await expect(service.cancelJob("unknown")).rejects.toThrowError("Training job not found");
    });
  });

  describe("model management", () => {
    it("lists models", () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });
      expect(service.listModels()).toEqual([]);
    });

    it("throws for model operations when model is not found", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      await expect(service.importModelToOllama("unknown", {})).rejects.toThrowError("Model not found");
      await expect(service.activateModel("unknown")).rejects.toThrowError("Model not found");
      await expect(service.benchmarkModel("unknown")).rejects.toThrowError("Model not found");
    });

    it("succeeds for model operations when model is found", async () => {
      const service = new FallbackTrainingService({
        getRuntime: () => null,
        getConfig: () => ({}) as MiladyConfig,
        setConfig: () => {},
      });

      // We have to directly inject a model since there's no public API to create one
      // in FallbackTrainingService (it seems incomplete in the implementation)
      const model = { id: "model-1", createdAt: new Date().toISOString() };
      // @ts-expect-error accessing private field for test
      service.models.push(model);

      await expect(service.importModelToOllama("model-1", {})).resolves.toEqual(model);
      await expect(service.activateModel("model-1")).resolves.toEqual({ ok: true, activeModelId: "model-1" });
      await expect(service.benchmarkModel("model-1")).resolves.toEqual({ ok: true, modelId: "model-1" });
    });
  });
});
