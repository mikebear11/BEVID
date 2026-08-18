"""Adaptateur API Formalité RNE (INPI) — dirigeants, bénéficiaires effectifs, comptes annuels.

Auth : JWT via login/password (compte gratuit).
En l'absence d'identifiants dans l'env, l'adaptateur retourne None et logue.
Doc : https://registre-national-entreprises.inpi.fr/portail-doc-api
"""
import os
import time
import logging
import httpx

from .http_client_ext import fetch_json_optional_auth

RNE_BASE = "https://registre-national-entreprises.inpi.fr/api"
LOG = logging.getLogger("enrichissement.rne")

_cached_token: dict = {"jwt": None, "exp": 0}


async def _get_jwt() -> str | None:
    """Login RNE. Cache le JWT ~55 min (durée officielle 1 h)."""
    now = time.time()
    if _cached_token["jwt"] and _cached_token["exp"] > now + 60:
        return _cached_token["jwt"]
    login = os.environ.get("INPI_RNE_LOGIN", "").strip()
    password = os.environ.get("INPI_RNE_PASSWORD", "").strip()
    if not login or not password:
        return None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{RNE_BASE}/sso/login",
                json={"username": login, "password": password},
                headers={"User-Agent": "BEVID/1.0"},
            )
            r.raise_for_status()
            token = r.json().get("token")
            _cached_token.update({"jwt": token, "exp": now + 55 * 60})
            return token
    except Exception as e:
        LOG.warning(f"RNE login failed: {e}")
        return None


async def fetch_formalite(siren: str, db=None) -> dict | None:
    """Récupère la dernière formalité RNE d'un SIREN."""
    jwt = await _get_jwt()
    if not jwt:
        return None
    try:
        payload = await fetch_json_optional_auth(
            f"{RNE_BASE}/companies/{siren}",
            source="inpi-rne", db=db, kind="enrichissement-rne",
            headers={"Authorization": f"Bearer {jwt}"},
        )
    except RuntimeError:
        return None
    return payload


def extract_dirigeants(formalite: dict) -> list[dict]:
    """Extrait les dirigeants normalisés {nom, fonction, date_nomination}."""
    if not formalite:
        return []
    representants = (
        formalite.get("formality", {}).get("content", {}).get("personneMorale", {}).get("composition", {}).get("pouvoirs", [])
        or []
    )
    out = []
    for r in representants:
        p = (r.get("individu") or {}).get("descriptionPersonne") or {}
        nom = " ".join(filter(None, [p.get("prenom1"), p.get("nom")]))
        if not nom:
            continue
        out.append({
            "nom": nom.strip(),
            "fonction": (r.get("roleEntreprise") or ""),
            "date_nomination": r.get("dateEffet"),
        })
    return out


def extract_beneficiaires(formalite: dict) -> list[dict]:
    """Extrait les bénéficiaires effectifs si présents."""
    if not formalite:
        return []
    benefs = (
        formalite.get("formality", {}).get("content", {}).get("personneMorale", {}).get("beneficiairesEffectifs", [])
        or []
    )
    out = []
    for b in benefs:
        p = (b.get("beneficiaire") or {}).get("individu") or {}
        d = p.get("descriptionPersonne") or {}
        nom = " ".join(filter(None, [d.get("prenom1"), d.get("nom")]))
        if not nom:
            continue
        out.append({
            "nom": nom.strip(),
            "part_capital": b.get("modalite", {}).get("detentionCapital"),
        })
    return out
