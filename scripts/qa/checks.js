/**
 * BEVID QA gate — checks in-page.
 * Chargé via page.evaluate() par le runner Playwright Python.
 * Retourne un objet contenant les listes d'incidents détectés sur la page.
 *
 * Aucune dépendance externe. Zéro faux positif visé sur les métriques dures.
 */
(function () {
  const doc = document;
  const html = doc.documentElement;
  const bodyRect = html.getBoundingClientRect();

  const isVisible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const shortSelector = (el) => {
    if (!el) return "?";
    if (el.id) return "#" + el.id;
    const tag = el.tagName.toLowerCase();
    const tid = el.getAttribute("data-testid");
    if (tid) return `${tag}[data-testid="${tid}"]`;
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return cls ? `${tag}.${cls}` : tag;
  };

  const trim = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 80);

  // 1. Overflow horizontal
  const overflow_horizontal = html.scrollWidth > window.innerWidth
    ? [{ scrollWidth: html.scrollWidth, innerWidth: window.innerWidth }]
    : [];

  // 2. Tables débordant leur conteneur
  // Règle : on ne signale un débordement que si AUCUN ancêtre entre la table
  // et un ancêtre `overflow: hidden` ne procure de scroll horizontal.
  // Autrement dit : si le wrapper immédiat a overflow-x:auto/scroll et que
  // la scrollbar peut apparaître, l'utilisateur peut naviguer, ce n'est pas un défaut.
  const tables_overflowing = [];
  Array.from(doc.querySelectorAll("table")).forEach((t) => {
    if (!isVisible(t)) return;
    let p = t.parentElement;
    let hasScrollableAncestor = false;
    while (p && p !== html) {
      const s = getComputedStyle(p);
      if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflow === "auto" || s.overflow === "scroll") {
        // Le wrapper accepte le scroll ; tant que la table tient dans sa scrollWidth, tout va bien.
        hasScrollableAncestor = true;
        break;
      }
      if (s.overflowX === "hidden" || s.overflow === "hidden") {
        if (!hasScrollableAncestor && t.scrollWidth > p.clientWidth + 1) {
          tables_overflowing.push({
            selector: shortSelector(t),
            tableWidth: t.scrollWidth,
            containerWidth: p.clientWidth,
            containerSelector: shortSelector(p),
          });
        }
        break;
      }
      p = p.parentElement;
    }
  });

  // 3. Cibles tactiles < 44 px (mobile uniquement, filtré par le runner)
  const touch_targets_small = [];
  const interactiveSelector = 'button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], summary';
  Array.from(doc.querySelectorAll(interactiveSelector)).forEach((el) => {
    if (!isVisible(el)) return;
    // Ignore les icônes purement décoratives à l'intérieur d'une cible plus grande
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 44 || h < 44) {
      // Cas particulier 1 : l'élément est enveloppé dans un parent cliquable plus grand
      const parentBtn = el.closest("button, a[href], [role='button']");
      if (parentBtn && parentBtn !== el) {
        const pr = parentBtn.getBoundingClientRect();
        if (pr.width >= 44 && pr.height >= 44) return;
      }
      // Cas particulier 2 : checkbox/radio dans un label associé (le label est la vraie cible)
      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
        // Label wrapping
        const lab = el.closest("label");
        if (lab) {
          const lr = lab.getBoundingClientRect();
          if (lr.width >= 44 && lr.height >= 44) return;
        }
        // Label with for=
        if (el.id) {
          const forLab = doc.querySelector(`label[for="${el.id}"]`);
          if (forLab) {
            const lr = forLab.getBoundingClientRect();
            if (lr.width >= 44 && lr.height >= 44) return;
          }
        }
      }
      touch_targets_small.push({
        selector: shortSelector(el),
        text: trim(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")),
        width: w,
        height: h,
      });
    }
  });

  // 4. Champs sans label
  const missing_labels = [];
  Array.from(doc.querySelectorAll("input, textarea, select")).forEach((el) => {
    if (!isVisible(el)) return;
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "submit", "button", "reset"].includes(type)) return;
    if (el.getAttribute("aria-label")) return;
    if (el.getAttribute("aria-labelledby")) return;
    if (el.getAttribute("title")) return;
    // Label associé
    if (el.id) {
      const lab = doc.querySelector(`label[for="${el.id}"]`);
      if (lab && trim(lab.textContent)) return;
    }
    // Wrapping label
    const wrap = el.closest("label");
    if (wrap && trim(wrap.textContent)) return;
    // placeholder seul ne compte pas comme label accessible
    missing_labels.push({
      selector: shortSelector(el),
      placeholder: el.getAttribute("placeholder") || "",
      name: el.getAttribute("name") || "",
    });
  });

  // 5. Boutons sans nom accessible
  const buttons_no_name = [];
  Array.from(doc.querySelectorAll("button, [role='button']")).forEach((el) => {
    if (!isVisible(el)) return;
    const name = trim(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent);
    if (!name) buttons_no_name.push({ selector: shortSelector(el) });
  });

  // 6. Images sans alt
  const images_without_alt = [];
  Array.from(doc.querySelectorAll("img")).forEach((el) => {
    if (!isVisible(el)) return;
    if (el.getAttribute("alt") !== null) return; // "" volontaire = décoratif accepté
    if (el.getAttribute("role") === "presentation" || el.getAttribute("aria-hidden") === "true") return;
    images_without_alt.push({ selector: shortSelector(el), src: (el.getAttribute("src") || "").slice(0, 100) });
  });

  // 7. Nombre de h1 + sauts de niveau
  const h1s = Array.from(doc.querySelectorAll("h1")).filter(isVisible);
  const h1_count_not_one = h1s.length === 1 ? [] : [{ count: h1s.length, texts: h1s.map((h) => trim(h.textContent)) }];

  const heading_skips = [];
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(isVisible);
  let prevLevel = 0;
  headings.forEach((h) => {
    const lvl = parseInt(h.tagName.substring(1), 10);
    if (prevLevel > 0 && lvl > prevLevel + 1) {
      heading_skips.push({ from: prevLevel, to: lvl, text: trim(h.textContent) });
    }
    prevLevel = lvl;
  });

  // 8. Titre de page
  const title = trim(doc.title);
  const title_meta = { title, missing_or_generic: false };
  // La liste des titres génériques est passée par le runner; on stocke juste le titre courant.

  // 9. Textes < 12 px
  const text_small = [];
  // On limite le scan à ~800 éléments visibles porteurs de texte pour éviter l'explosion combinatoire.
  const scanned = new Set();
  const candidates = Array.from(doc.querySelectorAll("body *"));
  let scanCount = 0;
  for (const el of candidates) {
    if (scanCount > 1500) break;
    scanCount++;
    if (!isVisible(el)) continue;
    // Uniquement les éléments qui portent directement du texte
    let hasDirectText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && trim(n.textContent)) { hasDirectText = true; break; }
    }
    if (!hasDirectText) continue;
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (fs > 0 && fs < 12) {
      const key = shortSelector(el) + "|" + Math.round(fs);
      if (scanned.has(key)) continue;
      scanned.add(key);
      text_small.push({
        selector: shortSelector(el),
        text: trim(el.textContent),
        font_size_px: Math.round(fs * 10) / 10,
      });
    }
  }

  return {
    overflow_horizontal,
    tables_overflowing,
    touch_targets_small,
    missing_labels,
    buttons_no_name,
    images_without_alt,
    h1_count_not_one,
    heading_skips,
    title_meta,
    text_small,
    scroll: { scrollWidth: html.scrollWidth, innerWidth: window.innerWidth, docHeight: html.scrollHeight },
  };
})();
