import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import LegalFooter from "@/components/LegalFooter";
import { usePageMeta } from "@/lib/pageMeta";

export default function LegalCGV() {
  usePageMeta({
    title: "Conditions Générales de Vente · BEVID",
    canonical: "/legal/cgv",
    description: "Conditions Générales de Vente de l'abonnement BEVID CRM.",
  });
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[#4A154B] dark:text-[#B076B4]">
            <BevidLogo size={22} />
            <span className="font-display text-xl" aria-hidden="true">BEVID</span>
          </Link>
          <Link to="/login" className="text-sm text-stone-500 hover:text-[#4A154B] flex items-center gap-1 min-h-[44px]">
            <ArrowLeft size={14} aria-hidden="true" /> Retour
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="legal-cgv-page">
        <p className="overline">Vente</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1 mb-8">Conditions Générales de Vente</h1>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-display text-xl mb-2">1. Objet</h2>
            <p>Les présentes Conditions Générales de Vente (« CGV ») régissent la souscription et l'utilisation payante de la plateforme SaaS BEVID CRM (« le Service ») entre l'éditeur (« BEVID ») et le client professionnel abonné (« le Client »). Toute souscription à un forfait payant emporte adhésion pleine et entière aux présentes CGV.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">2. Forfaits et tarifs</h2>
            <p>Trois forfaits sont proposés : Terrain (15 €/siège/mois), Pro (29 €/siège/mois) et Entreprise (49 €/siège/mois). Une remise de dégressivité est appliquée à partir de 10 sièges (−10 %) et de 25 sièges (−20 %). Le paiement annuel donne droit à 2 mois offerts. Les prix sont exprimés hors taxes ; la TVA au taux en vigueur est ajoutée sur la facture.</p>
            <p>Le premier siège du créateur de compte est offert. Une période d'essai gratuite de 7 jours est accordée à toute nouvelle organisation, sans engagement ni saisie de carte bancaire.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">3. Souscription et facturation</h2>
            <p>La souscription est réalisée en ligne, prend effet à la validation du paiement et se renouvelle tacitement par période équivalente à celle choisie (mensuelle ou annuelle). Le Client peut modifier le nombre de sièges à tout moment ; les ajouts sont facturés au prorata jusqu'au terme, les suppressions prennent effet à la période suivante.</p>
            <p>Les factures sont émises automatiquement et disponibles dans l'espace facturation du Client, avec numérotation légale continue par exercice.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">4. Paiement</h2>
            <p>Le paiement s'effectue par carte bancaire via notre prestataire Stripe (données de paiement traitées en environnement PCI-DSS, aucune donnée bancaire n'est stockée par BEVID). En cas de rejet, le Client est notifié et dispose de 15 jours pour régulariser avant passage en mode lecture seule ; passé 30 jours supplémentaires sans régularisation, le compte est suspendu (les données restent conservées ≥ 90 jours conformément à notre politique de rétention).</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">5. Résiliation</h2>
            <p>Le Client peut résilier à tout moment depuis son espace facturation ; la résiliation prend effet au terme de la période en cours et aucun remboursement prorata temporis n'est effectué (article L.221-28 du Code de la consommation ne s'applique pas aux contrats B2B). Aucun préavis n'est exigé.</p>
            <p>En cas de manquement grave (utilisation frauduleuse, atteinte à la sécurité du Service, non-paiement dépassant 30 jours), BEVID peut suspendre ou résilier le compte de plein droit après mise en demeure restée sans effet 8 jours.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">6. Obligations du Client</h2>
            <p>Le Client s'engage à fournir des informations exactes lors de l'inscription, à préserver la confidentialité de ses identifiants, à utiliser le Service conformément aux lois en vigueur, notamment en matière de fiscalité, de RGPD et de démarchage. Le Client demeure responsable du traitement des données de ses propres clients (établissements CHR gérés dans le CRM) — BEVID est sous-traitant au sens de l'article 28 du RGPD.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">7. Disponibilité et maintenance</h2>
            <p>BEVID s'engage à mettre en œuvre les moyens nécessaires pour assurer une disponibilité mensuelle moyenne de 99,5 %, hors périodes de maintenance planifiée annoncées 48 heures à l'avance et hors force majeure. Le mode hors-ligne complet permet néanmoins de continuer l'activité terrain (tournée, prise de commande, dictée) en cas d'incident temporaire.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">8. Responsabilité</h2>
            <p>La responsabilité de BEVID est limitée aux dommages directs et prévisibles, à concurrence du montant HT effectivement payé par le Client sur les 12 mois précédant le fait générateur. Sont exclus les dommages indirects (perte de chiffre d'affaires, perte de clientèle, perte de données non imputable à BEVID). BEVID recommande au Client d'utiliser les fonctions d'export XLSX régulières.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">9. Propriété des données</h2>
            <p>Le Client demeure seul propriétaire des données saisies dans son organisation (clients, commandes, tournées, contacts, documents). À la résiliation, un export complet au format JSON et XLSX est mis à disposition pendant 30 jours ; passé ce délai, les données sont supprimées de manière irréversible sauf obligations légales de conservation.</p>
          </div>

          <div>
            <h2 className="font-display text-xl mb-2">10. Loi applicable et juridiction</h2>
            <p>Les CGV sont soumises au droit français. En cas de litige, les parties s'efforceront de trouver une solution amiable. À défaut, tout différend sera soumis aux tribunaux compétents du siège social de BEVID, sauf disposition légale contraire.</p>
          </div>

          <p className="text-xs text-stone-500 mt-8">Version en vigueur au 23 février 2026.</p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
