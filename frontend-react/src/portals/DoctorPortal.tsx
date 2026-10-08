import { useState } from "react";
import { api } from "../lib/api";
import { JsonOutput } from "../components/JsonOutput";
import type { AuthState } from "../lib/types";

interface Props {
  auth: AuthState;
  toast: (msg: string, kind?: "success" | "error" | "info") => void;
}

export function DoctorPortal({ auth, toast }: Props) {
  const [output, setOutput] = useState<unknown>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Recherche
  const [pid, setPid] = useState("");
  const [did, setDid] = useState("");

  // Créer dossier
  const [recPatientId, setRecPatientId] = useState("");
  const [recDoctorId, setRecDoctorId] = useState("");
  const [recType, setRecType] = useState("consultation");
  const [recDiagnosis, setRecDiagnosis] = useState("");
  const [recNotes, setRecNotes] = useState("");

  // Créer prescription
  const [rxPatientId, setRxPatientId] = useState("");
  const [rxDoctorId, setRxDoctorId] = useState("");
  const [rxMedName, setRxMedName] = useState("");
  const [rxMedDosage, setRxMedDosage] = useState("");
  const [rxMedFreq, setRxMedFreq] = useState("");
  const [rxMedDuration, setRxMedDuration] = useState("");
  const [rxNotes, setRxNotes] = useState("");
  const [rxSig, setRxSig] = useState("0x");

  // Vérifier intégrité
  const [recordId, setRecordId] = useState("");
  const [expectedHash, setExpectedHash] = useState("");

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

      {/* Recherche */}
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Recherche dossiers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">ID Patient</label>
            <input className="input" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="PAT-001" />
          </div>
          <div>
            <label className="label">ID Médecin</label>
            <input className="input" value={did} onChange={(e) => setDid(e.target.value)} placeholder="DOC-007" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/records/patient/${encodeURIComponent(pid)}`, auth.token))}>
            Dossiers du patient
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/records/doctor/${encodeURIComponent(did)}`, auth.token))}>
            Mes dossiers créés
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/prescriptions/doctor/${encodeURIComponent(did)}`, auth.token))}>
            Mes prescriptions
          </button>
        </div>
      </div>

      {/* Créer dossier médical */}
      <div className="card">
        <h3 className="font-semibold text-base mb-4">Créer dossier médical</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">ID Patient</label>
            <input className="input" value={recPatientId} onChange={(e) => setRecPatientId(e.target.value)} placeholder="PAT-001" />
          </div>
          <div>
            <label className="label">ID Médecin</label>
            <input className="input" value={recDoctorId} onChange={(e) => setRecDoctorId(e.target.value)} placeholder="DOC-007" />
          </div>
          <div>
            <label className="label">Type de dossier</label>
            <select className="input" value={recType} onChange={(e) => setRecType(e.target.value)}>
              <option value="consultation">Consultation</option>
              <option value="urgence">Urgence</option>
              <option value="suivi">Suivi</option>
              <option value="chirurgie">Chirurgie</option>
              <option value="bilan">Bilan</option>
            </select>
          </div>
          <div>
            <label className="label">Diagnostic</label>
            <input className="input" value={recDiagnosis} onChange={(e) => setRecDiagnosis(e.target.value)} placeholder="Ex: Hypertension artérielle" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes cliniques</label>
            <textarea className="input h-20 resize-none" value={recNotes} onChange={(e) => setRecNotes(e.target.value)} placeholder="Observations, traitement prescrit..." />
          </div>
        </div>
        <button className="btn-primary" disabled={loading}
          onClick={() => run(() => api.post("/api/fabric/records", {
            patientId: recPatientId,
            doctorId: recDoctorId,
            recordType: recType,
            diagnosis: recDiagnosis,
            notes: recNotes,
          }, auth.token))}>
          Créer dossier
        </button>
      </div>

      {/* Créer prescription */}
      <div className="card">
        <h3 className="font-semibold text-base mb-4">Créer prescription</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">ID Patient</label>
            <input className="input" value={rxPatientId} onChange={(e) => setRxPatientId(e.target.value)} placeholder="PAT-001" />
          </div>
          <div>
            <label className="label">ID Médecin</label>
            <input className="input" value={rxDoctorId} onChange={(e) => setRxDoctorId(e.target.value)} placeholder="DOC-007" />
          </div>
          <div>
            <label className="label">Médicament</label>
            <input className="input" value={rxMedName} onChange={(e) => setRxMedName(e.target.value)} placeholder="Ex: Paracetamol" />
          </div>
          <div>
            <label className="label">Dosage</label>
            <input className="input" value={rxMedDosage} onChange={(e) => setRxMedDosage(e.target.value)} placeholder="Ex: 500mg" />
          </div>
          <div>
            <label className="label">Fréquence</label>
            <input className="input" value={rxMedFreq} onChange={(e) => setRxMedFreq(e.target.value)} placeholder="Ex: 3x/jour" />
          </div>
          <div>
            <label className="label">Durée</label>
            <input className="input" value={rxMedDuration} onChange={(e) => setRxMedDuration(e.target.value)} placeholder="Ex: 7 jours" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input h-16 resize-none" value={rxNotes} onChange={(e) => setRxNotes(e.target.value)} placeholder="Ex: À prendre avec les repas" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Signature numérique</label>
            <input className="input" value={rxSig} onChange={(e) => setRxSig(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <button className="btn-primary" disabled={loading}
          onClick={() => run(() => api.post("/api/fabric/prescriptions", {
            patientId: rxPatientId,
            doctorId: rxDoctorId,
            medications: [{ name: rxMedName, dosage: rxMedDosage, frequency: rxMedFreq, duration: rxMedDuration }],
            notes: rxNotes,
            signatureHash: rxSig,
          }, auth.token))}>
          Créer prescription
        </button>
      </div>

      {/* Vérifier intégrité */}
      <div className="card">
        <h3 className="font-semibold text-base mb-3">Vérifier intégrité dossier</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Record ID</label>
            <input className="input" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="REC-xxx" />
          </div>
          <div>
            <label className="label">Hash SHA-256 attendu</label>
            <input className="input" value={expectedHash} onChange={(e) => setExpectedHash(e.target.value)} placeholder="sha256:..." />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={loading}
            onClick={() => run(() => api.post(`/api/fabric/records/${encodeURIComponent(recordId)}/verify-integrity`,
              { expectedFileHash: expectedHash }, auth.token))}>
            Vérifier intégrité
          </button>
          <button className="btn-secondary" disabled={loading}
            onClick={() => run(() => api.get(`/api/fabric/records/${encodeURIComponent(recordId)}/history`, auth.token))}>
            Historique blockchain
          </button>
        </div>
      </div>

      <JsonOutput data={output} isError={isError} />
    </div>
  );
}
