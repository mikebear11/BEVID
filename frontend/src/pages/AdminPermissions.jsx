import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShieldCheck, Loader2, ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

/**
 * Écran manager : matrice de permissions par utilisateur.
 * Cases 3 états : ✓ activé (override true), ✗ refusé (override false), — défaut rôle.
 */
export default function AdminPermissions() {
  const [users, setUsers] = useState([]);
  const [features, setFeatures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([api.get("/admin/users"), api.get("/permissions/features")])
      .then(([u, f]) => { setUsers(u.data); setFeatures(f.data); })
      .catch(() => toast.error(t("toast.erreur_chargement")));
  }, []);

  const openUser = async (uid) => {
    setSelected(uid);
    setDetail(null);
    try {
      const { data } = await api.get(`/admin/users/${uid}/permissions`);
      setDetail(data);
    } catch (e) { toast.error(e.response?.data?.detail || t("toast.erreur")); }
  };

  const setOverride = (key, value) => {
    setDetail(d => ({
      ...d,
      overrides: { ...d.overrides, [key]: value },
    }));
  };
  const resetOverride = (key) => {
    setDetail(d => {
      const o = { ...d.overrides }; delete o[key];
      return { ...d, overrides: o };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // envoie explicitement null pour les clés supprimées + valeur pour les autres
      const originalKeys = new Set(Object.keys(detail?.overrides || {}));
      const payload = { overrides: {} };
      features.forEach(f => {
        if (detail.overrides.hasOwnProperty(f.key)) {
          payload.overrides[f.key] = detail.overrides[f.key];
        } else if (originalKeys.has(f.key)) {
          payload.overrides[f.key] = null;
        }
      });
      const { data } = await api.post(`/admin/users/${selected}/permissions`, payload);
      setDetail({ ...detail, overrides: data.overrides, effective: data.effective });
      toast.success(t("toast.permissions_enregistrees"));
    } catch (e) { toast.error(e.response?.data?.detail || t("toast.erreur")); }
    finally { setSaving(false); }
  };

  const categories = [...new Set(features.map(f => f.category))];
  const filteredUsers = users.filter(u => (u.name + u.email).toLowerCase().includes(search.toLowerCase()));
  const currentUser = users.find(u => u.id === selected);

  return (
    <div className="space-y-6" data-testid="admin-permissions-page">
      <div>
        <p className="overline flex items-center gap-2"><ShieldCheck size={12} /> Contrôle d'accès</p>
        <h1 className="font-display text-4xl">Permissions par utilisateur</h1>
        <p className="text-xs text-stone-500 mt-1">
          Chaque commercial reçoit le profil par défaut de son rôle. Ici, tu peux **surclasser** ou **restreindre** individuellement chaque zone ou action.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <div className="card-crm p-3">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer…"
              className="input-crm pl-9 h-9 text-sm w-full" data-testid="perm-search" />
          </div>
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {filteredUsers.map(u => (
              <button key={u.id} onClick={() => openUser(u.id)}
                className={`w-full text-left p-2 rounded ${selected === u.id ? "bg-[#4A154B] text-white" : "hover:bg-stone-50"}`}
                data-testid={`user-${u.id}`}>
                <p className="text-sm font-medium truncate">{u.name}</p>
                <p className={`text-xs ${selected === u.id ? "text-stone-200" : "text-stone-500"}`}>{u.email} · {u.role}</p>
              </button>
            ))}
          </div>
        </div>

        {!selected && (
          <div className="card-crm p-8 text-center text-stone-500">
            Sélectionne un utilisateur à gauche pour éditer ses permissions.
          </div>
        )}

        {selected && !detail && <div className="card-crm p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>}

        {selected && detail && (
          <div className="card-crm p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl">{currentUser?.name}</h2>
                <p className="text-xs text-stone-500">Rôle par défaut : <b>{detail.role}</b></p>
              </div>
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 min-h-[40px]" data-testid="perm-save-btn">
                {saving && <Loader2 size={12} className="animate-spin" />} Enregistrer
              </button>
            </div>

            {categories.map(cat => {
              const feats = features.filter(f => f.category === cat);
              const isOpen = expanded[cat] !== false;
              return (
                <div key={cat} className="border border-stone-200 rounded-lg mb-2">
                  <button onClick={() => setExpanded(e => ({ ...e, [cat]: !isOpen }))}
                    className="w-full flex justify-between items-center p-3 hover:bg-stone-50">
                    <span className="font-medium text-sm">{cat}</span>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-stone-100 p-2 space-y-1">
                      {feats.map(f => {
                        const roleDefault = f.default[detail.role];
                        const override = detail.overrides[f.key];
                        const eff = override === undefined ? roleDefault : override;
                        return (
                          <div key={f.key} className="flex items-center gap-3 p-2 hover:bg-stone-50 rounded" data-testid={`feat-${f.key}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{f.label}</p>
                              <p className="text-xs text-stone-400 font-mono">{f.key} · défaut {detail.role} : {roleDefault ? "✓" : "✗"}</p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setOverride(f.key, true)}
                                className={`px-2 py-1 rounded text-xs min-w-[36px] ${eff && override !== false ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-500"}`}
                                data-testid={`allow-${f.key}`} title="Autoriser">✓</button>
                              <button onClick={() => setOverride(f.key, false)}
                                className={`px-2 py-1 rounded text-xs min-w-[36px] ${override === false ? "bg-red-600 text-white" : "bg-stone-100 text-stone-500"}`}
                                data-testid={`deny-${f.key}`} title="Refuser">✗</button>
                              <button onClick={() => resetOverride(f.key)}
                                className={`px-2 py-1 rounded text-xs min-w-[36px] ${override === undefined ? "bg-stone-700 text-white" : "bg-stone-100 text-stone-500"}`}
                                title="Défaut rôle" data-testid={`default-${f.key}`}><RotateCcw size={11} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
