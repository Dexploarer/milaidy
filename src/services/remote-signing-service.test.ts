import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemoteSigningService, type SignerBackend } from "./remote-signing-service.js";
import { SigningPolicyEvaluator } from "./signing-policy.js";

describe("RemoteSigningService", () => {
    let mockSigner: SignerBackend;
    let mockAuditLog: any;
    let service: RemoteSigningService;

    beforeEach(() => {
        mockSigner = {
            getAddress: vi.fn().mockResolvedValue("0xMockAddress"),
            signMessage: vi.fn().mockResolvedValue("0xMockSignature"),
            signTransaction: vi.fn().mockResolvedValue("0xMockTxSignature")
        };

        mockAuditLog = {
            record: vi.fn()
        };

        service = new RemoteSigningService({
            signer: mockSigner,
            auditLog: mockAuditLog,
            approvalTimeoutMs: 1000
        });
    });

    describe("getAddress", () => {
        it("should return the signer address", async () => {
            const addr = await service.getAddress();
            expect(addr).toBe("0xMockAddress");
            expect(mockSigner.getAddress).toHaveBeenCalled();
        });
    });

    describe("submitSigningRequest", () => {
        it("should reject request if policy disallows it", async () => {
            // Evaluator allows by default if no policy, so we'll mock evaluate
            vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: false,
                reason: "Mock rejection",
                requiresHumanConfirmation: false,
                matchedRule: "mock_rule"
            });

            const result = await service.submitSigningRequest({
                requestId: "req-1",
                chainId: 1,
                to: "0x123",
                value: "0",
                data: "0x"
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe("Mock rejection");
            expect(mockAuditLog.record).toHaveBeenCalledWith(expect.objectContaining({
                type: "signing_request_rejected"
            }));
            expect(mockSigner.signTransaction).not.toHaveBeenCalled();
        });

        it("should return pending if human confirmation required", async () => {
             vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Needs approval",
                requiresHumanConfirmation: true,
                matchedRule: "mock_rule"
            });

            const result = await service.submitSigningRequest({
                requestId: "req-2",
                chainId: 1,
                to: "0x123",
                value: "0",
                data: "0x"
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("Human confirmation required");
            expect(service.getPendingApprovals()).toHaveLength(1);
            expect(mockSigner.signTransaction).not.toHaveBeenCalled();
        });

        it("should sign transaction directly if allowed and no human confirmation needed", async () => {
            vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Allowed",
                requiresHumanConfirmation: false,
                matchedRule: "mock_rule"
            });

            const result = await service.submitSigningRequest({
                requestId: "req-3",
                chainId: 1,
                to: "0x123",
                value: "100",
                data: "0x"
            });

            expect(result.success).toBe(true);
            expect(result.signature).toBe("0xMockTxSignature");
            expect(mockSigner.signTransaction).toHaveBeenCalledWith({
                 to: "0x123",
                 value: "100",
                 data: "0x",
                 chainId: 1,
                 nonce: undefined,
                 gasLimit: undefined
            });
            expect(mockAuditLog.record).toHaveBeenCalledWith(expect.objectContaining({
                type: "signing_request_approved"
            }));
        });

        it("should handle signing error gracefully", async () => {
            vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Allowed",
                requiresHumanConfirmation: false,
                matchedRule: "mock_rule"
            });

            vi.mocked(mockSigner.signTransaction).mockRejectedValueOnce(new Error("Signer error"));

            const result = await service.submitSigningRequest({
                requestId: "req-4",
                chainId: 1,
                to: "0x123",
                value: "100",
                data: "0x"
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("Signing failed: Signer error");
        });
    });

    describe("approveRequest", () => {
        it("should approve a pending request and sign it", async () => {
             vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Needs approval",
                requiresHumanConfirmation: true,
                matchedRule: "mock_rule"
            });

            await service.submitSigningRequest({
                requestId: "req-5",
                chainId: 1,
                to: "0x123",
                value: "0",
                data: "0x"
            });

            const result = await service.approveRequest("req-5");

            expect(result.success).toBe(true);
            expect(result.signature).toBe("0xMockTxSignature");
            expect(result.humanConfirmed).toBe(true);
            expect(service.getPendingApprovals()).toHaveLength(0);
        });

        it("should return error if request ID not found", async () => {
            const result = await service.approveRequest("missing-req");
            expect(result.success).toBe(false);
            expect(result.error).toContain("No pending approval found");
        });

        it("should return error if approval has expired", async () => {
             vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Needs approval",
                requiresHumanConfirmation: true,
                matchedRule: "mock_rule"
            });

            await service.submitSigningRequest({
                requestId: "req-6",
                chainId: 1,
                to: "0x123",
                value: "0",
                data: "0x"
            });

            // Fast forward time past 1000ms
            const realDateNow = Date.now.bind(global.Date);
            global.Date.now = () => realDateNow() + 2000;

            const result = await service.approveRequest("req-6");

            expect(result.success).toBe(false);
            expect(result.error).toContain("Approval expired");

            // Restore Date.now
            global.Date.now = realDateNow;
        });
    });

    describe("rejectRequest", () => {
        it("should reject a pending request and return true", async () => {
             vi.spyOn(SigningPolicyEvaluator.prototype, "evaluate").mockReturnValueOnce({
                allowed: true,
                reason: "Needs approval",
                requiresHumanConfirmation: true,
                matchedRule: "mock_rule"
            });

            await service.submitSigningRequest({
                requestId: "req-7",
                chainId: 1,
                to: "0x123",
                value: "0",
                data: "0x"
            });

            const existed = service.rejectRequest("req-7");

            expect(existed).toBe(true);
            expect(service.getPendingApprovals()).toHaveLength(0);
            expect(mockAuditLog.record).toHaveBeenCalledWith(expect.objectContaining({
                type: "signing_request_rejected",
                summary: "Human rejected request req-7"
            }));
        });

        it("should return false if request ID not found", () => {
            const existed = service.rejectRequest("missing-req");
            expect(existed).toBe(false);
        });
    });

    describe("updatePolicy", () => {
        it("should update policy evaluator and record audit log", () => {
            const mockPolicy = { version: "1", rules: [] };
            service.updatePolicy(mockPolicy);

            expect(service.getPolicy()).toEqual(mockPolicy);
            expect(mockAuditLog.record).toHaveBeenCalledWith(expect.objectContaining({
                type: "policy_decision",
                summary: "Signing policy updated"
            }));
        });
    });
});
