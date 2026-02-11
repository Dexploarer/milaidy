/**
 * MilaidyMaker drop/mint service.
 *
 * Handles the ERC-8041 fixed-supply collection minting:
 * - Public free mint (user pays gas)
 * - Shiny mint (0.1 ETH + gas)
 * - Whitelist mint (Merkle proof)
 * - Supply tracking and status
 */

import { logger } from "@elizaos/core";
import { ethers } from "ethers";
import type { TxService } from "./tx-service.js";

// ── ABI ──────────────────────────────────────────────────────────────────

const COLLECTION_ABI = [
  // Minting
  "function mint(string,string,bytes32) external returns (uint256)",
  "function mintShiny(string,string,bytes32) external payable returns (uint256)",
  "function mintWhitelist(string,string,bytes32,bytes32[]) external returns (uint256)",
  "function mintFor(address,string,string,bytes32,bool) external returns (uint256)",
  // Views
  "function currentSupply() view returns (uint256)",
  "function publicMintOpen() view returns (bool)",
  "function whitelistMintOpen() view returns (bool)",
  "function hasMinted(address) view returns (bool)",
  "function getAgentMintNumber(uint256) view returns (uint256)",
  "function isShiny(uint256) view returns (bool)",
  "function getCollectionDetails() view returns (uint256,uint256,bool)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function SHINY_PRICE() view returns (uint256)",
  "function merkleRoot() view returns (bytes32)",
  // Events
  "event AgentMinted(uint256 indexed agentId, uint256 indexed mintNumber, address indexed owner, bool shiny)",
  "event CollectionUpdated(uint256 maxSupply, uint256 currentSupply, bool publicOpen, bool whitelistOpen)",
] as const;

// ── Types ────────────────────────────────────────────────────────────────

export interface DropStatus {
  /** Whether the drop feature is enabled in config */
  dropEnabled: boolean;
  /** Whether public minting is open on-chain */
  publicMintOpen: boolean;
  /** Whether whitelist minting is open on-chain */
  whitelistMintOpen: boolean;
  /** Whether the collection is fully minted */
  mintedOut: boolean;
  /** Current number of minted tokens */
  currentSupply: number;
  /** Maximum supply (2138) */
  maxSupply: number;
  /** Shiny mint price in ETH */
  shinyPrice: string;
  /** Whether the current wallet has already minted */
  userHasMinted: boolean;
}

export interface MintResult {
  agentId: number;
  mintNumber: number;
  txHash: string;
  isShiny: boolean;
}

// ── Default capabilities hash ────────────────────────────────────────────

const DEFAULT_CAP_HASH = ethers.id("milaidy-agent");

// ── Service ──────────────────────────────────────────────────────────────

export class DropService {
  private readonly contract: ethers.Contract;
  private readonly txService: TxService;
  private readonly dropEnabled: boolean;

  constructor(
    txService: TxService,
    collectionAddress: string,
    dropEnabled: boolean,
  ) {
    this.txService = txService;
    this.contract = txService.getContract(collectionAddress, COLLECTION_ABI);
    this.dropEnabled = dropEnabled;
  }

  /**
   * Get the full drop status, combining on-chain state with config.
   */
  async getStatus(): Promise<DropStatus> {
    if (!this.dropEnabled) {
      return {
        dropEnabled: false,
        publicMintOpen: false,
        whitelistMintOpen: false,
        mintedOut: false,
        currentSupply: 0,
        maxSupply: 2138,
        shinyPrice: "0.1",
        userHasMinted: false,
      };
    }

    const [collectionDetails, whitelistOpen, hasMinted, shinyPriceBN] =
      await Promise.all([
        this.contract.getCollectionDetails() as Promise<
          [bigint, bigint, boolean]
        >,
        this.contract.whitelistMintOpen() as Promise<boolean>,
        this.contract.hasMinted(this.txService.address) as Promise<boolean>,
        this.contract.SHINY_PRICE() as Promise<bigint>,
      ]);

    const [maxSupply, currentSupply, publicOpen] = collectionDetails;
    const maxSupplyNum = Number(maxSupply);
    const currentSupplyNum = Number(currentSupply);

    return {
      dropEnabled: true,
      publicMintOpen: publicOpen,
      whitelistMintOpen: whitelistOpen,
      mintedOut: currentSupplyNum >= maxSupplyNum,
      currentSupply: currentSupplyNum,
      maxSupply: maxSupplyNum,
      shinyPrice: ethers.formatEther(shinyPriceBN),
      userHasMinted: hasMinted,
    };
  }

