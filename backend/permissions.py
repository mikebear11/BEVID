"""Registre des features gouvernables + defaults par rôle.
Skill règle : RBAC + per-user overrides. Deny-by-default sur clé inconnue.
Chaque feature = { key, label, category, default: {manager, commercial} }
"""

FEATURES = [
    # === Pages / Zones ===
    {"key": "page:dashboard", "label": "Dashboard", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:clients", "label": "Clients", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:products", "label": "Catalogue produits", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:orders", "label": "Commandes", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:tours", "label": "Tournées", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:visits", "label": "Visites", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:scan", "label": "Scanner contenants", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:paiements", "label": "Paiements & impayés", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:rapprochement", "label": "Rapprochement bancaire", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:reports", "label": "Rapports & analytics", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:stock", "label": "Stock & DRM", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:drm", "label": "DRM douane", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:qr-labels", "label": "Étiquettes QR", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:radar", "label": "Radar CHR", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:prospection", "label": "Prospection géographique", "category": "Pages", "default": {"manager": True, "commercial": True}},
    {"key": "page:veille", "label": "Veille rappels produits", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:bouclier", "label": "Bouclier encours (procédures collectives)", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:sources-donnees", "label": "Sources de données", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:users", "label": "Gestion utilisateurs", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:integrations", "label": "Intégrations (Stripe, Twilio…)", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:settings", "label": "Réglages", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "page:privacy", "label": "Confidentialité & audit", "category": "Pages", "default": {"manager": True, "commercial": False}},
    # === Actions sensibles ===
    {"key": "client:edit_banking", "label": "Modifier coordonnées bancaires client (IBAN/SIRET)", "category": "Client", "default": {"manager": True, "commercial": False}},
    {"key": "client:upload_docs", "label": "Uploader Kbis / RIB", "category": "Client", "default": {"manager": True, "commercial": False}},
    {"key": "client:delete", "label": "Supprimer un client", "category": "Client", "default": {"manager": True, "commercial": False}},
    {"key": "product:edit", "label": "Modifier le catalogue produits", "category": "Catalogue", "default": {"manager": True, "commercial": False}},
    {"key": "product:view_cost", "label": "Voir les coûts de revient et marges", "category": "Catalogue", "default": {"manager": True, "commercial": False}},
    {"key": "order:refund", "label": "Rembourser une commande (Stripe)", "category": "Commande", "default": {"manager": True, "commercial": False}},
    {"key": "order:playbook", "label": "Exécuter Conflict Playbook", "category": "Commande", "default": {"manager": True, "commercial": False}},
    {"key": "order:send_pdf_email", "label": "Envoyer le PDF de commande par email", "category": "Commande", "default": {"manager": True, "commercial": True}},
    {"key": "releve:create", "label": "Créer un relevé terrain", "category": "Observatoire", "default": {"manager": True, "commercial": True}},
    {"key": "observatoire:view", "label": "Voir l'observatoire agrégé", "category": "Observatoire", "default": {"manager": True, "commercial": False}},
    {"key": "vies:check", "label": "Vérifier n° TVA (VIES)", "category": "Outils", "default": {"manager": True, "commercial": False}},
    {"key": "bank:import", "label": "Importer un relevé bancaire", "category": "Trésorerie", "default": {"manager": True, "commercial": False}},
    {"key": "bank:lettrer", "label": "Lettrer / dé-lettrer", "category": "Trésorerie", "default": {"manager": True, "commercial": False}},
    {"key": "cron:trigger", "label": "Déclencher scans (radar, bouclier, veille)", "category": "Admin", "default": {"manager": True, "commercial": False}},
    {"key": "settings:departments", "label": "Configurer les départements surveillés", "category": "Admin", "default": {"manager": True, "commercial": False}},
    # === Enrichissement établissement ===
    {"key": "page:enrichissement", "label": "Enrichissement fiche établissement", "category": "Pages", "default": {"manager": True, "commercial": False}},
    {"key": "enrichissement:layer_b", "label": "Déclencher enrichissement Couche B (payant)", "category": "Admin", "default": {"manager": True, "commercial": False}},
    {"key": "enrichissement:lock", "label": "Verrouiller / éditer un champ enrichi", "category": "Admin", "default": {"manager": True, "commercial": False}},
    # === IA (Entreprise) ===
    {"key": "ai:coach", "label": "Coach IA (opportunités)", "category": "IA", "default": {"manager": True, "commercial": True}},
    {"key": "ai:voice", "label": "Assistant vocal IA", "category": "IA", "default": {"manager": True, "commercial": True}},
]

FEATURES_INDEX = {f["key"]: f for f in FEATURES}


def has_feature(user: dict, key: str) -> bool:
    """Autorisation d'une feature pour un utilisateur.

    Deny-by-default sur clé inconnue. Cumule 3 verrous :
    1. **Plan de facturation** (`user["org_plan_features"]`) : posé par
       `get_current_user`, contient la liste des features incluses dans le
       forfait courant. Une feature hors plan est refusée quel que soit le rôle
       — c'est ce verrou qui rend les forfaits contraignants.
    2. **Override utilisateur** (`user["feature_overrides"]`) : décision manuelle
       du manager, prend le dessus sur le rôle par défaut (mais reste bornée
       par le plan).
    3. **Défaut par rôle** : `manager`/`commercial` comme fallback.

    Une organisation sans plan chargé (contexte anonyme, cron, tests) est
    considérée comme illimitée pour ne pas casser les tâches internes.
    """
    if key not in FEATURES_INDEX:
        return False

    # Verrou 1 — Plan de facturation
    plan_feats = user.get("org_plan_features")
    if plan_feats is not None and key not in plan_feats:
        return False

    # Verrou 2 — Override utilisateur
    overrides = user.get("feature_overrides") or {}
    if key in overrides:
        return bool(overrides[key])

    # Verrou 3 — Rôle par défaut
    role = user.get("role", "commercial")
    return FEATURES_INDEX[key]["default"].get(role, False)


def effective_permissions(user: dict) -> dict:
    """Retourne {feature_key: bool} pour tous les features connus."""
    return {f["key"]: has_feature(user, f["key"]) for f in FEATURES}
