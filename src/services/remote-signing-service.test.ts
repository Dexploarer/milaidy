import { mock, spyOn, describe, it, expect, beforeEach, afterEach, setSystemTime } from "bun:test";

const vi = {
  fn: mock,
  mock: mock.module,
  clearAllMocks: () => {},
  spyOn,
  mocked: (fn: any) => fn as ReturnType<typeof mock>,
  useFakeTimers: () => {},
  useRealTimers: () => { setSystemTime(); },
  setSystemTime,
  advanceTimersByTime: (ms: number) => {
    // Basic shim for testing purposes - simply shift the current time
    const current = Date.now();
    setSystemTime(current + ms);
  }
};

import { RemoteSigningService, type SignerBackend } from "./remote-signing-service";
import type { SandboxAuditLog } from "../security/audit-log";
import type { SigningPolicy, SigningRequest } from "./signing-policy";

describe("remote-signing-service", () => {
  let mockSigner: SignerBackend;
  let mockAuditLog: SandboxAuditLog;
  let service: RemoteSigningService;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0x123"),
      signMessage: vi.fn().mockResolvedValue("0xmsg_sig"),
      signTransaction: vi.fn().mockResolvedValue("0xtx_sig"),
    };

    mockAuditLog = {
      record: vi.fn(),
      getLogs: vi.fn(),
    } as unknown as SandboxAuditLog;

    service = new RemoteSigningService({
      signer: mockSigner,
      auditLog: mockAuditLog,
      approvalTimeoutMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createRequest = (overrides?: Partial<SigningRequest>): SigningRequest => ({
    requestId: "req-1",
    chainId: 1,
    to: "0xabc",
    value: "100",
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  });

  const basePolicy = {
    allowedChainIds: [],
    allowedContracts: [],
    deniedContracts: [],
    maxTransactionValueWei: "100000000000000000",
    maxTransactionsPerHour: 10,
    maxTransactionsPerDay: 50,
    allowedMethodSelectors: [],
    humanConfirmationThresholdWei: "10000000000000000",
    requireHumanConfirmation: false,
  };

  describe("submitSigningRequest", () => {
    it("should reject automatically if policy denys", async () => {
      service.updatePolicy({
        ...basePolicy,
        deniedContracts: ["0xabc"],
      });

      const req = createRequest();
      const result = await service.submitSigningRequest(req);

      expect(result.success).toBe(false);
      expect(result.policyDecision.allowed).toBe(false);
      expect(result.policyDecision.requiresHumanConfirmation).toBe(false);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
        })
      );
    });

    it("should pend for human confirmation if policy requires it", async () => {
      service.updatePolicy({
        ...basePolicy,
        requireHumanConfirmation: true,
      });

      const req = createRequest();
      const result = await service.submitSigningRequest(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Human confirmation required");
      expect(result.policyDecision.requiresHumanConfirmation).toBe(true);

      const pending = service.getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].requestId).toBe("req-1");
    });

    it("should sign immediately if policy allows", async () => {
      service.updatePolicy({
        ...basePolicy,
      });

      const req = createRequest();
      const result = await service.submitSigningRequest(req);

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xtx_sig");
      expect(mockSigner.signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "0xabc",
          value: "100",
        })
      );
    });

    it("should handle signing errors gracefully", async () => {
      service.updatePolicy({
        ...basePolicy,
      });

      let wasCalled = false;
      mockSigner.signTransaction = () => {
        wasCalled = true;
        return Promise.reject(new Error("Signer offline"));
      };

      const req = createRequest();
      const result = await service.submitSigningRequest(req);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Signing failed: Signer offline");

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          severity: "error"
        })
      );
    });
  });

  describe("approveRequest", () => {
    it("should return error if approval not found", async () => {
      const result = await service.approveRequest("non-existent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("No pending approval found for this request ID");
    });

    it("should return error if approval expired", async () => {
      vi.useFakeTimers();

      service.updatePolicy({ ...basePolicy, requireHumanConfirmation: true });
      await service.submitSigningRequest(createRequest());

      vi.advanceTimersByTime(2000); // Wait past approvalTimeoutMs (1000)

      const result = await service.approveRequest("req-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval expired");

      expect(service.getPendingApprovals().length).toBe(0);
    });

    it("should sign transaction after successful approval", async () => {
      service.updatePolicy({ ...basePolicy, requireHumanConfirmation: true });
      await service.submitSigningRequest(createRequest());

      const result = await service.approveRequest("req-1");

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xtx_sig");
      expect(result.humanConfirmed).toBe(true);
      expect(mockSigner.signTransaction).toHaveBeenCalled();

      expect(service.getPendingApprovals().length).toBe(0);
    });
  });

  describe("rejectRequest", () => {
    it("should remove pending approval and return true if existed", async () => {
      service.updatePolicy({ ...basePolicy, requireHumanConfirmation: true });
      await service.submitSigningRequest(createRequest());

      expect(service.getPendingApprovals().length).toBe(1);

      const rejected = service.rejectRequest("req-1");
      expect(rejected).toBe(true);
      expect(service.getPendingApprovals().length).toBe(0);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          summary: expect.stringContaining("Human rejected"),
        })
      );
    });

    it("should return false if approval did not exist", () => {
      const rejected = service.rejectRequest("req-1");
      expect(rejected).toBe(false);
    });
  });

  describe("getAddress", () => {
    it("should return signer address", async () => {
      const addr = await service.getAddress();
      expect(addr).toBe("0x123");
      expect(mockSigner.getAddress).toHaveBeenCalled();
    });
  });

  describe("getPendingApprovals", () => {
    it("should clean up expired approvals when queried", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

      service.updatePolicy({ ...basePolicy, requireHumanConfirmation: true });
      await service.submitSigningRequest(createRequest({ requestId: "req-1" }));

      vi.advanceTimersByTime(500);

      await service.submitSigningRequest(createRequest({ requestId: "req-2" }));

      expect(service.getPendingApprovals().length).toBe(2);

      vi.advanceTimersByTime(600); // Total 1100ms, req-1 expired (1000ms limit), req-2 valid (600ms elapsed)

      const pending = service.getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].requestId).toBe("req-2");
    });
  });
});