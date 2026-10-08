import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { useToast } from "../hooks/useToast";
import { ToastContainer } from "../components/ToastContainer";
import { StatusBar } from "../components/StatusBar";
import { PatientPortal } from "../portals/PatientPortal";
import { DoctorPortal } from "../portals/DoctorPortal";
import { PharmacyPortal } from "../portals/PharmacyPortal";
import { InsurerPortal } from "../portals/InsurerPortal";
import type { Role } from "../lib/types";

const TABS: { id: Role; label: string; icon: string }[] = [
  { id: "patient", label: "Patient", icon: "👤" },
  { id: "doctor", label: "Médecin", icon: "🩺" },
  { id: "pharmacy", label: "Pharmacie", icon: "💊" },
  { id: "insurer", label: "Assureur", icon: "🏦" },
];

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function AppPage() {
  const [searchParams] = useSearchParams();
  const defaultRole = (searchParams.get("role") as Role) ?? "patient";
  const [activeTab, setActiveTab] = useState<Role>(defaultRole);
  const { auth, loading, connect, connectDemo, disconnect, setError } = useWallet();
  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;
  const { toasts, toast, dismiss } = useToast();
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("mc_theme") === "dark"
  );

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("mc_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("mc_theme", "light");
    }
  }, [darkMode]);

  const handleConnect = async () => {
    try {
      await connect();
      toast("Wallet connecté", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur connexion";
      setError(msg);
      toast(msg, "error");
    }
  };

  const handleDemo = async () => {
    try {
      await connectDemo();
      toast("Mode démo activé — tous les rôles disponibles", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur mode démo";
      setError(msg);
      toast(msg, "error");
    }
  };

  const renderPortal = () => {
    if (!auth) return null;
    switch (activeTab) {
      case "patient": return <PatientPortal auth={auth} toast={toast} />;
      case "doctor": return <DoctorPortal auth={auth} toast={toast} />;
      case "pharmacy": return <PharmacyPortal auth={auth} toast={toast} />;
      case "insurer": return <InsurerPortal auth={auth} toast={toast} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 mr-auto">
            <span className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-xs">M+</span>
            <span className="font-semibold text-sm hidden sm:block">MediChain+</span>
          </Link>

          {auth ? (
            <div className="flex items-center gap-2">
              {auth.demo && (
                <span className="badge-yellow hidden sm:inline-flex text-xs">DÉMO</span>
              )}
              <span className="badge-green hidden sm:inline-flex">{auth.roles[0] ?? "user"}</span>
              <span className="text-xs text-gray-500 font-mono hidden sm:block">{shortAddr(auth.address)}</span>
              <button onClick={disconnect} className="btn-secondary text-xs py-1">Déconnexion</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {hasMetaMask ? (
                <button onClick={handleConnect} disabled={loading} className="btn-primary text-xs py-1.5">
                  {loading ? "Connexion…" : "Connecter MetaMask"}
                </button>
              ) : (
                <button onClick={handleDemo} disabled={loading} className="btn-primary text-xs py-1.5">
                  {loading ? "Chargement…" : "Mode Démo"}
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setDarkMode((d) => !d)}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm"
            title="Basculer thème"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Status bar */}
        <div className="card mb-4 py-3">
          <StatusBar />
        </div>

        {!auth ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-4">🔐</div>
            <h2 className="text-xl font-semibold mb-2">Authentification requise</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm mx-auto">
              {hasMetaMask
                ? "Connectez votre wallet MetaMask pour accéder aux portails MediChain+."
                : "MetaMask non détecté. Utilisez le mode démo pour explorer tous les portails."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {hasMetaMask && (
                <button onClick={handleConnect} disabled={loading} className="btn-primary px-8 py-2.5">
                  {loading ? "Connexion en cours…" : "🦊 Connecter MetaMask"}
                </button>
              )}
              <button onClick={handleDemo} disabled={loading} className={hasMetaMask ? "btn-secondary px-8 py-2.5" : "btn-primary px-8 py-2.5"}>
                {loading ? "Chargement…" : "🎓 Mode Démo"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-white dark:bg-gray-900 border rounded-xl p-1 mb-4">
              {TABS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === id
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span>{icon}</span>
                  <span className="hidden sm:block">{label}</span>
                </button>
              ))}
            </div>

            {/* Portal content */}
            {renderPortal()}
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
