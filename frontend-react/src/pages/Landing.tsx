import { Link } from "react-router-dom";

interface Feature {
  icon: string;
  title: string;
  desc: string;
  color: string;
}

const features: Feature[] = [
  { icon: "🔗", title: "Hyperledger Fabric", desc: "Dossiers médicaux privés sur blockchain permissionnée avec chaincodes Go/TypeScript.", color: "from-blue-500 to-blue-700" },
  { icon: "⛓️", title: "Polygon (EVM)", desc: "Smart contracts Solidity pour remboursement automatisé et traçabilité médicaments.", color: "from-purple-500 to-purple-700" },
  { icon: "📦", title: "IPFS Chiffré", desc: "Stockage distribué des fichiers médicaux chiffrés AES-256-GCM avec hash SHA-256.", color: "from-green-500 to-green-700" },
  { icon: "🪪", title: "DID / SSI", desc: "Authentification souveraine via MetaMask — zéro mot de passe centralisé.", color: "from-orange-500 to-orange-700" },
];

const stack = ["Hyperledger Fabric 2.5", "Polygon / Solidity", "IPFS Kubo", "React 18 + TypeScript", "Node.js / Express", "Docker Compose"];

const team = [
  { name: "Ilyas Ajelyan", role: "Chef de projet & Smart Contracts" },
  { name: "Anas El Karkouri", role: "Blockchain Fabric & IPFS" },
  { name: "Omar Babba", role: "Frontend Full-Stack" },
  { name: "Omar Gaga", role: "Backend & Identité" },
  { name: "Amin Er-Rebbat", role: "Sécurité & DevOps" },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <nav className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm">M+</span>
            <div>
              <span className="font-bold text-sm">MediChain+</span>
              <span className="text-xs text-gray-400 ml-2">EMSI 2025/2026</span>
            </div>
          </div>
          <Link to="/app" className="btn-primary text-sm">
            Ouvrir les portails →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-medium mb-6">
          Projet de fin d'études — EMSI Blockchain & Cryptographie
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-brand-600 to-purple-600 bg-clip-text text-transparent">
          Plateforme blockchain<br />de santé numérique
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8">
          Architecture hybride combinant Hyperledger Fabric, Polygon EVM et IPFS pour sécuriser
          les dossiers médicaux, automatiser les remboursements et garantir la traçabilité pharmaceutique.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/app" className="btn-primary px-6 py-2.5 text-base">
            Lancer l'application
          </Link>
          <a href="#architecture" className="btn-secondary px-6 py-2.5 text-base">
            Voir l'architecture
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="architecture" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">Architecture hybride</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="card hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${f.color} flex items-center justify-center text-xl mb-3`}>
                {f.icon}
              </div>
              <h3 className="font-semibold mb-1 text-sm">{f.title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Portals */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">4 portails utilisateurs</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { role: "patient", label: "Patient", icon: "👤", desc: "Dossiers & consentements" },
              { role: "doctor", label: "Médecin", icon: "🩺", desc: "Prescriptions & dossiers" },
              { role: "pharmacy", label: "Pharmacie", icon: "💊", desc: "Traçabilité & dispensation" },
              { role: "insurer", label: "Assureur", icon: "🏦", desc: "Remboursements auto" },
            ].map(({ role, label, icon, desc }) => (
              <Link
                key={role}
                to={`/app?role=${role}`}
                className="card text-center hover:shadow-md hover:border-brand-300 transition-all group"
              >
                <div className="text-3xl mb-2">{icon}</div>
                <div className="font-semibold text-sm group-hover:text-brand-600">{label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-8">Stack technique</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {stack.map((s) => (
            <span key={s} className="badge-blue px-3 py-1 text-sm">{s}</span>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Équipe</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {team.map(({ name, role }) => (
              <div key={name} className="card text-center">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm mx-auto mb-2">
                  {name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="font-medium text-sm">{name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs text-gray-400">
        MediChain+ — EMSI 2025/2026 · Blockchain & Cryptographie
      </footer>
    </div>
  );
}
