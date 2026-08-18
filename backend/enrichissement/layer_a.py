"""Orchestrateur Couche A — enrichissement gratuit et stockable.

Séquence pour un SIREN donné :
  1. Recherche-Entreprises → SIREN valide + identité + adresse siège + GPS
  2. Sirene INSEE          → identité fine (forme jur., date création, NAF, effectif)
  3. RNE INPI              → dirigeants + bénéficiaires effectifs + comptes annuels
  4. BAN                   → normalisation d'adresse + géocodage (fallback si RE muet)
  5. VIES                  → validation TVA si TVA intracom présente

Ne stocke rien — retourne un dict { champ: valeur } que l'appelant applique via
`apply_enriched_update()` en respectant les verrous utilisateur.
"""
import logging

from integrations import recherche_entreprises as _re
from integrations import vies as _vies
from . import sirene as _sirene
from . import rne as _rne
from . import ban as _ban

LOG = logging.getLogger("enrichissement.layer_a")


def _fmt_tva_fr(siren: str) -> str:
    """Formule officielle : FR + clé (2 chiffres) + SIREN."""
    if len(siren) != 9 or not siren.isdigit():
        return ""
    n = int(siren)
    cle = (12 + 3 * (n % 97)) % 97
    return f"FR{cle:02d}{siren}"


async def enrichir_couche_a(siren: str, db=None, adresse_saisie: str | None = None) -> dict:
    """Appelle les 5 sources Couche A et retourne un dict de champs normalisés.

    Chaque champ peut être absent si la source est indisponible ou muette.
    Ne fait aucun write. C'est l'endpoint qui merge via `apply_enriched_update()`.
    """
    siren = (siren or "").replace(" ", "").strip()
    if len(siren) != 9 or not siren.isdigit():
        return {"_error": "SIREN invalide"}

    fields: dict = {"siren": siren}

    # 1) Recherche-Entreprises
    try:
        rec = await _re.get_by_siren(siren, db=db)
        if rec:
            siege = rec.get("siege") or {}
            fields["denomination"]     = rec.get("nom_complet") or rec.get("nom_raison_sociale")
            fields["forme_juridique"]  = rec.get("nature_juridique")
            fields["date_creation"]    = rec.get("date_creation")
            fields["naf_code"]         = rec.get("activite_principale")
            fields["naf_libelle"]      = rec.get("libelle_activite_principale") or rec.get("section_activite_principale")
            fields["effectif_tranche"] = rec.get("tranche_effectif_salarie")
            fields["etat_administratif"] = rec.get("etat_administratif")
            fields["siret_siege"]      = siege.get("siret")
            fields["adresse_ligne"]    = siege.get("adresse")
            fields["code_postal"]      = siege.get("code_postal")
            fields["commune"]          = siege.get("libelle_commune")
            fields["insee_commune"]    = siege.get("commune")
            lat, lng = _re.extract_gps(rec)
            fields["lat"], fields["lng"] = lat, lng
    except Exception as e:
        LOG.warning(f"RE muet pour {siren}: {e}")

    # 2) Sirene (peut préciser certains champs)
    try:
        ul = await _sirene.get_by_siren(siren, db=db)
        if ul:
            sir = _sirene.extract_identity(ul)
            for k, v in sir.items():
                if v and not fields.get(k):
                    fields[k] = v
    except Exception as e:
        LOG.warning(f"Sirene muet pour {siren}: {e}")

    # 3) RNE (optionnel — dépend d'identifiants INPI)
    try:
        formalite = await _rne.fetch_formalite(siren, db=db)
        if formalite:
            fields["dirigeants"] = _rne.extract_dirigeants(formalite)
            fields["beneficiaires_effectifs"] = _rne.extract_beneficiaires(formalite)
            comptes = (
                formalite.get("formality", {}).get("content", {}).get("personneMorale", {}).get("comptesAnnuels")
                or []
            )
            if comptes:
                fields["comptes_annuels"] = comptes
    except Exception as e:
        LOG.warning(f"RNE muet pour {siren}: {e}")

    # 4) BAN — géocodage forcé si RE n'a pas fourni lat/lng
    if (not fields.get("lat") or not fields.get("lng")) and (adresse_saisie or fields.get("adresse_ligne")):
        try:
            geo = await _ban.geocode(
                adresse_saisie or fields.get("adresse_ligne") or "",
                code_postal=fields.get("code_postal"),
                db=db,
            )
            if geo:
                for k in ("adresse_ligne", "code_postal", "commune", "insee_commune", "lat", "lng", "score_geocodage"):
                    if geo.get(k) is not None:
                        fields[k] = geo[k]
        except Exception as e:
            LOG.warning(f"BAN muet pour {siren}: {e}")

    # 5) VIES — validation TVA
    tva_num = _fmt_tva_fr(siren)
    if tva_num:
        try:
            res = await _vies.check_vat(tva_num, db=db)
            fields["tva_intracom"] = tva_num
            fields["tva_valide"] = bool(res.get("valid"))
        except Exception as e:
            LOG.warning(f"VIES muet pour {tva_num}: {e}")

    return fields
