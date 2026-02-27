import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxAuditLog } from "../security/audit-log";
import {
  RemoteSigningService,
  type SignerBackend,
  type SigningRequest,
  type UnsignedTransaction,
} from "./remote-signing-service";
import { createDefaultPolicy, type SigningPolicy } from "./signing-policy";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    chainId: 1,
    to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    value: "0",
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  };
}

class MockSigner implements SignerBackend {
  async getAddress(): Promise<string> {
    return "0x1234567890123456789012345678901234567890";
  }
  async signMessage(message: string): Promise<string> {
    return `signed-message-${message}`;
  }
  async signTransaction(tx: UnsignedTransaction): Promise<string> {
    return `signed-tx-${tx.to}-${tx.value}`;
  }
}

// ═════════════════════════════════════════════════════════════════════════
describe("RemoteSigningService", () => {
  let service: RemoteSigningService;
  let signer: MockSigner;
  let auditLog: SandboxAuditLog;
  let auditLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    signer = new MockSigner();
    auditLog = new SandboxAuditLog({ console: false });
    auditLogSpy = vi.spyOn(auditLog, "record");

    service = new RemoteSigningService({
      signer,
      auditLog,
      policy: createDefaultPolicy(),
      approvalTimeoutMs: 1000, // Short timeout for testing
    });
  });

  // ── submitSigningRequest ───────────────────────────────────────────
  describe("submitSigningRequest", () => {
    it("signs immediately if policy allows", async () => {
      const request = makeRequest({ value: "100" }); // Below default threshold
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.signature).toContain("signed-tx");
      expect(result.humanConfirmed).toBe(false);
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "signing_request_approved" }),
      );
    });

    it("rejects if policy denies", async () => {
      // Create service with restrictive policy
      const restrictivePolicy: SigningPolicy = {
        ...createDefaultPolicy(),
        deniedContracts: ["0xdeadbeef"],
      };
      service.updatePolicy(restrictivePolicy);

      const request = makeRequest({ to: "0xdeadbeef" });
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("denylisted");
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "signing_request_rejected" }),
      );
    });

    it("requires human confirmation if policy demands it", async () => {
      // Policy requiring confirmation for values > 1000
      const policy: SigningPolicy = {
        ...createDefaultPolicy(),
        humanConfirmationThresholdWei: "1000",
      };
      service.updatePolicy(policy);

      const request = makeRequest({ value: "2000" });
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Human confirmation required");
      expect(result.policyDecision.requiresHumanConfirmation).toBe(true);

      // Verify it's pending
      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe(request.requestId);
    });
  });

  // ── approveRequest ─────────────────────────────────────────────────
  describe("approveRequest", () => {
    it("signs a pending request", async () => {
      // Setup pending request
      const policy: SigningPolicy = {
        ...createDefaultPolicy(),
        requireHumanConfirmation: true,
      };
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      // Approve it
      const result = await service.approveRequest(request.requestId);

      expect(result.success).toBe(true);
      expect(result.signature).toContain("signed-tx");
      expect(result.humanConfirmed).toBe(true);
      expect(service.getPendingApprovals()).toHaveLength(0);
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_approved",
          metadata: expect.objectContaining({ humanConfirmed: true }),
        }),
      );
    });

    it("fails if request not found", async () => {
      const result = await service.approveRequest("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pending approval found");
    });

    it("fails if request expired", async () => {
      // Mock Date.now to simulate expiration
      vi.useFakeTimers();
      const now = Date.now();

      const policy: SigningPolicy = {
        ...createDefaultPolicy(),
        requireHumanConfirmation: true,
      };
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      // Fast forward past expiration (timeout is 1000ms)
      vi.setSystemTime(now + 2000);

      const result = await service.approveRequest(request.requestId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Approval expired");
      expect(service.getPendingApprovals()).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  // ── rejectRequest ──────────────────────────────────────────────────
  describe("rejectRequest", () => {
    it("removes a pending request", async () => {
      const policy: SigningPolicy = {
        ...createDefaultPolicy(),
        requireHumanConfirmation: true,
      };
      service.updatePolicy(policy);

      const request = makeRequest();
      await service.submitSigningRequest(request);

      const removed = service.rejectRequest(request.requestId);

      expect(removed).toBe(true);
      expect(service.getPendingApprovals()).toHaveLength(0);
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          summary: expect.stringContaining("Human rejected"),
        }),
      );
    });

    it("returns false if request not found", () => {
      const removed = service.rejectRequest("non-existent");
      expect(removed).toBe(false);
    });
  });

  // ── getPendingApprovals ────────────────────────────────────────────
  describe("getPendingApprovals", () => {
    it("returns active approvals and cleans up expired ones", async () => {
      vi.useFakeTimers();
      const now = Date.now();

      const policy: SigningPolicy = {
        ...createDefaultPolicy(),
        requireHumanConfirmation: true,
      };
      service.updatePolicy(policy);

      // Create two requests
      const req1 = makeRequest({ requestId: "req-1" });
      const req2 = makeRequest({ requestId: "req-2" });

      await service.submitSigningRequest(req1);

      // Advance time but stay within timeout
      vi.setSystemTime(now + 500);
      await service.submitSigningRequest(req2);

      // req1 expires at now + 1000
      // req2 expires at now + 500 + 1000 = now + 1500

      // Advance to expire req1 but keep req2
      vi.setSystemTime(now + 1200);

      const pending = service.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe("req-2");

      vi.useRealTimers();
    });
  });

  // ── Audit Logging ──────────────────────────────────────────────────
  describe("audit logging", () => {
    it("logs submission", async () => {
      const request = makeRequest();
      await service.submitSigningRequest(request);
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "signing_request_submitted" }),
      );
    });

    it("logs policy update", () => {
      service.updatePolicy(createDefaultPolicy());
      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "policy_decision" }),
      );
    });
  });
});
