import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemoteSigningService, type SignerBackend } from "./remote-signing-service";
import type { SandboxAuditLog } from "../security/audit-log";
import type { SigningRequest } from "./signing-policy";

describe("RemoteSigningService", () => {
  let mockSigner: SignerBackend;
  let mockAuditLog: SandboxAuditLog;
  let service: RemoteSigningService;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xMockAddress"),
      signMessage: vi.fn().mockResolvedValue("0xMockSignature"),
      signTransaction: vi.fn().mockResolvedValue("0xMockTxSignature"),
    };

    mockAuditLog = {
      record: vi.fn(),
    } as unknown as SandboxAuditLog;

    service = new RemoteSigningService({
      signer: mockSigner,
      auditLog: mockAuditLog,
      approvalTimeoutMs: 1000,
    });
  });

  it("should get address from signer", async () => {
    const address = await service.getAddress();
    expect(address).toBe("0xMockAddress");
    expect(mockSigner.getAddress).toHaveBeenCalled();
  });

  it("should evaluate policy and sign transaction when allowed", async () => {
    const request: SigningRequest = {
      requestId: "req-1",
      chainId: 1,
      to: "0x123",
      value: "0",
      data: "0x",
      createdAt: Date.now(),
    };

    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(true);
    expect(result.signature).toBe("0xMockTxSignature");
    expect(result.humanConfirmed).toBe(false);
    expect(mockSigner.signTransaction).toHaveBeenCalledWith({
      to: "0x123",
      value: "0",
      data: "0x",
      chainId: 1,
      nonce: undefined,
      gasLimit: undefined,
    });
  });

  it("should require human confirmation when value exceeds threshold", async () => {
    const request: SigningRequest = {
      requestId: "req-2",
      chainId: 1,
      to: "0x123",
      // Exceeds default humanConfirmationThresholdWei (0.01 ETH)
      value: "20000000000000000",
      data: "0x",
      createdAt: Date.now(),
    };

    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Human confirmation required");
    expect(result.humanConfirmed).toBe(false);
    expect(mockSigner.signTransaction).not.toHaveBeenCalled();

    // Check pending approvals
    const pending = service.getPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0].requestId).toBe("req-2");
  });

  it("should allow human confirmation approval", async () => {
    const request: SigningRequest = {
      requestId: "req-3",
      chainId: 1,
      to: "0x123",
      value: "20000000000000000", // Requires confirmation
      data: "0x",
      createdAt: Date.now(),
    };

    await service.submitSigningRequest(request);

    const result = await service.approveRequest("req-3");

    expect(result.success).toBe(true);
    expect(result.signature).toBe("0xMockTxSignature");
    expect(result.humanConfirmed).toBe(true);
    expect(mockSigner.signTransaction).toHaveBeenCalled();
    expect(service.getPendingApprovals()).toHaveLength(0);
  });

  it("should handle rejection of human confirmation", async () => {
    const request: SigningRequest = {
      requestId: "req-4",
      chainId: 1,
      to: "0x123",
      value: "20000000000000000",
      data: "0x",
      createdAt: Date.now(),
    };

    await service.submitSigningRequest(request);

    const wasRejected = service.rejectRequest("req-4");
    expect(wasRejected).toBe(true);
    expect(service.getPendingApprovals()).toHaveLength(0);
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signing_request_rejected" })
    );
  });

  it("should handle non-existent approval request", async () => {
    const result = await service.approveRequest("non-existent");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No pending approval found for this request ID");
  });

  it("should expire pending approvals", async () => {
    const request: SigningRequest = {
      requestId: "req-5",
      chainId: 1,
      to: "0x123",
      value: "20000000000000000",
      data: "0x",
      createdAt: Date.now(),
    };

    await service.submitSigningRequest(request);

    // Simulate time passing beyond timeout
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);

    const result = await service.approveRequest("req-5");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Approval expired");
    expect(service.getPendingApprovals()).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it("should reject transaction when policy denies it", async () => {
    const request: SigningRequest = {
      requestId: "req-6",
      chainId: 1,
      to: "0x123",
      // Exceeds maxTransactionValueWei (0.1 ETH)
      value: "200000000000000000",
      data: "0x",
      createdAt: Date.now(),
    };

    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds max");
    expect(mockSigner.signTransaction).not.toHaveBeenCalled();
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signing_request_rejected" })
    );
  });

  it("should handle signing failure", async () => {
    mockSigner.signTransaction = vi.fn().mockRejectedValue(new Error("Signer error"));

    const request: SigningRequest = {
      requestId: "req-7",
      chainId: 1,
      to: "0x123",
      value: "0",
      data: "0x",
      createdAt: Date.now(),
    };

    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Signer error");
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signing_request_rejected", severity: "error" })
    );
  });

  it("should update policy", () => {
    const newPolicy = service.getPolicy();
    newPolicy.requireHumanConfirmation = true;

    service.updatePolicy(newPolicy);

    const updatedPolicy = service.getPolicy();
    expect(updatedPolicy.requireHumanConfirmation).toBe(true);
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "policy_decision" })
    );
  });
});
