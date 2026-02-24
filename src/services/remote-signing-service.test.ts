import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxAuditLog } from "../security/audit-log";
import {
  RemoteSigningService,
  type SignerBackend,
} from "./remote-signing-service";
import { createDefaultPolicy, type SigningRequest } from "./signing-policy";

// Mock SignerBackend
const mockSigner = {
  getAddress: vi.fn(),
  signMessage: vi.fn(),
  signTransaction: vi.fn(),
};

// Mock AuditLog
const mockAuditLog = {
  record: vi.fn(),
} as unknown as SandboxAuditLog;

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Date.now()}`,
    chainId: 1,
    to: "0x1234567890abcdef1234567890abcdef12345678",
    value: "0",
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("RemoteSigningService", () => {
  let service: RemoteSigningService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSigner.getAddress.mockResolvedValue("0xsigner");
    mockSigner.signTransaction.mockResolvedValue("0xsignature");

    service = new RemoteSigningService({
      signer: mockSigner,
      policy: createDefaultPolicy(),
      auditLog: mockAuditLog,
      approvalTimeoutMs: 1000,
    });
  });

  it("should return signer address", async () => {
    const address = await service.getAddress();
    expect(address).toBe("0xsigner");
  });

  it("should sign compliant transaction", async () => {
    const request = makeRequest();
    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(true);
    expect(result.signature).toBe("0xsignature");
    expect(mockSigner.signTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: request.to,
        chainId: request.chainId,
      }),
    );
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signing_request_approved" }),
    );
  });

  it("should reject non-compliant transaction", async () => {
    // Policy defaults allow 0.1 ETH. Request 1 ETH.
    const request = makeRequest({ value: "1000000000000000000" });
    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds max");
    expect(mockSigner.signTransaction).not.toHaveBeenCalled();
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signing_request_rejected" }),
    );
  });

  it("should require confirmation for high value transaction", async () => {
    // Policy confirmation threshold default is 0.01 ETH.
    // Request 0.05 ETH (allowed but requires confirmation)
    const request = makeRequest({ value: "50000000000000000" });
    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Human confirmation required");
    expect(result.policyDecision.requiresHumanConfirmation).toBe(true);
    expect(mockSigner.signTransaction).not.toHaveBeenCalled();

    // Check pending approvals
    const approvals = service.getPendingApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0].requestId).toBe(request.requestId);
  });

  it("should approve pending request", async () => {
    const request = makeRequest({ value: "50000000000000000" });
    await service.submitSigningRequest(request);

    const result = await service.approveRequest(request.requestId);
    expect(result.success).toBe(true);
    expect(result.signature).toBe("0xsignature");
    expect(result.humanConfirmed).toBe(true);
    expect(service.getPendingApprovals()).toHaveLength(0);
  });

  it("should handle signer errors", async () => {
    mockSigner.signTransaction.mockRejectedValue(new Error("RPC error"));
    const request = makeRequest();
    const result = await service.submitSigningRequest(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain("RPC error");
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signing_request_rejected",
        severity: "error",
      }),
    );
  });

  it("should reject unknown approval ID", async () => {
    const result = await service.approveRequest("unknown-id");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No pending approval");
  });

  it("should allow manual rejection", async () => {
    const request = makeRequest({ value: "50000000000000000" });
    await service.submitSigningRequest(request);

    const existed = service.rejectRequest(request.requestId);
    expect(existed).toBe(true);
    expect(service.getPendingApprovals()).toHaveLength(0);
  });

  it("should handle expired approvals", async () => {
    vi.useFakeTimers();
    const request = makeRequest({ value: "50000000000000000" });
    await service.submitSigningRequest(request);

    // Fast forward past expiration (timeout is 1000ms in beforeEach)
    vi.advanceTimersByTime(2000);

    const result = await service.approveRequest(request.requestId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Approval expired");
    expect(service.getPendingApprovals()).toHaveLength(0);

    vi.useRealTimers();
  });
});
