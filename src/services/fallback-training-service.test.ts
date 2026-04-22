import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackTrainingService } from "./fallback-training-service.js";

describe("FallbackTrainingService", () => {
    let service: FallbackTrainingService;
    let mockGetRuntime: any;
    let mockGetConfig: any;
    let mockSetConfig: any;

    beforeEach(() => {
        mockGetRuntime = vi.fn().mockReturnValue(null);
        mockGetConfig = vi.fn().mockReturnValue({});
        mockSetConfig = vi.fn();

        service = new FallbackTrainingService({
            getRuntime: mockGetRuntime,
            getConfig: mockGetConfig,
            setConfig: mockSetConfig
        });
    });

    describe("initialize", () => {
        it("should resolve without error", async () => {
            await expect(service.initialize()).resolves.toBeUndefined();
        });
    });

    describe("subscribe and emit", () => {
        it("should allow subscribing to events", async () => {
            const listener = vi.fn();
            const unsubscribe = service.subscribe(listener);

            const dataset = await service.buildDataset({});
            expect(listener).toHaveBeenCalledWith({ kind: "dataset_built", dataset });

            unsubscribe();
            const newDataset = await service.buildDataset({});
            // Should not be called again
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should not break on listener errors", async () => {
            const errorListener = vi.fn().mockImplementation(() => { throw new Error("Listener error") });
            const goodListener = vi.fn();

            service.subscribe(errorListener);
            service.subscribe(goodListener);

            await service.buildDataset({});

            expect(errorListener).toHaveBeenCalled();
            expect(goodListener).toHaveBeenCalled();
        });
    });

    describe("getStatus", () => {
        it("should return empty status initially", () => {
            expect(service.getStatus()).toEqual({
                runningJobs: 0,
                datasetCount: 0,
                modelCount: 0
            });
        });
    });

    describe("listTrajectories", () => {
        it("should return runtime_not_started if no runtime", async () => {
            mockGetRuntime.mockReturnValue(null);

            const result = await service.listTrajectories({});
            expect(result.available).toBe(false);
            expect(result.reason).toBe("runtime_not_started");
            expect(result.limit).toBe(100);
            expect(result.offset).toBe(0);
        });

        it("should return trajectory_store_unavailable if runtime exists", async () => {
            mockGetRuntime.mockReturnValue({}); // Mock valid runtime

            const result = await service.listTrajectories({ limit: 50, offset: 10 });
            expect(result.available).toBe(false);
            expect(result.reason).toBe("trajectory_store_unavailable");
            expect(result.limit).toBe(50);
            expect(result.offset).toBe(10);
        });
    });

    describe("getTrajectoryById", () => {
        it("should always return null", async () => {
            expect(await service.getTrajectoryById("123")).toBeNull();
        });
    });

    describe("buildDataset and listDatasets", () => {
        it("should build and store datasets", async () => {
            expect(service.listDatasets()).toHaveLength(0);

            const dataset1 = await service.buildDataset({ limit: 10, minLlmCallsPerTrajectory: 2 });
            expect(dataset1.id).toContain("dataset-");
            expect(dataset1.limit).toBe(10);
            expect(dataset1.minLlmCallsPerTrajectory).toBe(2);

            const dataset2 = await service.buildDataset({});

            const datasets = service.listDatasets();
            expect(datasets).toHaveLength(2);
            // new datasets are unshifted, so they appear first
            expect(datasets[0].id).toBe(dataset2.id);
            expect(datasets[1].id).toBe(dataset1.id);
        });
    });

    describe("Jobs", () => {
        it("should throw if startTrainingJob is called without datasetId", async () => {
            await expect(service.startTrainingJob({} as any)).rejects.toThrow("datasetId is required");
        });

        it("should throw if dataset does not exist", async () => {
             await expect(service.startTrainingJob({ datasetId: "nonexistent" })).rejects.toThrow("Dataset not found");
        });

        it("should start a training job if dataset exists", async () => {
             const dataset = await service.buildDataset({});

             const job = await service.startTrainingJob({ datasetId: dataset.id });
             expect(job.id).toContain("job-");
             expect(job.datasetId).toBe(dataset.id);
             expect(job.status).toBe("queued");

             expect(service.listJobs()).toHaveLength(1);
             expect(service.getJob(job.id)).toEqual(job);
        });

        it("should allow cancelling a job", async () => {
             const dataset = await service.buildDataset({});
             const job = await service.startTrainingJob({ datasetId: dataset.id });

             const cancelledJob = await service.cancelJob(job.id);
             expect(cancelledJob.status).toBe("cancelled");

             const storedJob = service.getJob(job.id);
             expect(storedJob?.status).toBe("cancelled");
        });

        it("should throw when cancelling nonexistent job", async () => {
             await expect(service.cancelJob("nonexistent")).rejects.toThrow("Training job not found");
        });
    });

    describe("Models", () => {
        it("should start with empty models list", () => {
            expect(service.listModels()).toHaveLength(0);
        });

        it("should throw when interacting with nonexistent models", async () => {
            await expect(service.importModelToOllama("missing", {})).rejects.toThrow("Model not found");
            await expect(service.activateModel("missing")).rejects.toThrow("Model not found");
            await expect(service.benchmarkModel("missing")).rejects.toThrow("Model not found");
        });
    });
});
