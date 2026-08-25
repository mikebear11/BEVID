"""Template HTML pour la génération PDF des documents commerciaux et fiscaux.

Rendu via Jinja2 + WeasyPrint. Un seul template pour les 7 types (facture,
avoir, BL, devis, BC, proforma, feuille de dépôt) avec sections conditionnelles.

Le CSS est intégré directement pour un rendu autonome (pas de dépendance
externe au moment de la génération). Contraintes :
 - A4 portrait, marges 15 mm (pour rester lisible imprimé).
 - Pagination automatique avec report des totaux ligne 1 de chaque page.
 - Une commande courante (~15 lignes) tient sur une page.
"""
DOCUMENT_HTML = r"""
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{{ doc.number or doc.doc_type_label }} · {{ legal.legal_name }}</title>
<style>
  @page {
    size: A4;
    margin: 15mm 12mm 18mm 12mm;
    @bottom-center {
      content: "Page " counter(page) " / " counter(pages);
      font-family: Helvetica, Arial, sans-serif;
      font-size: 8pt;
      color: #666;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9pt;
    color: #1a1a1a;
    margin: 0;
    line-height: 1.35;
  }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #4A154B; letter-spacing: 1pt; }
  .doc-type-badge {
    display: inline-block;
    padding: 2pt 8pt;
    background: {{ '#8C2A2A' if doc.is_fiscal else '#4A154B' }};
    color: #fff;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 1.5pt;
    border-radius: 3pt;
    margin-bottom: 6pt;
  }
  .proforma-warning {
    background: #FFF7ED;
    border: 1pt solid #C78B3A;
    color: #7C4A1A;
    padding: 4pt 8pt;
    font-size: 9pt;
    margin: 6pt 0;
    text-align: center;
    font-weight: bold;
  }
  .header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12pt;
  }
  .emitter, .recipient {
    width: 48%;
    font-size: 8.5pt;
  }
  .emitter { border-left: 3pt solid #4A154B; padding-left: 6pt; }
  .recipient { border: 1pt solid #ddd; padding: 6pt; background: #fafafa; }
  .section-title {
    text-transform: uppercase;
    font-size: 7.5pt;
    letter-spacing: 1.5pt;
    color: #666;
    margin-bottom: 3pt;
    font-weight: bold;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8pt;
    margin-bottom: 10pt;
    padding: 6pt;
    background: #f5f5f5;
    border-radius: 3pt;
  }
  .meta div { min-width: 130pt; font-size: 8.5pt; }
  .meta strong { color: #4A154B; }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4pt;
  }
  table.lines thead {
    display: table-header-group;
  }
  table.lines th {
    background: #4A154B;
    color: #fff;
    font-size: 8pt;
    padding: 4pt 5pt;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
  }
  table.lines td {
    border-bottom: 0.5pt solid #e5e5e5;
    padding: 4pt 5pt;
    font-size: 8.5pt;
  }
  table.lines .num { text-align: right; }
  table.lines tr.deposit { background: #FFF7ED; font-style: italic; }
  table.lines tr.deposit td { color: #7C4A1A; }
  .lot-info { font-size: 7pt; color: #666; margin-top: 1pt; }
  .totals {
    margin-top: 10pt;
    margin-left: auto;
    width: 45%;
    font-size: 9pt;
  }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 3pt 5pt; }
  .totals .label { color: #666; }
  .totals .val { text-align: right; font-variant-numeric: tabular-nums; }
  .totals .grand td { border-top: 1.5pt solid #4A154B; font-weight: bold; font-size: 11pt; color: #4A154B; padding-top: 6pt; }
  .payment {
    margin-top: 10pt;
    padding: 6pt;
    background: #F0EAF0;
    border-left: 3pt solid #4A154B;
    font-size: 8.5pt;
  }
  .legal-footer {
    margin-top: 14pt;
    padding-top: 6pt;
    border-top: 0.5pt solid #ddd;
    font-size: 6.8pt;
    color: #666;
    line-height: 1.4;
  }
  .signatures {
    margin-top: 20pt;
    display: flex;
    justify-content: space-between;
  }
  .sig-block {
    width: 45%;
    border-top: 0.5pt solid #333;
    padding-top: 3pt;
    font-size: 8pt;
  }
  .sig-image { max-height: 40pt; max-width: 120pt; }
</style>
</head>
<body>

<div class="header">
  <div class="emitter">
    <div class="section-title">Émetteur</div>
    {% if doc.variant_logo_url %}<img src="{{ doc.variant_logo_url }}" style="max-height:36pt; max-width:120pt; margin-bottom:4pt" alt="Logo"/><br>{% endif %}
    <strong style="font-size:11pt">{{ legal.legal_name or "—" }}</strong><br>
    {% if legal.legal_form %}{{ legal.legal_form }}{% if legal.capital_eur %} au capital de {{ "%.2f"|format(legal.capital_eur) }} €{% endif %}<br>{% endif %}
    {{ legal.address_line1 or "" }}{% if legal.address_line2 %}, {{ legal.address_line2 }}{% endif %}<br>
    {{ legal.postal_code or "" }} {{ legal.city or "" }}{% if legal.country %} · {{ legal.country }}{% endif %}<br>
    {% if legal.siret %}SIRET : {{ legal.siret }} · {% endif %}
    {% if legal.rcs_city %}RCS {{ legal.rcs_city }}{% endif %}<br>
    {% if legal.tva_intra %}TVA intra : {{ legal.tva_intra }}<br>{% endif %}
    {% if legal.accise_number %}Accise : {{ legal.accise_number }}<br>{% endif %}
    {% if legal.invoice_email %}{{ legal.invoice_email }}{% if legal.invoice_phone %} · {{ legal.invoice_phone }}{% endif %}{% endif %}
  </div>

  <div class="recipient">
    <div class="section-title">Destinataire</div>
    <strong style="font-size:10pt">{{ recipient.name or "—" }}</strong><br>
    {% if recipient.address %}{{ recipient.address }}<br>{% endif %}
    {% if recipient.postal_code or recipient.city %}{{ recipient.postal_code or "" }} {{ recipient.city or "" }}<br>{% endif %}
    {% if recipient.siren %}SIREN : {{ recipient.siren }}<br>{% endif %}
    {% if recipient.tva_intra %}TVA intra : {{ recipient.tva_intra }}<br>{% endif %}
    {% if delivery_address %}
      <div class="section-title" style="margin-top:6pt">Adresse de livraison</div>
      {{ delivery_address }}
    {% endif %}
  </div>
</div>

<div style="text-align:right; margin-bottom:6pt">
  <div class="doc-type-badge">{{ doc.doc_type_label }}</div>
  <h1>{{ doc.number or "BROUILLON" }}</h1>
</div>

{% if doc.doc_type == "proforma" %}
<div class="proforma-warning">Facture proforma — ne vaut pas facture</div>
{% endif %}

{% if doc.doc_type == "avoir" and doc.original_invoice_number %}
<div class="proforma-warning" style="background:#FEF2F2; border-color:#8C2A2A; color:#8C2A2A">
  AVOIR — Émis en référence à la facture {{ doc.original_invoice_number }} du {{ doc.original_invoice_date or "—" }}<br>
  Motif : {{ doc.reason or "non précisé" }}
</div>
{% endif %}

<div class="meta">
  <div><strong>Date d'émission :</strong> {{ doc.emitted_at_display or doc.created_at_display or "—" }}</div>
  {% if doc.delivery_date_display and doc.doc_type in ("facture", "bon_livraison", "avoir") %}
    <div><strong>Date de livraison :</strong> {{ doc.delivery_date_display }}</div>
  {% endif %}
  {% if doc.doc_type == "devis" and doc.validity_days %}
    <div><strong>Validité :</strong> {{ doc.validity_days }} jours</div>
  {% endif %}
  {% if doc.reference_bc %}<div><strong>Bon de commande :</strong> {{ doc.reference_bc }}</div>{% endif %}
  {% if doc.reference_bl %}<div><strong>Bon de livraison :</strong> {{ doc.reference_bl }}</div>{% endif %}
  {% if doc.doc_type == "facture" %}<div><strong>Catégorie :</strong> Livraison de biens</div>{% endif %}
</div>

<table class="lines">
  <thead>
    <tr>
      <th style="width:20%">Référence</th>
      <th style="width:38%">Désignation</th>
      <th style="width:8%" class="num">Qté</th>
      <th style="width:12%" class="num">PU HT</th>
      <th style="width:10%" class="num">Remise</th>
      <th style="width:12%" class="num">Total HT</th>
    </tr>
  </thead>
  <tbody>
    {% for line in doc.lines %}
    <tr {% if line.is_deposit %}class="deposit"{% endif %}>
      <td>{{ line.sku or line.reference or "" }}</td>
      <td>
        {{ line.designation or line.product_name }}
        {% if line.format %}<br><span style="color:#666;font-size:7.5pt">Format : {{ line.format }}</span>{% endif %}
        {% if line.lot_number or line.ddm %}
          <div class="lot-info">
            {% if line.lot_number %}Lot n° {{ line.lot_number }}{% endif %}
            {% if line.ddm %}{% if line.lot_number %} · {% endif %}DDM : {{ line.ddm }}{% endif %}
          </div>
        {% endif %}
      </td>
      <td class="num">{{ line.quantity }}{% if line.unit %} {{ line.unit }}{% endif %}</td>
      <td class="num">{{ "%.2f"|format(line.unit_price) }} €</td>
      <td class="num">{% if line.discount_pct %}{{ "%.1f"|format(line.discount_pct) }}%{% else %}—{% endif %}</td>
      <td class="num">{{ "%.2f"|format(line.line_total_ht) }} €</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr>
      <td class="label">Total HT (produits)</td>
      <td class="val">{{ "%.2f"|format(doc.subtotal_products_ht) }} €</td>
    </tr>
    {% if doc.subtotal_deposits_ht > 0 %}
    <tr>
      <td class="label">Consignes de fûts</td>
      <td class="val">{{ "%.2f"|format(doc.subtotal_deposits_ht) }} €</td>
    </tr>
    {% endif %}
    <tr>
      <td class="label"><strong>Total HT</strong></td>
      <td class="val"><strong>{{ "%.2f"|format(doc.total_ht) }} €</strong></td>
    </tr>
    {% for tva_line in doc.tva_breakdown %}
    <tr>
      <td class="label">TVA {{ "%.1f"|format(tva_line.rate) }}% (sur {{ "%.2f"|format(tva_line.base) }} €)</td>
      <td class="val">{{ "%.2f"|format(tva_line.amount) }} €</td>
    </tr>
    {% endfor %}
    <tr class="grand">
      <td>Total TTC</td>
      <td class="val">{{ "%.2f"|format(doc.total_ttc) }} €</td>
    </tr>
  </table>
</div>

{% if doc.doc_type in ("facture", "proforma", "avoir") %}
<div class="payment">
  <strong>Modalités de règlement</strong><br>
  {% if doc.due_date_display %}Échéance : <strong>{{ doc.due_date_display }}</strong>{% endif %}
  {% if legal.default_payment_terms_days %} · Délai contractuel : {{ legal.default_payment_terms_days }} jours{% endif %}<br>
  {% if legal.iban %}IBAN : {{ legal.iban }}{% if legal.bic %} · BIC : {{ legal.bic }}{% endif %}
       {% if legal.bank_name %} · {{ legal.bank_name }}{% endif %}<br>{% endif %}
  {% if legal.early_discount_terms %}Escompte : {{ legal.early_discount_terms }}{% else %}Aucun escompte accordé pour paiement anticipé.{% endif %}<br>
  Pénalités de retard : {{ "%.2f"|format(legal.late_penalty_rate_pct or 0) }}% par an à compter du jour suivant la date d'échéance.<br>
  Indemnité forfaitaire de recouvrement : {{ "%.2f"|format(legal.recovery_indemnity_eur or 40.0) }} € (art. L441-10 du Code de commerce).
</div>
{% endif %}

{% if doc.doc_type == "bon_livraison" %}
<div class="signatures">
  <div class="sig-block">
    <strong>Livreur</strong><br>
    {{ doc.driver_name or "—" }}
    {% if doc.driver_signature_url %}<br><img class="sig-image" src="{{ doc.driver_signature_url }}"/>{% endif %}
  </div>
  <div class="sig-block">
    <strong>Réceptionnaire</strong><br>
    {{ doc.receiver_name or "—" }}
    {% if doc.receiver_signature_url %}<br><img class="sig-image" src="{{ doc.receiver_signature_url }}"/>{% endif %}
    <div style="font-size:7pt; margin-top:2pt">Signature vaut acceptation des quantités livrées.</div>
  </div>
</div>
{% endif %}

<div class="legal-footer">
  {% if doc.variant_rib_text %}
  <p><strong>Coordonnées bancaires :</strong><br>{{ doc.variant_rib_text|replace('\n','<br>')|safe }}</p>
  {% endif %}
  {% if doc.variant_delivery_terms %}
  <p><strong>Conditions de livraison :</strong> {{ doc.variant_delivery_terms }}</p>
  {% endif %}
  {% if doc.variant_cgv_text %}
  <p><strong>Conditions générales de vente :</strong><br>{{ doc.variant_cgv_text|replace('\n','<br>')|safe }}</p>
  {% endif %}
  {% if legal.reserve_of_property %}<p><strong>Clause de réserve de propriété :</strong> {{ legal.reserve_of_property }}</p>{% endif %}
  {% if legal.invoice_footer_extra %}<p>{{ legal.invoice_footer_extra }}</p>{% endif %}
  {% if doc.doc_type in ("facture", "avoir") %}
    <p>Document fiscal — conservation légale 10 ans. En cas de non-paiement à échéance,
       une pénalité au taux ci-dessus est due de plein droit sans qu'un rappel soit nécessaire,
       ainsi que l'indemnité forfaitaire pour frais de recouvrement.</p>
  {% endif %}
</div>

</body>
</html>
"""
