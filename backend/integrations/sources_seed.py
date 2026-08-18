"""Métadonnées statiques des sources de données publiques utilisées.
Écrites en base au démarrage pour alimenter l'écran /sources-donnees (PARTIE 0 règle 6)."""

DATA_SOURCES_SEED = [
    {
        "id": "bodacc",
        "name": "BODACC — Bulletin Officiel des Annonces Civiles et Commerciales",
        "url": "https://bodacc-datadila.opendatasoft.com/",
        "license": "Licence Ouverte 2.0 (Etalab)",
        "publisher": "DILA — Direction de l'Information Légale et Administrative",
        "usage": "Bouclier encours (procédures collectives) + Radar ouvertures (créations)",
        "rate_limit_rps": 7.0,
        "freshness": "J+0",
    },
    {
        "id": "recherche-entreprises",
        "name": "API Recherche d'entreprises",
        "url": "https://recherche-entreprises.api.gouv.fr/",
        "license": "Licence Ouverte 2.0 (Etalab)",
        "publisher": "DINUM / API.gouv.fr",
        "usage": "Enrichissement SIREN (NAF, GPS, état admin) + Prospection géographique",
        "rate_limit_rps": 7.0,
        "freshness": "J+1 (base Sirene)",
    },
    {
        "id": "rappelconso",
        "name": "RappelConso — GTIN trié",
        "url": "https://data.economie.gouv.fr/explore/dataset/rappelconso-v2-gtin-trie/",
        "license": "Licence Ouverte 2.0 (Etalab)",
        "publisher": "DGCCRF / SignalConso",
        "usage": "Veille rappels produits par code-barres (GTIN)",
        "rate_limit_rps": 5.0,
        "freshness": "Horaire",
    },
]
