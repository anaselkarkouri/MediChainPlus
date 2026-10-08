import { useState } from "react";
import { api } from "../lib/api";
import { JsonOutput } from "../components/JsonOutput";
import type { AuthState } from "../lib/types";

interface Props {
  auth: AuthState;
  toast: (msg: string, kind?: "success" | "error" | "info") => void;
}

export function PharmacyPortal({ auth, toast }: Props) {
  const [output, setOutput] = useState<unknown>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rxId, setRxId] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [expectedSig, setExpectedSig] = useState("");
  const [batchId, setBatchId] = useState("");
  const [drugStatus, setDrugStatus] = useState("DELIVERED");

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

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Gestion des prescriptions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">ID Prescription</label>
            <input className="input" value={rxId} onChange={(e) => setRxId(e.target.value)} placeholder="RX-xxx" />
          </div>
          <div>
            <label className="label">ID Pharmacie</label>
            <input className="input" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} placeholder="PHARM-001" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Signature attendue (vérification)</label>
            <input className="input" value={expectedSig} onChange={(e) => setExpectedSig(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/prescriptions/${encodeURIComponent(rxId)}`, auth.token))}>
            Consulter prescription
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.post(`/api/fabric/prescriptions/${encodeURIComponent(rxId)}/verify-signature`,
              { expectedSignatureHash: expectedSig }, auth.token))}>
            Vérifier signature
          </button>
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.patch(`/api/fabric/prescriptions/${encodeURIComponent(rxId)}/dispense`,
              { pharmacyId }, auth.token))}>
            Dispenser
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/prescriptions/pharmacy/${encodeURIComponent(pharmacyId)}`, auth.token))}>
            Mes prescriptions
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-base mb-3">Traçabilité médicaments (QR / Batch)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Batch ID</label>
            <input className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="BATCH-001" />
          </div>
          <div>
            <label className="label">Nouveau statut</label>
            <select className="input" value={drugStatus} onChange={(e) => setDrugStatus(e.target.value)}>
              <option value="MANUFACTURED">MANUFACTURED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="DISPENSED">DISPENSED</option>
              <option value="RECALLED">RECALLED</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.get(`/api/drugs/${encodeURIComponent(batchId)}`))}>
            Vérifier médicament
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/drugs/${encodeURIComponent(batchId)}/history`))}>
            Historique blockchain
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.post(`/api/drugs/${encodeURIComponent(batchId)}/status`,
              { status: drugStatus }, auth.token))}>
            Mettre à jour statut
          </button>
        </div>
      </div>

      <JsonOutput data={output} isError={isError} />
    </div>
  );
}
