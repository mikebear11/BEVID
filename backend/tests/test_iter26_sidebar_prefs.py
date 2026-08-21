"""
Lot 8 suite — personnalisation de la sidebar par utilisateur.
Tests des endpoints GET/PUT /api/me/sidebar-prefs.

Vérifie :
  1. GET retourne toujours un objet, jamais 404 (défauts vides).
  2. PUT accepte pinned_user et section_order, indépendamment (merge partiel).
  3. PUT rejette les clés à caractères spéciaux (sécurité XSS/injection).
  4. PUT cappe pinned_user à 3 entrées, déduplique.
  5. PUT rejette les sections dont la clé ne préfixe pas `section_`.
  6. PUT sans aucun champ modifiable → 422.
  7. Isolation multi-tenant : un user ne voit jamais les prefs d'un autre.
  8. Auth obligatoire — 401 sans token.
"""
import os
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE}/api"

MGR = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}
COM = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_get_default_returns_object_never_404():
    tok = _token(MGR)
    r = requests.get(f"{API}/me/sidebar-prefs", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "pinned_user" in body and isinstance(body["pinned_user"], list)
    assert "section_order" in body and isinstance(body["section_order"], dict)


def test_put_pinned_user_cap_and_dedup():
    tok = _token(MGR)
    # 5 entries with 1 duplicate — expect cap 3, no duplicates.
    r = requests.put(
        f"{API}/me/sidebar-prefs",
        headers=_headers(tok),
        json={"pinned_user": ["orders", "clients", "orders", "products", "deals"]},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pinned_user"] == ["orders", "clients", "products"]


def test_put_rejects_special_chars_in_keys():
    tok = _token(MGR)
    r = requests.put(
        f"{API}/me/sidebar-prefs",
        headers=_headers(tok),
        json={"pinned_user": ["orders", "clients<script>", "prod.ucts", "deals"]},
        timeout=10,
    )
    assert r.status_code == 200
    # only valid keys pass (orders + deals ; "clients<script>" et "prod.ucts" filtrés)
    assert "clients<script>" not in r.json()["pinned_user"]
    assert "prod.ucts" not in r.json()["pinned_user"]


def test_put_section_order_prefix_required():
    tok = _token(MGR)
    r = requests.put(
        f"{API}/me/sidebar-prefs",
        headers=_headers(tok),
        json={"section_order": {
            "section_sales": ["orders", "clients"],
            "malicious": ["hack"],
            "notsection": ["a"],
        }},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "section_sales" in body["section_order"]
    assert "malicious" not in body["section_order"]
    assert "notsection" not in body["section_order"]


def test_put_merge_partial():
    tok = _token(MGR)
    # Set pinned first
    requests.put(f"{API}/me/sidebar-prefs", headers=_headers(tok),
                 json={"pinned_user": ["orders", "products"]}, timeout=10)
    # Update only section_order — pinned must remain intact
    r = requests.put(
        f"{API}/me/sidebar-prefs",
        headers=_headers(tok),
        json={"section_order": {"section_sales": ["orders", "clients"]}},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pinned_user"] == ["orders", "products"]
    assert body["section_order"]["section_sales"] == ["orders", "clients"]


def test_put_empty_body_rejects():
    tok = _token(MGR)
    r = requests.put(f"{API}/me/sidebar-prefs", headers=_headers(tok), json={}, timeout=10)
    assert r.status_code == 422


def test_prefs_isolated_per_user():
    tok_mgr = _token(MGR)
    tok_com = _token(COM)
    # Manager sets some prefs
    requests.put(f"{API}/me/sidebar-prefs", headers=_headers(tok_mgr),
                 json={"pinned_user": ["reports", "agents"]}, timeout=10)
    # Commercial fetches — must NOT see manager's prefs
    r = requests.get(f"{API}/me/sidebar-prefs", headers=_headers(tok_com), timeout=10)
    body = r.json()
    assert "reports" not in body["pinned_user"]
    assert "agents" not in body["pinned_user"]


def test_auth_required():
    r = requests.get(f"{API}/me/sidebar-prefs", timeout=10)
    assert r.status_code in (401, 403)
    r = requests.put(f"{API}/me/sidebar-prefs", json={"pinned_user": ["x"]}, timeout=10)
    assert r.status_code in (401, 403)


def test_cleanup_reset():
    """Nettoie l'état pour ne pas polluer les autres suites."""
    tok = _token(MGR)
    requests.put(f"{API}/me/sidebar-prefs", headers=_headers(tok),
                 json={"pinned_user": [], "section_order": {}}, timeout=10)
    tok_com = _token(COM)
    requests.put(f"{API}/me/sidebar-prefs", headers=_headers(tok_com),
                 json={"pinned_user": [], "section_order": {}}, timeout=10)
