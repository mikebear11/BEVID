import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Lock, Unlock, RefreshCw, Zap, MapPin, ExternalLink, Star } from "lucide-react";
import PuceEtat from "@/components/system/PuceEtat";
import { t } from "@/lib/i18n";

const CHAMPS_GROUPES = [
  {
    titre: "Identité légale",
    champs: [
      { key: "siren",             libelle: "SIREN" },
      { key: "siret_siege",       libelle: "SIRET siège" },
      { key: "denomination",      libelle: "Dénomination" },
      { key: "forme_juridique",   libelle: "Forme juridique" },
      { key: "date_creation",     libelle: "Date de création" },
      { key: "naf_code",          libelle: "Code NAF" },
      { key: "naf_libelle",       libelle: "Libellé NAF" },
      { key: "effectif_tranche",  libelle: "Tranche d'effectif" },
      { key: "capital_social",    libelle: "Capital social" },
      { key: "etat_administratif", libelle: "État administratif" },
    ],
  },
  {
    titre: "Adresse & géolocalisation",
    champs: [
      { key: "adresse_ligne",   libelle: "Adresse" },
      { key: "code_postal",     libelle: "Code postal" },
      { key: "commune",         libelle: "Commune" },
      { key: "insee_commune",   libelle: "INSEE commune" },
      { key: "lat",             libelle: "Latitude" },
      { key: "lng",             libelle: "Longitude" },
      { key: "score_geocodage", libelle: "Score géocodage" },
    ],
  },
  {
    titre: "Fiscal",
    champs: [
      { key: "tva_intracom", libelle: "N° TVA intracom" },
      { key: "tva_valide",   libelle: "TVA valide (VIES)" },
    ],
  },
  {
    titre: "Scoring (Couche B)",
    champs: [
      { key: "score_solvabilite", libelle: "Solvabilité" },
      { key: "score_paiement",    libelle: "Paiement" },
      { key: "score_alerte",      libelle: "Alerte" },
    ],
  },
];

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function displayValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (Array.isArray(v)) return `${v.length} entrées`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60) + "…";
  return String(v);
}

function sourceLabel(source) {
  return {
    "user": "Édité manuellement",
    "recherche-entreprises": "Recherche-Entreprises",
    "sirene": "INSEE Sirene",
    "rne-inpi": "RNE (INPI)",
    "bodacc": "BODACC",
    "ban": "Base Adresse Nationale",
    "vies": "VIES",
    "layer_b": "Enrichissement Couche B",
    "osm": "OpenStreetMap",
  }[source] || source || "—";
}

