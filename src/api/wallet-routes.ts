import type http from "node:http";
import { logger } from "@elizaos/core";
import { saveMilaidyConfig, type MilaidyConfig } from "../config/config.js";
import {
  error,
  json,
  readJsonBody,
} from "./utils.js";
import {
  fetchEvmBalances,
  fetchEvmNfts,
  fetchSolanaBalances,
  fetchSolanaNfts,
  generateWalletForChain,
  getWalletAddresses,
  importWallet,
  validatePrivateKey,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletNftsResponse,
} from "./wallet.js";

export interface WalletRouteState {
  config: MilaidyConfig;
}

export async function handleWalletRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: WalletRouteState,
): Promise<boolean> {
  // ── GET /api/wallet/addresses ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/addresses") {
    const addrs = getWalletAddresses();
    json(res, addrs);
    return true;
  }

  // ── GET /api/wallet/balances ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/balances") {
    const addrs = getWalletAddresses();
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (addrs.evmAddress && alchemyKey) {
      try {
        const chains = await fetchEvmBalances(addrs.evmAddress, alchemyKey);
        result.evm = { address: addrs.evmAddress, chains };
      } catch (err) {
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addrs.solanaAddress && heliusKey) {
      try {
        const solData = await fetchSolanaBalances(
          addrs.solanaAddress,
          heliusKey,
        );
        result.solana = { address: addrs.solanaAddress, ...solData };
      } catch (err) {
        logger.warn(`[wallet] Solana balance fetch failed: ${err}`);
      }
    }

    json(res, result);
    return true;
  }

  // ── GET /api/wallet/nfts ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/nfts") {
    const addrs = getWalletAddresses();
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletNftsResponse = { evm: [], solana: null };

    if (addrs.evmAddress && alchemyKey) {
      try {
        result.evm = await fetchEvmNfts(addrs.evmAddress, alchemyKey);
      } catch (err) {
        logger.warn(`[wallet] EVM NFT fetch failed: ${err}`);
      }
    }

    if (addrs.solanaAddress && heliusKey) {
      try {
        const nfts = await fetchSolanaNfts(addrs.solanaAddress, heliusKey);
        result.solana = { nfts };
      } catch (err) {
        logger.warn(`[wallet] Solana NFT fetch failed: ${err}`);
      }
    }

    json(res, result);
    return true;
  }

  // ── POST /api/wallet/import ──────────────────────────────────────────
  // Import a wallet by providing a private key + chain.
  if (method === "POST" && pathname === "/api/wallet/import") {
    const body = await readJsonBody<{ chain?: string; privateKey?: string }>(
      req,
      res,
    );
    if (!body) return true;

    if (!body.privateKey?.trim()) {
      error(res, "privateKey is required");
      return true;
    }

    // Auto-detect chain if not specified
    let chain: WalletChain;
    if (body.chain === "evm" || body.chain === "solana") {
      chain = body.chain;
    } else if (body.chain) {
      error(
        res,
        `Unsupported chain: ${body.chain}. Must be "evm" or "solana".`,
      );
      return true;
    } else {
      // Auto-detect from key format
      const detection = validatePrivateKey(body.privateKey.trim());
      chain = detection.chain;
    }

    const result = importWallet(chain, body.privateKey.trim());

    if (!result.success) {
      error(res, result.error ?? "Import failed", 422);
      return true;
    }

    // Persist to config.env so it survives restarts
    if (!state.config.env) state.config.env = {};
    const envKey = chain === "evm" ? "EVM_PRIVATE_KEY" : "SOLANA_PRIVATE_KEY";
    (state.config.env as Record<string, string>)[envKey] =
      process.env[envKey] ?? "";

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, {
      ok: true,
      chain,
      address: result.address,
    });
    return true;
  }

  // ── POST /api/wallet/generate ──────────────────────────────────────────
  // Generate a new wallet for a specific chain (or both).
  if (method === "POST" && pathname === "/api/wallet/generate") {
    const body = await readJsonBody<{ chain?: string }>(req, res);
    if (!body) return true;

    const chain = body.chain as string | undefined;
    const validChains: Array<WalletChain | "both"> = ["evm", "solana", "both"];

    if (chain && !validChains.includes(chain as WalletChain | "both")) {
      error(
        res,
        `Unsupported chain: ${chain}. Must be "evm", "solana", or "both".`,
      );
      return true;
    }

    const targetChain = (chain ?? "both") as WalletChain | "both";

    if (!state.config.env) state.config.env = {};

    const generated: Array<{ chain: WalletChain; address: string }> = [];

    if (targetChain === "both" || targetChain === "evm") {
      const result = generateWalletForChain("evm");
      process.env.EVM_PRIVATE_KEY = result.privateKey;
      (state.config.env as Record<string, string>).EVM_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "evm", address: result.address });
      logger.info(`[milaidy-api] Generated EVM wallet: ${result.address}`);
    }

    if (targetChain === "both" || targetChain === "solana") {
      const result = generateWalletForChain("solana");
      process.env.SOLANA_PRIVATE_KEY = result.privateKey;
      (state.config.env as Record<string, string>).SOLANA_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "solana", address: result.address });
      logger.info(`[milaidy-api] Generated Solana wallet: ${result.address}`);
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true, wallets: generated });
    return true;
  }

  // ── GET /api/wallet/config ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/config") {
    const addrs = getWalletAddresses();
    const configStatus: WalletConfigStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
      infuraKeySet: Boolean(process.env.INFURA_API_KEY),
      ankrKeySet: Boolean(process.env.ANKR_API_KEY),
      heliusKeySet: Boolean(process.env.HELIUS_API_KEY),
      birdeyeKeySet: Boolean(process.env.BIRDEYE_API_KEY),
      evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
      evmAddress: addrs.evmAddress,
      solanaAddress: addrs.solanaAddress,
    };
    json(res, configStatus);
    return true;
  }

  // ── PUT /api/wallet/config ─────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/wallet/config") {
    const body = await readJsonBody<Record<string, string>>(req, res);
    if (!body) return true;
    const allowedKeys = [
      "ALCHEMY_API_KEY",
      "INFURA_API_KEY",
      "ANKR_API_KEY",
      "HELIUS_API_KEY",
      "BIRDEYE_API_KEY",
    ];

    if (!state.config.env) state.config.env = {};

    for (const key of allowedKeys) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) {
        process.env[key] = value.trim();
        (state.config.env as Record<string, string>)[key] = value.trim();
      }
    }

    // If Helius key is set, also update SOLANA_RPC_URL for the plugin
    const heliusValue = body.HELIUS_API_KEY;
    if (typeof heliusValue === "string" && heliusValue.trim()) {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusValue.trim()}`;
      process.env.SOLANA_RPC_URL = rpcUrl;
      (state.config.env as Record<string, string>).SOLANA_RPC_URL = rpcUrl;
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    return true;
  }

  // ── POST /api/wallet/export ────────────────────────────────────────────
  // SECURITY: Requires { confirm: true } in the request body to prevent
  // accidental exposure of private keys.
  if (method === "POST" && pathname === "/api/wallet/export") {
    const body = await readJsonBody<{ confirm?: boolean }>(req, res);
    if (!body) return true;

    if (!body.confirm) {
      error(
        res,
        'Export requires explicit confirmation. Send { "confirm": true } in the request body.',
        403,
      );
      return true;
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? null;
    const solKey = process.env.SOLANA_PRIVATE_KEY ?? null;
    const addrs = getWalletAddresses();

    logger.warn("[wallet] Private keys exported via API");

    json(res, {
      evm: evmKey ? { privateKey: evmKey, address: addrs.evmAddress } : null,
      solana: solKey
        ? { privateKey: solKey, address: addrs.solanaAddress }
        : null,
    });
    return true;
  }

  return false;
}
