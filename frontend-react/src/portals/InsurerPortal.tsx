import { useState } from "react";
import { api } from "../lib/api";
import { JsonOutput } from "../components/JsonOutput";
import type { AuthState } from "../lib/types";

interface Props {
  auth: AuthState;
  toast: (msg: string, kind?: "success" | "error" | "info") => void;
}

export function InsurerPortal({ auth, toast }: Props) {
  const [output, setOutput] = useState<unknown>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [claimId, setClaimId] = useState("");
  const [fundEth, setFundEth] = useState("0.5");
  const [fromBlock, setFromBlock] = useState("0");
  const [toBlock, setToBlock] = useState("latest");

  async function run<T>(fn: () => Promise<T>) {
    setLoading(true);
    setIsError(false);
    try {
      const result = await fn();
      setOutput(result);
      toast("Succès", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutput({ error: msg });
      setIsError(true);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  const blockParams = () =>
    fromBlock ? `?fromBlock=${fromBlock}&toBlock=${toBlock}` : "";

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Vue d'ensemble</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.get("/api/reimbursement/balance"))}>
            Solde contrat
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get("/api/reimbursement/claims/count"))}>
            Nombre de claims
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-base mb-3">Gestion des remboursements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Claim ID</label>
            <input className="input" value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">Montant à provisionner (ETH)</label>
            <input className="input" type="number" step="0.1" value={fundEth} onChange={(e) => setFundEth(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/reimbursement/claims/${encodeURIComponent(claimId)}`, auth.token))}>
            Consulter claim
          </button>
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.post(`/api/reimbursement/claims/${encodeURIComponent(claimId)}/validate`,
              {}, auth.token))}>
            Valider claim
          </button>
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.post(`/api/reimbursement/claims/${encodeURIComponent(claimId)}/pay`,
              {}, auth.token))}>
            Exécuter paiement
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.post("/api/reimbursement/fund", { amountEth: fundEth }, auth.token))}>
            Provisionner contrat
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-base mb-3">Événements blockchain (Polygon)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Bloc début</label>
            <input className="input" type="number" value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} />
          </div>
          <div>
            <label className="label">Bloc fin</label>
            <input className="input" value={toBlock} onChange={(e) => setToBlock(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/reimbursement/events/submitted${blockParams()}`, auth.token))}>
            Claims soumis
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/reimbursement/events/approved${blockParams()}`, auth.token))}>
            Claims approuvés
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/reimbursement/events/payments${blockParams()}`, auth.token))}>
            Paiements exécutés
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/drugs/events/registered${blockParams()}`, auth.token))}>
            Médicaments enregistrés
          </button>
        </div>
      </div>

      <JsonOutput data={output} isError={isError} />
    </div>
  );
}
