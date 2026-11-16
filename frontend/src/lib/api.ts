/**
 * SertiChain API Client
 * Connects to Express Backend (http://localhost:4000)
 * Set NEXT_PUBLIC_USE_MOCK_API=true only for UI work without a backend. Without it, every call goes to
 * the real backend and errors are shown to the user, never replaced by mock data.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export interface UserProfile {
  id: string;
  wallet_address: string;
  full_name: string;
  student_id?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NonceResponse {
  nonce: string;
}

export interface VerifyResponse {
  token: string;
}

export interface FileUploadResponse {
  fileHash: string;
  cid: string;
}

export interface AdminUsersResponse {
  users: UserProfile[];
  total: number;
}

export interface PublicProfile {
  full_name: string;
}

// Mock mode only: profiles live in localStorage so the UI can be clicked through without a backend.
const MOCK_STORAGE_USERS_KEY = "sertichain_mock_users";

function getMockUsers(): UserProfile[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(MOCK_STORAGE_USERS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback
    }
  }
  // Placeholder seed data for mock mode, not real people.
  const seedUsers: UserProfile[] = [
    {
      id: "7b0a88e9-5cf2-4c2f-b4b1-789a888c3a11",
      wallet_address: "0x5edebdc977ac66de68d2b7a7ec717382db98d002",
      full_name: "Contoh Admin",
      student_id: "0000000001",
      email: "admin@example.com",
      avatar_url: null,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: "9c1b99f0-6da3-4d3e-c5c2-890b999d4b22",
      wallet_address: "0x821b1da745835553c56a87be2141744486b2056a",
      full_name: "Contoh Issuer",
      student_id: "0000000002",
      email: "issuer@example.com",
      avatar_url: null,
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: "4d2c88a1-7eb4-4e4f-d6d3-901c000e5c33",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      full_name: "Contoh Holder",
      student_id: "0000000003",
      email: "holder@example.com",
      avatar_url: null,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ];
  localStorage.setItem(MOCK_STORAGE_USERS_KEY, JSON.stringify(seedUsers));
  return seedUsers;
}

function saveMockUsers(users: UserProfile[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(MOCK_STORAGE_USERS_KEY, JSON.stringify(users));
  }
}

class ApiService {
  private getAuthHeader(token?: string | null): Record<string, string> {
    const jwt = token || (typeof window !== "undefined" ? sessionStorage.getItem("sertichain_token") : null);
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }

  // Calls the real backend. Network failures and non-2xx responses become readable errors.
  private async request(path: string, init: RequestInit, fallbackMessage: string): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}${path}`, init);
    } catch {
      throw new Error(`Backend tidak bisa dihubungi di ${BACKEND_URL}. Pastikan backend sudah berjalan.`);
    }
    if (res.ok) return res;
    if (res.status === 401 && typeof window !== "undefined") {
      sessionStorage.removeItem("sertichain_token");
    }
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error || `${fallbackMessage} (HTTP ${res.status})`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  // 1. Request Nonce (F-01)
  async getNonce(address: string): Promise<NonceResponse> {
    if (!USE_MOCK) {
      const res = await this.request(
        "/auth/nonce",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) },
        "Gagal meminta nonce"
      );
      return res.json();
    }

    const randomNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { nonce: randomNonce };
  }

  // 2. Verify SIWE Signature (F-01)
  async verifySignature(message: string, signature: string): Promise<VerifyResponse> {
    let data: VerifyResponse;
    if (!USE_MOCK) {
      const res = await this.request(
        "/auth/verify",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) },
        "Gagal verifikasi login"
      );
      data = await res.json();
    } else {
      data = { token: "mock_jwt_" + btoa(JSON.stringify({ signature: signature.substring(0, 16), timestamp: Date.now() })) };
    }

    if (typeof window !== "undefined" && data.token) {
      sessionStorage.setItem("sertichain_token", data.token);
    }
    return data;
  }

  // 3. Logout (F-02)
  async logout(): Promise<void> {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("sertichain_token") : null;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sertichain_token");
      sessionStorage.removeItem("sertichain_role");
    }

    if (!USE_MOCK && token) {
      try {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // The local session is already cleared; a failed revoke call only leaves the token to expire on its own.
      }
    }
  }

  // 4. Get Current User Profile (F-11)
  async getMyProfile(): Promise<UserProfile | null> {
    if (!USE_MOCK) {
      try {
        const res = await this.request("/users/me", { headers: this.getAuthHeader() }, "Gagal memuat profil");
        return await res.json();
      } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
      }
    }

    const wallet = typeof window !== "undefined" ? sessionStorage.getItem("sertichain_wallet")?.toLowerCase() : null;
    if (!wallet) return null;
    return getMockUsers().find((u) => u.wallet_address.toLowerCase() === wallet) || null;
  }

  // 5. Create Profile (F-11)
  async createProfile(data: {
    full_name: string;
    student_id?: string;
    email?: string;
    avatar_url?: string;
  }): Promise<UserProfile> {
    if (!USE_MOCK) {
      const res = await this.request(
        "/users/me",
        { method: "POST", headers: { "Content-Type": "application/json", ...this.getAuthHeader() }, body: JSON.stringify(data) },
        "Gagal membuat profil"
      );
      return res.json();
    }

    const wallet = (typeof window !== "undefined" ? sessionStorage.getItem("sertichain_wallet") : "")?.toLowerCase() || "";
    const users = getMockUsers();
    if (users.some((u) => u.wallet_address === wallet)) {
      throw new Error("Profil untuk akun wallet ini sudah terdaftar.");
    }
    const newProfile: UserProfile = {
      id: crypto.randomUUID(),
      wallet_address: wallet,
      full_name: data.full_name,
      student_id: data.student_id || null,
      email: data.email || null,
      avatar_url: data.avatar_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    users.push(newProfile);
    saveMockUsers(users);
    return newProfile;
  }

  // 6. Update Profile (F-11)
  async updateProfile(data: {
    full_name?: string;
    student_id?: string;
    email?: string;
    avatar_url?: string;
  }): Promise<UserProfile> {
    if (!USE_MOCK) {
      const res = await this.request(
        "/users/me",
        { method: "PUT", headers: { "Content-Type": "application/json", ...this.getAuthHeader() }, body: JSON.stringify(data) },
        "Gagal memperbarui profil"
      );
      return res.json();
    }

    const wallet = (typeof window !== "undefined" ? sessionStorage.getItem("sertichain_wallet") : "")?.toLowerCase();
    const users = getMockUsers();
    const userIndex = users.findIndex((u) => u.wallet_address === wallet);
    if (userIndex === -1) {
      throw new Error("Profil tidak ditemukan. Silakan buat profil terlebih dahulu.");
    }
    const updated: UserProfile = { ...users[userIndex], ...data, updated_at: new Date().toISOString() };
    users[userIndex] = updated;
    saveMockUsers(users);
    return updated;
  }

  // 7. Delete Profile (F-11)
  async deleteProfile(): Promise<void> {
    if (!USE_MOCK) {
      await this.request("/users/me", { method: "DELETE", headers: this.getAuthHeader() }, "Gagal menghapus profil");
      return;
    }

    const wallet = (typeof window !== "undefined" ? sessionStorage.getItem("sertichain_wallet") : "")?.toLowerCase();
    saveMockUsers(getMockUsers().filter((u) => u.wallet_address !== wallet));
  }

  // 8. Admin: List All Users (F-12). The backend answers { data, page, limit, total }.
  async getAdminUsers(page: number = 1, limit: number = 20): Promise<AdminUsersResponse> {
    if (!USE_MOCK) {
      const res = await this.request(
        `/admin/users?page=${page}&limit=${limit}`,
        { headers: this.getAuthHeader() },
        "Gagal memuat daftar pengguna"
      );
      const body = await res.json();
      return { users: body.data ?? [], total: body.total ?? 0 };
    }

    const users = getMockUsers();
    const start = (page - 1) * limit;
    return { users: users.slice(start, start + limit), total: users.length };
  }

  // 9. Admin: Delete User by ID (F-12)
  async deleteAdminUser(id: string): Promise<void> {
    if (!USE_MOCK) {
      await this.request(
        `/admin/users/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: this.getAuthHeader() },
        "Gagal menghapus pengguna"
      );
      return;
    }

    saveMockUsers(getMockUsers().filter((u) => u.id !== id));
  }

  // 10. Issuer: Upload PDF to IPFS via Backend POST /files (F-05)
  async uploadCertificatePdf(file: File): Promise<FileUploadResponse> {
    if (!USE_MOCK) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await this.request(
        "/files",
        { method: "POST", headers: this.getAuthHeader(), body: formData },
        "Gagal mengunggah berkas PDF"
      );
      return res.json();
    }

    // Mock mode only: no file reaches IPFS, so the CID is a placeholder that must never be used on Sepolia.
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { fileHash, cid: `mock-${fileHash.slice(2, 18)}` };
  }

  // 11. Public: recipient name for the verification page (F-09). Null when the wallet has no profile.
  async getPublicProfile(wallet: string): Promise<PublicProfile | null> {
    if (USE_MOCK) {
      const user = getMockUsers().find((u) => u.wallet_address.toLowerCase() === wallet.toLowerCase());
      return user ? { full_name: user.full_name } : null;
    }
    try {
      const res = await this.request(`/public/profiles/${encodeURIComponent(wallet)}`, {}, "Gagal memuat nama penerima");
      return await res.json();
    } catch {
      return null;
    }
  }
}

export const api = new ApiService();
