import { useState } from "react";
import { api } from "../lib/api";
import { JsonOutput } from "../components/JsonOutput";
import type { AuthState } from "../lib/types";

interface Props {
  auth: AuthState;
  toast: (msg: string, kind?: "success" | "error" | "info") => void;
}

export function PatientPortal({ auth, toast }: Props) {
  const [pid, setPid] = useState("");
  const [output, setOutput] = useState<unknown>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Enregistrer patient
  const [regId, setRegId] = useState("");
  const [regName, setRegName] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regBlood, setRegBlood] = useState("A+");
  const [regDid, setRegDid] = useState("");
  const [regWallet, setRegWallet] = useState("");

  // Consentements
  const [consentGrantee, setConsentGrantee] = useState("");
  const [consentScope, setConsentScope] = useState("records:read");
  const [consentExpires, setConsentExpires] = useState("");
  const [consentId, setConsentId] = useState("");

  // Remboursement
  const [claimAmount, setClaimAmount] = useState("0.01");
  const [claimRecordId, setClaimRecordId] = useState("");

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

      {/* Enregistrer nouveau patient */}
      <div className="card">
        <h3 className="font-semibold text-base mb-4">Enregistrer un patient</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">ID Patient</label>
            <input className="input" value={regId} onChange={(e) => setRegId(e.target.value)} placeholder="Ex: PAT-002" />
          </div>
          <div>
            <label className="label">Nom complet</label>
            <input className="input" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Ex: Marie Martin" />
          </div>
          <div>
            <label className="label">Date de naissance</label>
            <input className="input" type="date" value={regDob} onChange={(e) => setRegDob(e.target.value)} />
          </div>
          <div>
            <label className="label">Groupe sanguin</label>
            <select className="input" value={regBlood} onChange={(e) => setRegBlood(e.target.value)}>
              {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label">DID (identifiant décentralisé)</label>
            <input className="input" value={regDid} onChange={(e) => setRegDid(e.target.value)} placeholder="did:ethr:0x..." />
          </div>
          <div>
            <label className="label">Adresse wallet</label>
            <input className="input" value={regWallet} onChange={(e) => setRegWallet(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <button className="btn-primary" disabled={loading}
          onClick={() => run(() => api.post("/api/fabric/patients", {
            patientId: regId,
            name: regName,
            dateOfBirth: regDob,
            bloodGroup: regBlood,
            did: regDid || `did:ethr:${regWallet || "0x0"}`,
            walletAddress: regWallet || "0x0000000000000000000000000000000000000000",
          }, auth.token))}>
          Enregistrer patient
        </button>
      </div>

      {/* Consulter dossier */}
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Consulter dossier patient</h3>
        <label className="label">ID Patient</label>
        <input className="input mb-3" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="PAT-001" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/patients/${encodeURIComponent(pid)}`, auth.token))}>
            Voir profil
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/records/patient/${encodeURIComponent(pid)}`, auth.token))}>
            Dossiers médicaux
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/prescriptions/patient/${encodeURIComponent(pid)}`, auth.token))}>
            Prescriptions
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/patients/${encodeURIComponent(pid)}/consents`, auth.token))}>
            Consentements
          </button>
        </div>
      </div>

      {/* Gestion des consentements */}
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Gestion des consentements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Grantee ID (médecin / pharmacie)</label>
            <input className="input" value={consentGrantee} onChange={(e) => setConsentGrantee(e.target.value)} placeholder="DOC-007" />
          </div>
          <div>
            <label className="label">Scope</label>
            <select className="input" value={consentScope} onChange={(e) => setConsentScope(e.target.value)}>
              <option value="records:read">records:read</option>
              <option value="records:write">records:write</option>
              <option value="prescriptions:read">prescriptions:read</option>
              <option value="full">full</option>
            </select>
          </div>
          <div>
            <label className="label">Expire le</label>
            <input className="input" type="date" value={consentExpires} onChange={(e) => setConsentExpires(e.target.value)} />
          </div>
          <div>
            <label className="label">Consent ID (pour révoquer)</label>
            <input className="input" value={consentId} onChange={(e) => setConsentId(e.target.value)} placeholder="CONS-xxx" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.post(`/api/fabric/patients/${encodeURIComponent(pid)}/consents`,
              { granteeId: consentGrantee, scope: consentScope, expiresAt: consentExpires }, auth.token))}>
            Accorder consentement
          </button>
          <button className="btn-danger" disabled={loading || !consentId}
            onClick={() => run(() => api.delete(`/api/fabric/patients/${encodeURIComponent(pid)}/consents/${encodeURIComponent(consentId)}`, auth.token))}>
            Révoquer consentement
          </button>
        </div>
      </div>

      {/* Remboursement */}
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Soumettre remboursement assurance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Montant (ETH)</label>
            <input className="input" type="number" step="0.001" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Record ID (optionnel)</label>
            <input className="input" value={claimRecordId} onChange={(e) => setClaimRecordId(e.target.value)} placeholder="REC-xxx" />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => {
              const body: Record<string, string> = { amountEth: claimAmount };
              if (claimRecordId) body.recordId = claimRecordId;
              if (pid) body.patientId = pid;
              run(() => api.post("/api/reimbursement/claims", body, auth.token));
            }}>
            Soumettre remboursement
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get("/api/reimbursement/balance"))}>
            Solde contrat
          </button>
        </div>
      </div>

      <JsonOutput data={output} isError={isError} />
    </div>
  );
}
