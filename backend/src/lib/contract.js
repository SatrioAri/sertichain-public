import { Contract, JsonRpcProvider, ZeroHash, id } from "ethers";
import { config } from "../config.js";

const provider = new JsonRpcProvider(config.SEPOLIA_RPC_URL, config.CHAIN_ID, { staticNetwork: true });

const abi = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function paused() view returns (bool)",
];

const sertiChain = new Contract(config.CONTRACT_ADDRESS, abi, provider);

export const ADMIN_ROLE = ZeroHash;
export const ISSUER_ROLE = id("ISSUER_ROLE");

export function isAdmin(wallet) {
  return sertiChain.hasRole(ADMIN_ROLE, wallet);
}

export function isIssuer(wallet) {
  return sertiChain.hasRole(ISSUER_ROLE, wallet);
}

export async function isHolder(wallet) {
  return (await sertiChain.balanceOf(wallet)) > 0n;
}

export function isPaused() {
  return sertiChain.paused();
}
