// Prints a session token for testing protected endpoints before /auth/verify exists. Local use only.
import { isAddress } from "ethers";
import { signSession } from "../src/lib/session.js";

const wallet = process.argv[2];

if (!wallet || !isAddress(wallet)) {
  console.error("Cara pakai: npm run dev-token -- <wallet address>");
  process.exit(1);
}

console.log(signSession(wallet));
