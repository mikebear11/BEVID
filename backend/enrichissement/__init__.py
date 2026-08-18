"""Enrichissement automatique des fiches établissement.

Trois couches :
  - Couche A (gratuite, stockable) : Recherche-Entreprises + Sirene + RNE + BAN + VIES
  - Couche B (payante, derrière `EnrichissementPort`) : Societe.com / Pappers
  - Couche C (données de lieu) : OSM stocké + Google Places place_id seul, données live

Modèle uniforme des champs enrichis : `EnrichedField`.
Toute valeur `verrouille_par_utilisateur=True` est intouchable par les crons.
"""
