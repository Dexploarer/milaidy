import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackTrainingService } from "../../src/services/fallback-training-service";

describe("FallbackTrainingService", () => {
  let service: FallbackTrainingService;
  let getRuntimeMock: any;
  let getConfigMock: any;
  let setConfigMock: any;

  beforeEach(() => {
    getRuntimeMock = vi.fn().mockReturnValue(null);
    getConfigMock = vi.fn().mockReturnValue({});
    setConfigMock = vi.fn();

    service = new FallbackTrainingService({
      getRuntime: getRuntimeMock,
      getConfig: getConfigMock,
      setConfig: setConfigMock,
    });
  });

  describe("initialize", () => {
    it("should resolve immediately", async () => {
      await expect(service.initialize()).resolves.toBeUndefined();
    });
  });

  describe("subscriptions", () => {
    it("should allow subscribing and unsubscribing", async () => {
      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);

      // Trigger an event
      const dataset = await service.buildDataset({});

      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();

      await service.buildDataset({});
      expect(listener).not.toHaveBeenCalled();
    });

    it("should not break operations if a listener throws", async () => {
      const failingListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener failed");
      });
      service.subscribe(failingListener);

      // Should not throw
      await expect(service.buildDataset({})).resolves.toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("should return correct status initially", () => {
      expect(service.getStatus()).toEqual({
        runningJobs: 0,
        datasetCount: 0,
        modelCount: 0,
      });
    });
  });

  describe("listTrajectories", () => {
    it("should return unavailable if no runtime", async () => {
      const result = await service.listTrajectories({});
      expect(result.available).toBe(false);
      expect(result.reason).toBe("runtime_not_started");
      expect(result.trajectories).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should return store unavailable if runtime exists", async () => {
      getRuntimeMock.mockReturnValue({});
      const result = await service.listTrajectories({});
      expect(result.available).toBe(false);
      expect(result.reason).toBe("trajectory_store_unavailable");
      expect(result.trajectories).toEqual([]);
    });

    it("should handle custom limit and offset", async () => {
      const result = await service.listTrajectories({ limit: 50, offset: 10 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });
  });

  describe("getTrajectoryById", () => {
    it("should always return null", async () => {
      expect(await service.getTrajectoryById("123")).toBeNull();
    });
  });

  describe("datasets", () => {
    it("should list empty datasets initially", () => {
      expect(service.listDatasets()).toEqual([]);
    });

    it("should build dataset and emit event", async () => {
      const listener = vi.fn();
      service.subscribe(listener);

      const dataset = await service.buildDataset({
        limit: 100,
        minLlmCallsPerTrajectory: 5,
      });

      expect(dataset.id).toMatch(/^dataset-.+/);
      expect(dataset.limit).toBe(100);
      expect(dataset.minLlmCallsPerTrajectory).toBe(5);

      expect(service.listDatasets()).toContainEqual(dataset);
      expect(listener).toHaveBeenCalledWith({ kind: "dataset_built", dataset });
      expect(service.getStatus().datasetCount).toBe(1);
    });
  });

  describe("jobs", () => {
    it("should list empty jobs initially", () => {
      expect(service.listJobs()).toEqual([]);
    });

    it("should fail to start job if no datasetId provided", async () => {
      await expect(service.startTrainingJob({})).rejects.toThrow("datasetId is required");
    });

    it("should fail to start job if dataset not found", async () => {
      await expect(service.startTrainingJob({ datasetId: "nonexistent" })).rejects.toThrow("Dataset not found");
    });

    it("should start job and emit event", async () => {
      const dataset = await service.buildDataset({});

      const listener = vi.fn();
      service.subscribe(listener);

      const job = await service.startTrainingJob({ datasetId: dataset.id });

      expect(job.id).toMatch(/^job-.+/);
      expect(job.datasetId).toBe(dataset.id);
      expect(job.status).toBe("queued");

      expect(service.listJobs()).toContainEqual(job);
      expect(listener).toHaveBeenCalledWith({ kind: "job_started", job });
    });

    it("should get job by id", async () => {
      const dataset = await service.buildDataset({});
      const job = await service.startTrainingJob({ datasetId: dataset.id });

      expect(service.getJob(job.id)).toEqual(job);
      expect(service.getJob("nonexistent")).toBeNull();
    });

    it("should fail to cancel nonexistent job", async () => {
      await expect(service.cancelJob("nonexistent")).rejects.toThrow("Training job not found");
    });

    it("should cancel job and emit event", async () => {
      const dataset = await service.buildDataset({});
      const job = await service.startTrainingJob({ datasetId: dataset.id });

      const listener = vi.fn();
      service.subscribe(listener);

      const cancelledJob = await service.cancelJob(job.id);

      expect(cancelledJob.status).toBe("cancelled");
      expect(service.getJob(job.id)?.status).toBe("cancelled");
      expect(listener).toHaveBeenCalledWith({ kind: "job_cancelled", job: cancelledJob });
    });
  });

  describe("models", () => {
    it("should list empty models initially", () => {
      expect(service.listModels()).toEqual([]);
    });

    it("should fail to import nonexistent model to Ollama", async () => {
      await expect(service.importModelToOllama("nonexistent", {})).rejects.toThrow("Model not found");
    });

    it("should fail to activate nonexistent model", async () => {
      await expect(service.activateModel("nonexistent")).rejects.toThrow("Model not found");
    });

    it("should fail to benchmark nonexistent model", async () => {
      await expect(service.benchmarkModel("nonexistent")).rejects.toThrow("Model not found");
    });
  });
});
