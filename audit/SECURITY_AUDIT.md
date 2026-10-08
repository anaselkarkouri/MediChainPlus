# Rapport d'Audit de Sécurité — MediChain+

**Date :** 2026-06-10  
**Outil :** Slither v0.10.x  
**Scope :** `contracts/ReimbursementContract.sol`, `contracts/DrugTraceabilityContract.sol`  
**Auditeur :** Amin Er-Rebbat (Ingénieur Sécurité & DevOps)

---

## Résumé exécutif

| Sévérité | Nombre | Statut |
|---|---|---|
| Critique | 0 | ✅ Aucune |
| Haute | 0 | ✅ Aucune |
| Moyenne | 1 | ⚠️ Mitigée |
| Faible | 2 | ℹ️ Accepté |
| Info | 3 | ℹ️ Informationnel |

**Verdict : APPROUVÉ pour démonstration académique.**

---

## Findings

### [M-01] Absence de timelock sur validateClaim (Moyenne)

**Contrat :** `ReimbursementContract.sol`  
**Fonction :** `validateClaim(uint256 claimId)`  
**Description :** L'assureur peut valider un claim immédiatement après sa soumission, sans délai de contestation.  
**Risque :** Dans un contexte de production, un claim frauduleux pourrait être approuvé rapidement.  
**Mitigation implémentée :** Contrôle d'accès par rôle (`onlyInsurer`). Pour la démo, le timelock est omis volontairement.  
**Recommandation :** Ajouter `require(block.timestamp >= claim.submittedAt + TIMELOCK_DURATION)` en production.

---

### [L-01] Pas de limite sur le montant du claim (Faible)

**Contrat :** `ReimbursementContract.sol`  
**Description :** Aucun plafond de montant par claim.  
**Risque :** Un claim de montant excessif peut vider le contrat.  
**Recommandation :** Ajouter `require(amount <= MAX_CLAIM_AMOUNT)`.  
**Décision :** Accepté pour la démo — logique métier gérée côté API Gateway.

---

### [L-02] Event DrugRegistered sans index complet (Faible)

**Contrat :** `DrugTraceabilityContract.sol`  
**Description :** Le champ `manufacturer` dans l'event `DrugRegistered` n'est pas indexé.  
**Impact :** Recherche off-chain moins efficace.  
**Recommandation :** Indexer `batchId` et `manufacturer`.

---

## Bonnes pratiques vérifiées

- ✅ Pas de `tx.origin` utilisé pour l'authentification
- ✅ Pas de `delegatecall` à des adresses arbitraires
- ✅ Contrôles d'accès via `onlyOwner` / `onlyInsurer`
- ✅ Pas de boucles unbounded sur storage
- ✅ Émission d'événements sur toutes les mutations d'état
- ✅ Pas de reentrancy détectée (pas d'appels externes avant mise à jour d'état)
- ✅ Solidity 0.8.x — overflow/underflow protection native
- ✅ Imports OpenZeppelin vérifiés (v5.x)

---

## Commandes de reproduction

```bash
# Installer Slither
pip install slither-analyzer

# Compiler les contrats d'abord
npm run compile

# Lancer l'audit
slither . --config-file .slither.config.json

# Rapport JSON
cat audit/slither-report.json
```

---

## Références

- [Slither Documentation](https://github.com/crytic/slither)
- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/5.x/)
- [SWC Registry](https://swcregistry.io/)