function FieldRow({ champ, data, onEdit, onToggleLock }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(data?.valeur ?? "");
  const locked = data?.verrouille_par_utilisateur === true;

  const save = async () => {
    try {
      await onEdit(champ.key, val);
      setEditing(false);
      toast.success(t("toast.champ_enregistre_verrou_automatique"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("toast.erreur"));
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3 items-center py-2 border-b" style={{ borderColor: "var(--ds-border)" }}>
      <div className="col-span-3 text-sm font-medium" style={{ color: "var(--ds-text-secondary)" }}>{champ.libelle}</div>
      <div className="col-span-4">
        {editing ? (
          <input value={val} onChange={e => setVal(e.target.value)} data-testid={`enrich-input-${champ.key}`}
            className="ds-focus"
            style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)" }} />
        ) : (
          <div className="text-sm ds-tabular" style={{ color: "var(--ds-text-primary)" }}>{displayValue(data?.valeur)}</div>
        )}
      </div>
      <div className="col-span-2 text-xs" style={{ color: "var(--ds-text-muted)" }}>
        {data ? (<>
          <div>{sourceLabel(data.source)}</div>
          <div>{formatDate(data.date_maj)}</div>
        </>) : "—"}
      </div>
      <div className="col-span-1 text-xs ds-tabular" style={{ color: "var(--ds-text-muted)" }}>
        {data?.fiabilite ? `${Math.round(data.fiabilite * 100)}%` : "—"}
      </div>
      <div className="col-span-2 flex justify-end gap-1">
        {editing ? (
          <>
            <button onClick={save} data-testid={`enrich-save-${champ.key}`} className="ds-focus text-xs px-2 py-1 rounded"
              style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg)", minHeight: 32 }}>Enregistrer</button>
            <button onClick={() => setEditing(false)} className="ds-focus text-xs px-2 py-1 rounded"
              style={{ border: "1px solid var(--ds-border-strong)", color: "var(--ds-text-secondary)", minHeight: 32 }}>Annuler</button>
          </>
        ) : (
          <>
            <button onClick={() => { setVal(data?.valeur ?? ""); setEditing(true); }}
              data-testid={`enrich-edit-${champ.key}`}
              className="ds-focus text-xs px-2 py-1 rounded"
              style={{ border: "1px solid var(--ds-border)", color: "var(--ds-text-secondary)", minHeight: 32 }}>Éditer</button>
            {data && (
              <button onClick={() => onToggleLock(champ.key, !locked)}
                data-testid={`enrich-lock-${champ.key}`}
                title={locked ? "Déverrouiller (permettre les mises à jour auto)" : "Verrouiller (bloquer les mises à jour auto)"}
                className="ds-focus text-xs px-2 py-1 rounded flex items-center gap-1"
                style={{ border: "1px solid var(--ds-border)", color: locked ? "var(--ds-state-warning)" : "var(--ds-text-muted)", minHeight: 32 }}>
                {locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GooglePlacePanel({ eid }) {
  const [ref, setRef] = useState(null);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [placeIdInput, setPlaceIdInput] = useState("");

  const loadRef = useCallback(() => api.get(`/establishments/${eid}/google-place`).then(r => setRef(r.data)).catch(() => setRef(null)), [eid]);
  const loadLive = useCallback(() => {
    setLoading(true);
    api.get(`/establishments/${eid}/place-preview`)
      .then(r => setLive(r.data))
      .catch(e => setLive({ _available: false, _reason: e?.response?.data?.detail || "error" }))
      .finally(() => setLoading(false));
  }, [eid]);

  useEffect(() => { loadRef(); }, [loadRef]);
  useEffect(() => { if (ref?.place_id) loadLive(); }, [ref?.place_id, loadLive]);

  const linkPlace = async () => {
    try {
      await api.post(`/establishments/${eid}/link-place`, { place_id: placeIdInput.trim() });
      toast.success(t("toast.place_id_lie"));
      setPlaceIdInput("");
      loadRef();
    } catch (e) { toast.error(e?.response?.data?.detail || t("toast.erreur")); }
  };
  const unlinkPlace = async () => {
    try {
      await api.delete(`/establishments/${eid}/google-place`);
      toast.success(t("toast.place_id_delie"));
      setRef(null); setLive(null);
    } catch (e) { toast.error(e?.response?.data?.detail || t("toast.erreur")); }
  };

  return (
    <div className="card-crm p-5" data-testid="google-place-panel">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={18} style={{ color: "var(--ds-accent)" }} />
        <h3 className="font-display text-xl">Google Places · lecture directe</h3>
        <PuceEtat etat="info" variante="douce" libelle="Non stocké" />
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--ds-text-muted)" }}>
        Seul le <code>place_id</code> est en base. Note, avis, horaires, téléphone, site web, photos sont récupérés en direct à chaque ouverture — jamais mis en cache.
      </p>

      {ref?.place_id ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--ds-text-muted)" }}>Place ID :</span>
            <code style={{ fontFamily: "var(--ds-font-mono)", color: "var(--ds-text-primary)" }}>{ref.place_id}</code>
            <button onClick={unlinkPlace} data-testid="unlink-place-btn" className="ds-focus text-xs px-2 py-1 rounded ml-auto"
              style={{ border: "1px solid var(--ds-state-danger)", color: "var(--ds-state-danger)", minHeight: 32 }}>Délier</button>
          </div>

          {loading && <div className="text-sm" style={{ color: "var(--ds-text-muted)" }}>Chargement des données Google en direct…</div>}

          {live && !live._available && (
            <div className="text-sm" style={{ color: "var(--ds-state-warning)" }}>
              Données Google indisponibles ({live._reason}). Le <code>place_id</code> reste stocké.
            </div>
          )}

          {live && live._available && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Nom Google</span><div>{live.data?.displayName?.text || "—"}</div></div>
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Adresse Google</span><div>{live.data?.formattedAddress || "—"}</div></div>
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Note</span>
                <div className="flex items-center gap-1 ds-tabular">
                  <Star size={14} style={{ color: "var(--ds-state-warning)" }} />
                  {live.data?.rating ?? "—"} <span style={{ color: "var(--ds-text-muted)" }}>· {live.data?.userRatingCount ?? 0} avis</span>
                </div>
              </div>
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Niveau de prix</span><div>{live.data?.priceLevel || "—"}</div></div>
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Téléphone</span><div>{live.data?.internationalPhoneNumber || "—"}</div></div>
              <div><span className="text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>Site web</span>
                <div>{live.data?.websiteUri ? <a href={live.data.websiteUri} target="_blank" rel="noreferrer" style={{ color: "var(--ds-accent)" }}>Ouvrir <ExternalLink size={12} className="inline" /></a> : "—"}</div>
              </div>
              <div className="col-span-2 text-xs" style={{ color: "var(--ds-text-muted)" }}>
                {live._attribution} · récupéré {formatDate(live._fetched_at)}
              </div>
            </div>
          )}

          <button onClick={loadLive} data-testid="refresh-place-btn" className="ds-focus text-xs px-3 py-1.5 rounded inline-flex items-center gap-1"
            style={{ border: "1px solid var(--ds-border-strong)", color: "var(--ds-text-primary)", minHeight: 36 }}>
            <RefreshCw size={12} /> Recharger en direct
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={placeIdInput} onChange={e => setPlaceIdInput(e.target.value)}
            placeholder="ChIJ…" data-testid="place-id-input"
            className="ds-focus" style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--ds-border-strong)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-bg-surface)", color: "var(--ds-text-primary)", fontSize: "var(--ds-font-size-sm)" }} />
          <button onClick={linkPlace} data-testid="link-place-btn" disabled={!placeIdInput.trim()}
            className="ds-focus text-sm px-3 py-1.5 rounded"
            style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg)", minHeight: 36, opacity: placeIdInput.trim() ? 1 : 0.5 }}>Lier</button>
        </div>
      )}
    </div>
  );
}

