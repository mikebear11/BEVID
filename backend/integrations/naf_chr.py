"""Table de correspondance NAF CHR (2008 ↔ 2025) — extensible sans redéploiement (via collection Mongo).
Utilisée par le Radar d'ouvertures + Prospection autour de moi.
"""
# Codes CHR à jour selon PARTIE 3 du brief utilisateur
NAF_CHR_SEED = [
    # code_2008, label, naf2025_equiv, is_chr, segment
    ("56.10A", "Restauration traditionnelle", "56.11G", True, "restaurant"),
    ("56.10B", "Cafétérias et autres libres-services", "56.11H", True, "cafeteria"),
    ("56.10C", "Restauration de type rapide", "56.11J", True, "restauration_rapide"),
    ("56.21Z", "Services des traiteurs", "", True, "traiteur"),
    ("56.30Z", "Débits de boissons", "56.30Y", True, "bar"),
    ("47.25Z", "Commerce de détail de boissons en magasin spécialisé", "", True, "caviste"),
    ("55.10Z", "Hôtels et hébergement similaire", "", True, "hotel"),
    ("55.20Z", "Hébergement touristique et autre hébergement de courte durée", "", True, "location_courte"),
    ("55.30Z", "Terrains de camping et parcs pour caravanes ou véhicules de loisirs", "", True, "camping"),
    # NAF 2025 spécifiques (food truck sans équivalent 2008 exact)
    ("", "Restauration mobile / food trucks", "56.12Y", True, "food_truck"),
]


def get_seed_documents() -> list[dict]:
    docs = []
    for code_2008, label, naf25, is_chr, segment in NAF_CHR_SEED:
        docs.append({
            "code_2008": code_2008 or None,
            "code_2025": naf25 or None,
            "label": label,
            "is_chr": is_chr,
            "segment": segment,
            "seeded": True,
        })
    return docs


def is_chr_code(code: str, mapping: list[dict]) -> tuple[bool, str | None]:
    """Retourne (is_chr, segment) — cherche dans les deux nomenclatures."""
    if not code:
        return (False, None)
    code_norm = code.replace(" ", "").upper()
    for m in mapping:
        if m.get("code_2008") == code_norm or m.get("code_2025") == code_norm:
            return (m.get("is_chr", False), m.get("segment"))
    return (False, None)
