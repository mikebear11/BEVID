import React, { useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, ChevronDown, AlertCircle } from "lucide-react";

/**
 * XlsxIO — bouton compact regroupant :
 *  - téléchargement d'un modèle vierge (avec exemple + colonnes obligatoires en rouge)
 *  - export des données courantes
 *  - import d'un fichier .xlsx avec rapport d'erreurs ligne à ligne
 *
 * Props :
 *  - kind : "establishments" | "products"
 *  - label : optionnel, override le libellé du menu
 *  - onImportDone : callback après import (rechargement de la liste par ex.)
 */
export default function XlsxIO({ kind, onImportDone, label }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);

  const endpoint = {
    establishments: {
      template: "/xlsx/template/establishments",
      exportUrl: "/xlsx/export/establishments",
      importUrl: "/xlsx/import/establishments",
      label: "Établissements",
    },
    products: {
      template: "/xlsx/template/products",
      exportUrl: "/xlsx/export/products",
      importUrl: "/xlsx/import/products",
      label: "Produits",
    },
    pricelists: {
      template: "/xlsx/template/pricelists",
      exportUrl: "/xlsx/export/pricelists",
      importUrl: "/xlsx/import/pricelists",
      label: "Tarifs",
    },
    orders: {
      template: null,
      exportUrl: "/xlsx/export/orders",
      importUrl: null,
      label: "Commandes",
    },
  }[kind];

  const downloadBlob = async (url, filename) => {
    setBusy(true);
    try {
      const res = await fetch(`${API}${url}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast.error("Téléchargement impossible");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const doImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setReport(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const { data } = await api.post(endpoint.importUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReport(data);
      const total = (data.created || 0) + (data.updated || 0);
      if (total > 0) {
        toast.success(`${total} ligne(s) traitée(s)${data.total_errors ? ` · ${data.total_errors} erreur(s)` : ""}`);
      } else if (data.total_errors) {
        toast.error(`${data.total_errors} erreur(s) — voir le détail`);
      } else {
        toast.info("Aucune ligne à traiter");
      }
      onImportDone && onImportDone(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import impossible");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="relative inline-block" data-testid={`xlsx-io-${kind}`}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={doImport}
        data-testid={`xlsx-file-input-${kind}`}
      />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="btn-ghost flex items-center gap-2"
        data-testid={`xlsx-menu-btn-${kind}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
        {label || "Excel"} <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-40 py-1"
               data-testid={`xlsx-menu-${kind}`}>
            {endpoint.template && (
              <button
                type="button"
                onClick={() => downloadBlob(endpoint.template, `template-${kind}.xlsx`)}
                className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800 text-sm flex items-center gap-2"
                data-testid={`xlsx-template-btn-${kind}`}
              >
                <FileSpreadsheet size={14} className="text-stone-500" />
                <div className="flex-1">
                  <div>Télécharger un modèle</div>
                  <div className="text-[10px] text-stone-500">Avec exemple pré-rempli</div>
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadBlob(endpoint.exportUrl, `${kind}.xlsx`)}
              className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800 text-sm flex items-center gap-2"
              data-testid={`xlsx-export-btn-${kind}`}
            >
              <Download size={14} className="text-stone-500" />
              <div className="flex-1">
                <div>Exporter les données</div>
                <div className="text-[10px] text-stone-500">Format .xlsx</div>
              </div>
            </button>
            {endpoint.importUrl && (
              <button
                type="button"
                onClick={() => { setOpen(false); fileRef.current?.click(); }}
                className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800 text-sm flex items-center gap-2"
                data-testid={`xlsx-import-btn-${kind}`}
              >
                <Upload size={14} className="text-stone-500" />
                <div className="flex-1">
                  <div>Importer un fichier</div>
                  <div className="text-[10px] text-stone-500">.xlsx (max 5 Mo)</div>
                </div>
              </button>
            )}
          </div>
        </>
      )}

      {report && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setReport(null)}
             data-testid={`xlsx-report-modal-${kind}`}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto"
               onClick={ev => ev.stopPropagation()}>
            <h3 className="font-display text-2xl mb-2">Rapport d'import</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="card-crm p-2 text-center">
                <p className="overline">Créés</p>
                <p className="font-display text-2xl text-[#2D5A4C]" data-testid="xlsx-report-created">{report.created || 0}</p>
              </div>
              <div className="card-crm p-2 text-center">
                <p className="overline">Mis à jour</p>
                <p className="font-display text-2xl text-[#4A154B]" data-testid="xlsx-report-updated">{report.updated || 0}</p>
              </div>
              <div className="card-crm p-2 text-center">
                <p className="overline">Erreurs</p>
                <p className="font-display text-2xl text-[#8C2A2A]" data-testid="xlsx-report-errors">{report.total_errors || 0}</p>
              </div>
            </div>
            {report.contacts_created > 0 && (
              <p className="text-xs text-stone-500 mb-3">
                Dont <strong>{report.contacts_created}</strong> contact(s) ajouté(s) sur les fiches.
              </p>
            )}
            {report.errors && report.errors.length > 0 && (
              <div className="border border-[#8C2A2A]/20 rounded-lg overflow-hidden">
                <div className="bg-[#8C2A2A]/10 px-3 py-2 text-xs flex items-center gap-1 text-[#8C2A2A]">
                  <AlertCircle size={12} /> Détail des erreurs
                </div>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800 max-h-64 overflow-y-auto">
                  {report.errors.map((e, i) => (
                    <li key={i} className="px-3 py-2 text-xs" data-testid={`xlsx-error-row-${i}`}>
                      <span className="text-stone-500">
                        {e.sheet ? `[${e.sheet}] ` : ""}Ligne {e.row} —
                      </span>{" "}
                      <span className="text-stone-800 dark:text-stone-200">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setReport(null)}
                className="btn-primary"
                data-testid={`xlsx-report-close-${kind}`}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
