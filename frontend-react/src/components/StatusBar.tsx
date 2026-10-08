import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { HealthStatus, FabricStatus, IpfsStatus, ContractInfo } from "../lib/types";
import { clsx } from "clsx";

interface StatusData {
  backend: string;
  fabric: string;
  evm: string;
  ipfs: string;
  claims: string;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={clsx(
        "inline-block w-2 h-2 rounded-full mr-1.5",
        ok ? "bg-green-500" : "bg-red-500"
      )}
    />
  );
}

export function StatusBar() {
  const [status, setStatus] = useState<StatusData | null>(null);

  const refresh = async () => {
    const [health, contracts, fabric, ipfs, claims] = await Promise.allSettled([
      api.get<HealthStatus>("/health"),
      api.get<ContractInfo>("/api/contracts"),
      api.get<FabricStatus>("/api/fabric/status"),
      api.get<IpfsStatus>("/api/ipfs/status"),
      api.get<{ count: string }>("/api/reimbursement/claims/count"),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === "fulfilled" ? r.value : null;
    const h = ok(health);
    const c = ok(contracts);
    const f = ok(fabric);
    const ip = ok(ipfs);
    const cl = ok(claims);
    setStatus({
      backend: h?.status === "ok" ? "ok" : h ? "erreur" : "hors ligne",
      fabric: f?.mode ?? (h?.fabricConfigured ? "configuré" : "mock"),
      evm: c?.chainId ? `chain ${c.chainId}` : "—",
      ipfs: ip?.connected ? "connecté" : "hors ligne",
      claims: cl?.count ?? "—",
    });
  };

  useEffect(() => { void refresh(); }, []);

  const items: [string, string, boolean][] = status
    ? [
        ["API", status.backend, status.backend === "ok"],
        ["Fabric", status.fabric, status.fabric !== "erreur"],
        ["EVM", status.evm, status.evm !== "-"],
        ["IPFS", status.ipfs, status.ipfs === "connecté"],
        ["Remboursements", status.claims, true],
      ]
    : [];

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {status === null ? (
        <span className="text-xs text-gray-400">Chargement statut…</span>
      ) : (
        items.map(([label, value, ok]) => (
          <span key={label} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
            <Dot ok={ok} />
            <span className="font-medium">{label}:</span>&nbsp;{value}
          </span>
        ))
      )}
      <button
        onClick={() => void refresh()}
        className="text-xs text-brand-600 dark:text-brand-400 hover:underline ml-auto"
      >
        ↻ Actualiser
      </button>
    </div>
  );
}