  /**
   * Mint a standard (free) agent from the collection.
   * User pays gas only. The NFT goes to the caller's wallet.
   */
  async mint(
    name: string,
    endpoint: string,
    capabilitiesHash?: string,
  ): Promise<MintResult> {
    const capHash = capabilitiesHash || DEFAULT_CAP_HASH;

    logger.info(`[drop] Minting agent "${name}" for ${this.txService.address}`);

    const tx = await this.contract.mint(name, endpoint, capHash);
    logger.info(`[drop] Mint tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    return this.parseMintReceipt(receipt, false);
  }

  /**
   * Mint a shiny agent from the collection.
   * User pays 0.1 ETH + gas. The NFT goes to the caller's wallet.
   */
  async mintShiny(
    name: string,
    endpoint: string,
    capabilitiesHash?: string,
  ): Promise<MintResult> {
    const capHash = capabilitiesHash || DEFAULT_CAP_HASH;
    const shinyPrice = (await this.contract.SHINY_PRICE()) as bigint;

    logger.info(
      `[drop] Minting SHINY agent "${name}" for ${this.txService.address} (${ethers.formatEther(shinyPrice)} ETH)`,
    );

    const tx = await this.contract.mintShiny(name, endpoint, capHash, {
      value: shinyPrice,
    });
    logger.info(`[drop] Shiny mint tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    return this.parseMintReceipt(receipt, true);
  }

  /**
   * Mint using a Merkle whitelist proof.
   */
  async mintWithWhitelist(
    name: string,
    endpoint: string,
    proof: string[],
    capabilitiesHash?: string,
  ): Promise<MintResult> {
    const capHash = capabilitiesHash || DEFAULT_CAP_HASH;

    logger.info(
      `[drop] Whitelist minting agent "${name}" for ${this.txService.address}`,
    );

    const tx = await this.contract.mintWhitelist(
      name,
      endpoint,
      capHash,
      proof,
    );
    logger.info(`[drop] Whitelist mint tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    return this.parseMintReceipt(receipt, false);
  }

  /**
   * Get the mint number for a given agentId (0 if not a collection mint).
   */
  async getMintNumber(agentId: number): Promise<number> {
    return Number(await this.contract.getAgentMintNumber(agentId));
  }

  /**
   * Check if a given agentId is a shiny mint.
   */
  async checkIsShiny(agentId: number): Promise<boolean> {
    return this.contract.isShiny(agentId) as Promise<boolean>;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private parseMintReceipt(
    receipt: ethers.TransactionReceipt,
    shiny: boolean,
  ): MintResult {
    const iface = new ethers.Interface(COLLECTION_ABI);
    let agentId = 0;
    let mintNumber = 0;

    for (const log of receipt.logs) {
      const parsed = iface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === "AgentMinted") {
        agentId = Number(parsed.args[0]);
        mintNumber = Number(parsed.args[1]);
        shiny = parsed.args[3] as boolean;
        break;
      }
    }

    logger.info(
      `[drop] Minted: agentId=${agentId} mintNumber=${mintNumber} shiny=${shiny} txHash=${receipt.hash}`,
    );

    return { agentId, mintNumber, txHash: receipt.hash, isShiny: shiny };
  }
}
