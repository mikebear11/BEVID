"""Lot recentrage — Section 6 : Automatisations des relances

Décision produit : pas de constructeur vierge, 8 scénarios prêts à l'emploi.
Un scénario = déclencheur + conditions + action + garde-fous.

**Garde-fous non-négociables (§ 6 du brief) :**
- Par défaut mode « Créer une tâche » (jamais d'envoi silencieux).
- 1 seul e-mail auto par client tous les 14 jours max, toutes règles confondues.
- Rien le soir (20 h → 8 h), rien le week-end, rien jours fériés FR.
- Arrêt automatique si contact réel dans les 48 h (réponse, commande, visite).
- Relances commerciales suspendues si client en litige ; relances de paiement
  continuent (deux univers distincts).
- Interrupteur général `kill_switch` qui coupe TOUT en une seconde.
- Liste d'exclusion : un client peut être retiré définitivement de toute règle.

**Écran d'activation** : avant d'activer, on calcule combien de clients
correspondent aujourd'hui. Si > 20, on force l'utilisateur à choisir entre
« ignorer le stock, ne déclencher que sur les nouveaux cas » et « traiter le
stock avec un plafond quotidien » (jamais d'envoi de masse silencieux).
"""
from __future__ import annotations

from typing import Optional, Literal, List
from pydantic import BaseModel, ConfigDict


# ── Types Pydantic ──────────────────────────────────────────────────────────

PresetKey = Literal[
    "client_decroche",         # Aucune commande depuis 30j → tâche rappel
    "prospect_interesse",      # Visite « intéressé » sans commande depuis 7j → email doc
    "post_premiere_livraison", # 7j après 1ère livraison → email « tout OK ? »
    "devis_sans_reponse",      # Devis envoyé, silence depuis 5j → tâche appel
    "impaye_courtois",         # Facture échue depuis 8j → email courtois + lien paiement
    "fut_a_recuperer",         # Fût sorti depuis 90j non retourné → ajouter à la tournée
    "rupture_prevue",          # Client va manquer d'un produit → tâche contact
    "client_reactive",         # Dormant qui recommande → notif commercial pour l'appeler
]

PRESETS: dict[str, dict] = {
    "client_decroche": {
        "label": "Client qui décroche",
        "trigger": "Aucune commande depuis 30 jours",
        "condition": "Client actif dans les 6 derniers mois",
        "action_default": "task",  # jamais 'email' par défaut
        "action_label": "Créer une tâche de rappel au commercial responsable",
        "domain": "commercial",  # suspendable si litige
    },
    "prospect_interesse": {
        "label": "Prospect intéressé sans suite",
        "trigger": "Visite « intéressé » sans commande depuis 7 jours",
        "condition": "Statut visite = interesse ET pas de commande depuis",
        "action_default": "task",
        "action_label": "Créer une tâche : envoyer la documentation produit",
        "domain": "commercial",
    },
    "post_premiere_livraison": {
        "label": "Après la première livraison",
        "trigger": "7 jours après la 1ʳᵉ commande livrée",
        "condition": "Aucune 2ᵉ commande",
        "action_default": "task",
        "action_label": "Créer une tâche : appeler le client « tout s'est bien passé ? »",
        "domain": "commercial",
    },
    "devis_sans_reponse": {
        "label": "Devis sans réponse",
        "trigger": "Devis envoyé, pas de retour depuis 5 jours",
        "condition": "Statut document = envoye ET pas signé",
        "action_default": "task",
        "action_label": "Créer une tâche de relance téléphonique",
        "domain": "commercial",
    },
    "impaye_courtois": {
        "label": "Impayé courtois",
        "trigger": "Facture échue depuis 8 jours",
        "condition": "Montant restant > 0",
        "action_default": "email",  # relance paiement, jamais suspendue
        "action_label": "Envoyer un email de relance courtoise avec le lien de paiement",
        "domain": "paiement",  # continue même en cas de litige commercial
    },
    "fut_a_recuperer": {
        "label": "Fût à récupérer",
        "trigger": "Contenant sorti depuis 90 jours, non retourné",
        "condition": "deposit_amount > 0",
        "action_default": "task",
        "action_label": "Ajouter le client à la prochaine tournée",
        "domain": "operationnel",
    },
    "rupture_prevue": {
        "label": "Rupture prévue",
        "trigger": "Prévision : le client va manquer avant sa prochaine commande",
        "condition": "Modèle de consommation calculé",
        "action_default": "task",
        "action_label": "Créer une tâche : contact avant rupture",
        "domain": "commercial",
    },
    "client_reactive": {
        "label": "Client réactivé",
        "trigger": "Un dormant recommande",
        "condition": "> 60 jours sans commande puis nouvelle commande",
        "action_default": "task",
        "action_label": "Notifier le commercial pour rappeler le client",
        "domain": "commercial",
    },
}


class AutomationRuleState(BaseModel):
    """État persisté d'un preset : activé ou non, mode d'action."""
    model_config = ConfigDict(extra="ignore")
    preset_key: str
    enabled: bool = False
    action_mode: Literal["task", "email"] = "task"
    # Politique de traitement du stock existant à l'activation
    stock_policy: Literal["ignore", "throttle"] = "ignore"
    throttle_daily: int = 5              # si stock_policy=throttle
    activated_at: Optional[str] = None
    activated_by: Optional[str] = None
    last_run_at: Optional[str] = None


class AutomationRuleUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    enabled: Optional[bool] = None
    action_mode: Optional[Literal["task", "email"]] = None
    stock_policy: Optional[Literal["ignore", "throttle"]] = None
    throttle_daily: Optional[int] = None


class AutomationExclusion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: str          # id établissement
    reason: Optional[str] = ""
    added_at: str
    added_by: str


class KillSwitchUpdate(BaseModel):
    enabled: bool