export default function Enrichissement() {
  const { id } = useParams();
  const [est, setEst] = useState(null);
  const [enriched, setEnriched] = useState({});
  const [credits, setCredits] = useState(null);
  const [runningA, setRunningA] = useState(false);
  const [runningB, setRunningB] = useState(false);

  const load = useCallback(async () => {
    const [e, en, cr] = await Promise.all([
      api.get(`/establishments/${id}`).then(r => r.data),
      api.get(`/establishments/${id}/enriched`).then(r => r.data).catch(() => ({ enrichissement: {} })),
      api.get(`/enrichissement/credits`).then(r => r.data).catch(() => null),
    ]);
    setEst(e);
    setEnriched(en?.enrichissement || {});
    setCredits(cr);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runLayerA = async () => {
    setRunningA(true);
    try {
      const r = await api.post(`/establishments/${id}/enrichir`);
      toast.success(t("toast.couche_a_v1_champ_s_mis_a_jour", { v1: r.data.changed }));
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("toast.erreur")); }
    finally { setRunningA(false); }
  };

  const runLayerB = async (providerOverride) => {
    setRunningB(true);
    try {
      const r = await api.post(`/establishments/${id}/enrichir-plus`, providerOverride ? { provider: providerOverride } : {});
      if (r.data.fallback === "layer_a") {
        toast.warning(t("toast.couche_b_indisponible_v1_bascule_su", { v1: r.data.reason }));
      } else {
        toast.success(t("toast.couche_b_v1_champ_s_enrichi_s", { v1: r.data.changed }));
      }
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("toast.erreur")); }
    finally { setRunningB(false); }
  };

  const editField = (key, valeur) =>
    api.put(`/establishments/${id}/enriched-field/${key}`, { valeur }).then(load);

  const toggleLock = async (key, locked) => {
    await api.post(`/establishments/${id}/enriched-field/${key}/lock`, { locked });
    toast.success(locked ? "Champ verrouillé" : "Champ déverrouillé");
    await load();
  };

  if (!est) return <div style={{ color: "var(--ds-text-muted)" }}>Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="enrichissement-page">
      <div>
        <Link to={`/etab/${id}`} className="text-sm inline-flex items-center gap-1 mb-2" style={{ color: "var(--ds-accent)" }}>
          <ArrowLeft size={14} /> Retour fiche
        </Link>
        <p className="overline">Enrichissement</p>
        <h1 className="font-display text-4xl">{est.name}</h1>
        <p className="text-sm" style={{ color: "var(--ds-text-muted)" }}>
          Chaque champ est doté d'un verrou : une édition manuelle passe le champ en <strong>verrouillé</strong>, aucune synchronisation ne l'écrase.
        </p>
      </div>

      {/* Actions */}
      <div className="card-crm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runLayerA} disabled={runningA} data-testid="btn-run-layer-a"
            className="ds-focus px-4 py-2 rounded font-medium inline-flex items-center gap-2"
            style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg)", minHeight: 44, opacity: runningA ? 0.6 : 1 }}>
            <Zap size={16} /> {runningA ? "En cours…" : "Enrichir · Couche A (gratuit)"}
          </button>
          <button onClick={() => runLayerB()} disabled={runningB} data-testid="btn-run-layer-b"
            className="ds-focus px-4 py-2 rounded font-medium inline-flex items-center gap-2"
            style={{ border: "1px solid var(--ds-border-strong)", color: "var(--ds-text-primary)", minHeight: 44, opacity: runningB ? 0.6 : 1 }}>
            <Zap size={16} /> {runningB ? "En cours…" : "Enrichir · Couche B (défaut)"}
          </button>
          <button onClick={() => runLayerB("pappers")} disabled={runningB} data-testid="btn-run-pappers"
            className="ds-focus px-4 py-2 rounded font-medium inline-flex items-center gap-2"
            style={{ border: "1px solid var(--ds-border-strong)", color: "var(--ds-text-primary)", minHeight: 44, opacity: runningB ? 0.6 : 1 }}>
            <Zap size={16} /> Enrichir · Pappers (manuel)
          </button>
          {credits?.providers?.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: "var(--ds-text-muted)" }}>
              {credits.providers.map(p => (
                <div key={p.provider} className="ds-tabular">
                  <PuceEtat etat={p.exhausted ? "vigilance" : "succes"} variante="douce" libelle={`${p.provider}: ${p.count}/${p.plafond}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Groupes de champs */}
      {CHAMPS_GROUPES.map(g => (
        <div key={g.titre} className="card-crm p-5" data-testid={`enrich-group-${g.titre}`}>
          <h2 className="font-display text-xl mb-4" style={{ color: "var(--ds-text-primary)" }}>{g.titre}</h2>
          <div className="grid grid-cols-12 gap-3 pb-2 text-xs uppercase tracking-wider" style={{ color: "var(--ds-text-muted)", borderBottom: "1px solid var(--ds-border-strong)" }}>
            <div className="col-span-3">Champ</div>
            <div className="col-span-4">Valeur</div>
            <div className="col-span-2">Source · date</div>
            <div className="col-span-1">Fiab.</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {g.champs.map(c => (
            <FieldRow key={c.key} champ={c} data={enriched[c.key]} onEdit={editField} onToggleLock={toggleLock} />
          ))}
        </div>
      ))}

      {/* Couche C — Google Places (live only) */}
      <GooglePlacePanel eid={id} />
    </div>
  );
}
