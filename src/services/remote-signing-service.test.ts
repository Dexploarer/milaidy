import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxAuditLog } from "../security/audit-log";
import {
  RemoteSigningService,
  type SignerBackend,
  type UnsignedTransaction,
} from "./remote-signing-service";
import {
  createDefaultPolicy,
  type SigningPolicy,
  type SigningRequest,
} from "./signing-policy";

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Date.now()}-${Math.random()}`,
    chainId: 1,
    to: "0x1234567890abcdef1234567890abcdef12345678",
    value: "1000000000000000", // 0.001 ETH
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("RemoteSigningService", () => {
  let service: RemoteSigningService;
  let mockSigner: SignerBackend;
  let mockAuditLog: SandboxAuditLog;
  let policy: SigningPolicy;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xsigner"),
      signMessage: vi.fn().mockResolvedValue("0xsignature"),
      signTransaction: vi.fn().mockImplementation(async (tx: UnsignedTransaction) => {
        return "0xsignedtx";
      }),
    };

    mockAuditLog = {
      record: vi.fn(),
    } as unknown as SandboxAuditLog;

    policy = createDefaultPolicy();

    service = new RemoteSigningService({
      signer: mockSigner,
      policy,
      auditLog: mockAuditLog,
      approvalTimeoutMs: 1000, // Short timeout for testing
    });
  });

  describe("getAddress", () => {
    it("should return the signer address", async () => {
      const address = await service.getAddress();
      expect(address).toBe("0xsigner");
      expect(mockSigner.getAddress).toHaveBeenCalled();
    });
  });

  describe("submitSigningRequest", () => {
    it("should sign immediately if policy allows and no confirmation needed", async () => {
      const request = makeRequest();
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xsignedtx");
      expect(result.policyDecision.allowed).toBe(true);
      expect(result.humanConfirmed).toBe(false);
      expect(mockSigner.signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: request.to,
          value: request.value,
          chainId: request.chainId,
        }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_submitted",
        }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_approved",
        }),
      );
    });

    it("should reject if policy denies", async () => {
      policy.allowedChainIds = [137]; // Only Polygon
      service.updatePolicy(policy);

      const request = makeRequest({ chainId: 1 }); // Mainnet
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in allowlist");
      expect(result.policyDecision.allowed).toBe(false);
      expect(mockSigner.signTransaction).not.toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
        }),
      );
    });

    it("should require human confirmation if policy demands it", async () => {
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Human confirmation required");
      expect(result.policyDecision.requiresHumanConfirmation).toBe(true);
      expect(mockSigner.signTransaction).not.toHaveBeenCalled();

      // Should be stored in pending approvals
      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe(request.requestId);
    });

    it("should handle signer errors", async () => {
      vi.mocked(mockSigner.signTransaction).mockRejectedValueOnce(
        new Error("Signer error"),
      );

      const request = makeRequest();
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Signer error");
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          summary: expect.stringContaining("Signing failed"),
        }),
      );
    });
  });

  describe("approveRequest", () => {
    it("should approve and sign a pending request", async () => {
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      const result = await service.approveRequest(request.requestId);

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xsignedtx");
      expect(result.humanConfirmed).toBe(true);
      expect(mockSigner.signTransaction).toHaveBeenCalled();

      // Should be removed from pending
      expect(service.getPendingApprovals()).toHaveLength(0);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_approved",
          metadata: expect.objectContaining({ humanConfirmed: true }),
        }),
      );
    });

    it("should fail if request ID not found", async () => {
      const result = await service.approveRequest("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pending approval found");
    });

    it("should fail if approval expired", async () => {
      vi.useFakeTimers();
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      // Advance time past expiration (1000ms set in beforeEach)
      vi.advanceTimersByTime(1500);

      const result = await service.approveRequest(request.requestId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Approval expired");
      expect(service.getPendingApprovals()).toHaveLength(0);

      vi.useRealTimers();
    });

    it("should handle signer errors during approval", async () => {
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      vi.mocked(mockSigner.signTransaction).mockRejectedValueOnce(
        new Error("Signer error during approval"),
      );

      const result = await service.approveRequest(request.requestId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Signer error during approval");
      expect(service.getPendingApprovals()).toHaveLength(0);
    });
  });

  describe("rejectRequest", () => {
    it("should remove pending request and log rejection", async () => {
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      const removed = service.rejectRequest(request.requestId);

      expect(removed).toBe(true);
      expect(service.getPendingApprovals()).toHaveLength(0);
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          summary: expect.stringContaining("Human rejected"),
        }),
      );
    });

    it("should return false if request not found", () => {
      const removed = service.rejectRequest("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("getPendingApprovals", () => {
    it("should return list of pending approvals", async () => {
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const req1 = makeRequest({ requestId: "req-1" });
      const req2 = makeRequest({ requestId: "req-2" });

      await service.submitSigningRequest(req1);
      await service.submitSigningRequest(req2);

      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(2);
      expect(pending.map(p => p.requestId)).toContain("req-1");
      expect(pending.map(p => p.requestId)).toContain("req-2");
    });

    it("should auto-clean expired approvals", async () => {
      vi.useFakeTimers();
      policy.requireHumanConfirmation = true;
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      vi.advanceTimersByTime(1500); // Expire it

      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  describe("policy management", () => {
    it("should update and return policy", () => {
      const newPolicy = createDefaultPolicy();
      newPolicy.maxTransactionsPerDay = 999;

      service.updatePolicy(newPolicy);

      expect(service.getPolicy().maxTransactionsPerDay).toBe(999);
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "policy_decision",
          summary: "Signing policy updated",
        }),
      );
    });
  });
});
