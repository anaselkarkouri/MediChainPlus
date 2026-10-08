import { useState, useCallback } from "react";
import { api } from "../lib/api";
import type { AuthState } from "../lib/types";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const STORAGE_TOKEN = "mc_token";
const STORAGE_ADDR = "mc_address";
const STORAGE_ROLES = "mc_roles";
const STORAGE_IDS = "mc_ids";

function loadSaved(): AuthState | null {
  const token = localStorage.getItem(STORAGE_TOKEN);
  const address = localStorage.getItem(STORAGE_ADDR);
  if (!token || !address) return null;
  const roles = JSON.parse(localStorage.getItem(STORAGE_ROLES) ?? "[]");
  const ids = JSON.parse(localStorage.getItem(STORAGE_IDS) ?? "{}");
  const demo = localStorage.getItem("mc_demo") === "1";
  return { token, address, roles, demo, ...ids };
}

export function useWallet() {
  const [auth, setAuth] = useState<AuthState | null>(loadSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveState = useCallback((verified: AuthState & { expiresInSeconds?: number }) => {
    const state: AuthState = {
      token: verified.token,
      address: verified.address,
      roles: verified.roles ?? [],
      demo: verified.demo,
      patientId: verified.patientId,
      doctorId: verified.doctorId,
      pharmacyId: verified.pharmacyId,
      insurerId: verified.insurerId,
    };
    localStorage.setItem(STORAGE_TOKEN, state.token);
    localStorage.setItem(STORAGE_ADDR, state.address);
    localStorage.setItem("mc_demo", state.demo ? "1" : "0");
    localStorage.setItem(STORAGE_ROLES, JSON.stringify(state.roles));
    localStorage.setItem(STORAGE_IDS, JSON.stringify({
      patientId: state.patientId,
      doctorId: state.doctorId,
      pharmacyId: state.pharmacyId,
      insurerId: state.insurerId,
    }));
    setAuth(state);
    return state;
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask non disponible");
    setLoading(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];

      const challenge = await api.post<{ message: string }>("/api/auth/challenge", { address });
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address],
      })) as string;

      const verified = await api.post<AuthState & { expiresInSeconds: number }>(
        "/api/auth/verify",
        { address, signature }
      );
      return saveState(verified);
    } finally {
      setLoading(false);
    }
  }, [saveState]);

  const connectDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const verified = await api.post<AuthState & { expiresInSeconds: number }>("/api/auth/demo", {});
      return saveState(verified);
    } finally {
      setLoading(false);
    }
  }, [saveState]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_ADDR);
    localStorage.removeItem("mc_demo");
    localStorage.removeItem(STORAGE_ROLES);
    localStorage.removeItem(STORAGE_IDS);
    setAuth(null);
    setError(null);
  }, []);

  return { auth, loading, error, connect, connectDemo, disconnect, setError };
}
