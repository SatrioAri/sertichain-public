import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// The deployer wallet becomes the first admin. It must not be used as an issuer later.
export default buildModule("SertiChainModule", (m) => {
  const admin = m.getParameter("admin", m.getAccount(0));
  const sertiChain = m.contract("SertiChain", [admin]);

  return { sertiChain };
});
