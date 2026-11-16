"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  DEFAULT_ADMIN_ROLE,
  ISSUER_ROLE,
  getContractReadOnly,
  READ_RPC_URL,
} from "../lib/contract";
import { api, UserProfile } from "../lib/api";

export type UserRole = "admin" | "issuer" | "holder" | "none" | null;

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  isSepolia: boolean;
  role: UserRole;
  isPaused: boolean;
  // False when paused() could not be read; the UI must then show "unknown", not "operational" (audit FE-02).
  isPauseKnown: boolean;
  isConnecting: boolean;
  isSigning: boolean;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  error: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetworkToSepolia: () => Promise<void>;
  refreshContractState: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getSigner: () => Promise<ethers.Signer | null>;
  clearError: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isPauseKnown, setIsPauseKnown] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  const clearError = () => setError(null);

  const getProvider = useCallback(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
    return null;
  }, []);

  const getSigner = useCallback(async (): Promise<ethers.Signer | null> => {
    const provider = getProvider();
    if (!provider) return null;
    try {
      return await provider.getSigner();
    } catch {
      return null;
    }
  }, [getProvider]);

  // Read smart contract state: Role & Pause status
  const checkContractState = useCallback(
    async (walletAddress: string, providerOrSigner: ethers.Provider | ethers.Signer) => {
      try {
        const contract = getContractReadOnly(providerOrSigner);

        const [isAdmin, isIssuer, paused] = await Promise.all([
          contract.hasRole(DEFAULT_ADMIN_ROLE, walletAddress).catch(() => false),
          contract.hasRole(ISSUER_ROLE, walletAddress).catch(() => false),
          contract.paused().then(
            (value: boolean) => ({ known: true, value }),
            () => ({ known: false, value: false })
          ),
        ]);

        setIsPaused(paused.value);
        setIsPauseKnown(paused.known);

        if (isAdmin) {
          setRole("admin");
          sessionStorage.setItem("sertichain_role", "admin");
          return "admin";
        } else if (isIssuer) {
          setRole("issuer");
          sessionStorage.setItem("sertichain_role", "issuer");
          return "issuer";
        } else {
          // Check holder balance
          const balance = await contract.balanceOf(walletAddress).catch(() => BigInt(0));
          if (balance > BigInt(0)) {
            setRole("holder");
            sessionStorage.setItem("sertichain_role", "holder");
            return "holder";
          } else {
            setRole("none");
            sessionStorage.setItem("sertichain_role", "none");
            return "none";
          }
        }
      } catch (err) {
        console.error("Failed to read role from smart contract:", err);
        setIsPauseKnown(false);
        setRole("none");
        return "none";
      }
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.getMyProfile();
      setProfile(p);
    } catch (err) {
      console.warn("Could not fetch user profile:", err);
    }
  }, []);

  const refreshContractState = useCallback(async () => {
    if (!account) return;
    const provider = getProvider();
    if (provider) {
      await checkContractState(account, provider);
    }
  }, [account, getProvider, checkContractState]);

  // Request network switch to Sepolia
  const switchNetworkToSepolia = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setError("MetaMask tidak terdeteksi. Silakan pasang ekstensi MetaMask.");
      return;
    }
    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      setError(null);
    } catch (switchError: any) {
      // 4902: Chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: "Sepolia Test Network",
                nativeCurrency: {
                  name: "Sepolia ETH",
                  symbol: "SEP",
                  decimals: 18,
                },
                rpcUrls: [READ_RPC_URL],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
          setError(null);
        } catch {
          setError("Gagal menambahkan jaringan Sepolia ke MetaMask.");
        }
      } else {
        setError("Gagal beralih ke jaringan Sepolia.");
      }
    }
  };

  // Full Connect & SIWE Authentication Flow (F-01, F-02, F-03)
  const connectWallet = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setError("Ekstensi MetaMask tidak ditemukan di browser Anda. Silakan pasang MetaMask untuk melanjutkan.");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      let provider = new ethers.BrowserProvider((window as any).ethereum);

      // 1. Request Accounts
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("Tidak ada akun yang dipilih di MetaMask.");
      }
      const rawAddress = accounts[0];
      const checksummedAddress = ethers.getAddress(rawAddress);
      const normalizedAddress = checksummedAddress.toLowerCase();

      // 2. Check Network
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      if (currentChainId !== SEPOLIA_CHAIN_ID) {
        // Prompt network switch
        try {
          await switchNetworkToSepolia();
        } catch {
          // Continue, user can switch manually via banner
        }
        // ethers v6 refuses to reuse a provider after the chain changes underneath it.
        provider = new ethers.BrowserProvider((window as any).ethereum);
      }

      setAccount(normalizedAddress);
      sessionStorage.setItem("sertichain_wallet", normalizedAddress);

      // 3. SIWE Authentication Flow (F-01)
      setIsSigning(true);
      const signer = await provider.getSigner();

      // Fetch nonce from backend
      const { nonce } = await api.getNonce(normalizedAddress);

      // Construct SIWE Message as agreed with Backend
      const domain = window.location.host;
      const origin = window.location.origin;

      const siweMessage = new SiweMessage({
        domain,
        address: checksummedAddress,
        statement: "Masuk ke SertiChain menggunakan wallet Ethereum Anda.",
        uri: origin,
        version: "1",
        chainId: SEPOLIA_CHAIN_ID,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const messageToSign = siweMessage.prepareMessage();

      // Sign SIWE message via MetaMask
      const signature = await signer.signMessage(messageToSign);

      // Verify signature on backend to get JWT session
      await api.verifySignature(messageToSign, signature);

      setIsAuthenticated(true);
      setIsSigning(false);

      // 4. Read Role directly from Smart Contract
      await checkContractState(normalizedAddress, provider);

      // 5. Fetch Profile (F-11)
      await refreshProfile();
    } catch (err: any) {
      setIsSigning(false);
      // Login did not finish, so the wallet must not look connected (it would show an address with no session).
      setAccount(null);
      setRole(null);
      setIsAuthenticated(false);
      sessionStorage.removeItem("sertichain_wallet");
      sessionStorage.removeItem("sertichain_token");
      sessionStorage.removeItem("sertichain_role");
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        // Cancelling in MetaMask is a normal user choice, not an application error.
        setError("Tanda tangan otentikasi dibatalkan di MetaMask.");
      } else {
        console.warn("Connect wallet error:", err);
        setError(err.message || "Gagal menghubungkan wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect & Logout Flow (F-02)
  const disconnectWallet = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccount(null);
      setRole(null);
      setIsAuthenticated(false);
      setProfile(null);
      setError(null);
      sessionStorage.removeItem("sertichain_wallet");
      sessionStorage.removeItem("sertichain_token");
      sessionStorage.removeItem("sertichain_role");
    }
  }, []);

  // Initialize & Listen to MetaMask events
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;

    const ethereum = (window as any).ethereum;

    // Check existing chain
    ethereum.request({ method: "eth_chainId" }).then((hexChainId: string) => {
      setChainId(parseInt(hexChainId, 16));
    }).catch(() => {});

    // Check if session token already exists in sessionStorage
    const savedToken = sessionStorage.getItem("sertichain_token");
    const savedWallet = sessionStorage.getItem("sertichain_wallet");

    if (savedToken && savedWallet) {
      const provider = new ethers.BrowserProvider(ethereum);
      provider.listAccounts().then((accounts) => {
        if (accounts.length > 0 && accounts[0].address.toLowerCase() === savedWallet.toLowerCase()) {
          const addr = accounts[0].address.toLowerCase();
          setAccount(addr);
          setIsAuthenticated(true);
          checkContractState(addr, provider);
          api.getMyProfile().then(setProfile).catch((err) => {
            // An expired or revoked token means the saved session is no longer valid.
            if (err?.status === 401) disconnectWallet();
          });
        } else {
          // Wallet changed or locked
          disconnectWallet();
        }
      }).catch(() => {});
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        const newAddress = ethers.getAddress(accounts[0]).toLowerCase();
        if (account && newAddress !== account) {
          // The session token was signed by the previous wallet, so it must not carry over to this one.
          disconnectWallet();
        }
      }
    };

    const handleChainChanged = (hexChainId: string) => {
      const newChainId = parseInt(hexChainId, 16);
      setChainId(newChainId);
      if (account) {
        const provider = new ethers.BrowserProvider(ethereum);
        checkContractState(account, provider);
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener("accountsChanged", handleAccountsChanged);
        ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [account, checkContractState, disconnectWallet]);

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        isSepolia,
        role,
        isPaused,
        isPauseKnown,
        isConnecting,
        isSigning,
        isAuthenticated,
        profile,
        error,
        connectWallet,
        disconnectWallet,
        switchNetworkToSepolia,
        refreshContractState,
        refreshProfile,
        getSigner,
        clearError,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
