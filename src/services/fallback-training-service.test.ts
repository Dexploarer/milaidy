import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackTrainingService } from "./fallback-training-service";
import type { AgentRuntime } from "@elizaos/core";

describe("FallbackTrainingService", () => {
  let mockGetRuntime: ReturnType<typeof vi.fn>;
  let mockGetConfig: ReturnType<typeof vi.fn>;
  let mockSetConfig: ReturnType<typeof vi.fn>;
  let service: FallbackTrainingService;

  beforeEach(() => {
    mockGetRuntime = vi.fn().mockReturnValue(null);
    mockGetConfig = vi.fn().mockReturnValue({});
    mockSetConfig = vi.fn();

    service = new FallbackTrainingService({
      getRuntime: mockGetRuntime,
      getConfig: mockGetConfig,
      setConfig: mockSetConfig,
    });
  });

  describe("initialize", () => {
    it("should resolve without doing anything", async () => {
      await expect(service.initialize()).resolves.toBeUndefined();
    });
  });

  describe("events", () => {
    it("should allow subscribing to events and unsubscribe", async () => {
      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);

      // Trigger an event internally, e.g., buildDataset
      await service.buildDataset({});

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "dataset_built" })
      );

      listener.mockClear();
      unsubscribe();

      await service.buildDataset({});
      expect(listener).not.toHaveBeenCalled();
    });

    it("should not break operations if a listener throws", async () => {
      const throwingListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });
      const validListener = vi.fn();

      service.subscribe(throwingListener);
      service.subscribe(validListener);

      // Trigger an event
      let error: unknown;
      try {
        await service.buildDataset({});
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();

      expect(throwingListener).toHaveBeenCalled();
      expect(validListener).toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("should return empty status initially", () => {
      expect(service.getStatus()).toEqual({
        runningJobs: 0,
        datasetCount: 0,
        modelCount: 0,
      });
    });

    it("should reflect running jobs and datasets", async () => {
      const dataset = await service.buildDataset({});
      await service.startTrainingJob({ datasetId: dataset.id });

      // The job starts as 'queued', so runningJobs should still be 0
      expect(service.getStatus()).toEqual({
        runningJobs: 0,
        datasetCount: 1,
        modelCount: 0,
      });
    });
  });

  describe("listTrajectories", () => {
    it("should return runtime_not_started if runtime is null", async () => {
      mockGetRuntime.mockReturnValue(null);
      const res = await service.listTrajectories({ limit: 10, offset: 5 });
      expect(res).toEqual({
        available: false,
        reason: "runtime_not_started",
        trajectories: [],
        total: 0,
        limit: 10,
        offset: 5,
      });
    });

    it("should return trajectory_store_unavailable if runtime is present", async () => {
      mockGetRuntime.mockReturnValue({} as AgentRuntime);
      const res = await service.listTrajectories({});
      expect(res).toEqual({
        available: false,
        reason: "trajectory_store_unavailable",
        trajectories: [],
        total: 0,
        limit: 100, // default
        offset: 0,  // default
      });
    });
  });

  describe("getTrajectoryById", () => {
    it("should return null", async () => {
      expect(await service.getTrajectoryById("123")).toBeNull();
    });
  });

  describe("datasets", () => {
    it("should build and list datasets", async () => {
      const options = { limit: 10, minLlmCallsPerTrajectory: 5 };
      const dataset = await service.buildDataset(options);

      expect(dataset).toMatchObject({
        limit: 10,
        minLlmCallsPerTrajectory: 5,
      });
      expect(dataset.id).toMatch(/^dataset-/);
      expect(dataset.createdAt).toBeDefined();

      const list = service.listDatasets();
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual(dataset);
    });
  });

  describe("jobs", () => {
    it("should throw if startTrainingJob is called without datasetId", async () => {
      await expect(service.startTrainingJob({} as any)).rejects.toThrow(
        "datasetId is required"
      );
    });

    it("should throw if startTrainingJob is called with non-existent datasetId", async () => {
      await expect(
        service.startTrainingJob({ datasetId: "non-existent" })
      ).rejects.toThrow("Dataset not found");
    });

    it("should start, list, and get a job", async () => {
      const dataset = await service.buildDataset({});
      const job = await service.startTrainingJob({ datasetId: dataset.id });

      expect(job.id).toMatch(/^job-/);
      expect(job.datasetId).toBe(dataset.id);
      expect(job.status).toBe("queued");
      expect(job.createdAt).toBeDefined();

      expect(service.listJobs()).toEqual([job]);
      expect(service.getJob(job.id)).toEqual(job);
    });

    it("should return null for non-existent job", () => {
      expect(service.getJob("non-existent")).toBeNull();
    });
  });

  describe("cancelJob", () => {
    it("should throw if job not found", async () => {
      await expect(service.cancelJob("non-existent")).rejects.toThrow(
        "Training job not found"
      );
    });

    it("should cancel a job and emit event", async () => {
      const listener = vi.fn();
      service.subscribe(listener);

      const dataset = await service.buildDataset({});
      const job = await service.startTrainingJob({ datasetId: dataset.id });

      const cancelledJob = await service.cancelJob(job.id);
      expect(cancelledJob.status).toBe("cancelled");

      expect(listener).toHaveBeenCalledWith({
        kind: "job_cancelled",
        job: expect.objectContaining({ status: "cancelled" }),
      });

      // Verify the job in the list is also updated
      const listedJob = service.getJob(job.id);
      expect(listedJob?.status).toBe("cancelled");
    });
  });

  describe("models", () => {
    it("should list empty models", () => {
      expect(service.listModels()).toEqual([]);
    });

    it("should throw on importModelToOllama", async () => {
      await expect(
        service.importModelToOllama("model-1", {})
      ).rejects.toThrow("Model not found");
    });

    it("should throw on activateModel", async () => {
      await expect(service.activateModel("model-1")).rejects.toThrow(
        "Model not found"
      );
    });

    it("should throw on benchmarkModel", async () => {
      await expect(service.benchmarkModel("model-1")).rejects.toThrow(
        "Model not found"
      );
    });
  });
});
