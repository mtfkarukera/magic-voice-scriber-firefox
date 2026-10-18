/**
 * Magic Voice Scriber — Script d'Injection Web Universel (Firefox MV3)
 * ════════════════════════════════════════════════════════════════════
 *
 * S'exécute sur l'ensemble des pages web (<all_urls>) via un Shadow DOM fermé
 * (attachShadow({ mode: "closed" })) pour une isolation totale de style et de DOM.
 *
 * Fonctionnalités Clés :
 *   1. Goutte Vocale furtive par défaut (caretGemEnabled = false) ou visible au repos
 *   2. Pilule vocale rétractable avec 5 barres blanches d'ondes audio (RMS + FFT)
 *   3. Moteur d'insertion universel compatible React, Vue, Angular, Svelte, Notion,
 *      Gmail, Gutenberg, Claude, ChatGPT et Google Docs (proxy Canvas)
 *   4. Exclusion stricte des champs de mot de passe, désactivés ou en lecture seule
 *   5. Double écoute clavier tolérante (Alt+Shift+S / Alt+Shift+D / ⌥⇧S / ⌥⇧D)
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;

(function initialiserWidgetWebUniverselMVS() {
  const win = typeof window !== "undefined" ? window : globalThis;
  // Garde d'idempotence : éviter toute double injection dans le même document
  if (win.__MVS_WEB_WIDGET_LOADED__) {
    return;
  }
  win.__MVS_WEB_WIDGET_LOADED__ = true;

  const api = globalThis.browser || globalThis.messenger;
  const DUREE_OPTIMALE_MAX_SEC = 300; // 5 minutes max par segment

  // ── État interne du widget web ──────────────────────────────────────────
  // "HIDDEN" | "CARET_GEM" | "RECORDING" | "PAUSED" | "THINKING" | "ERROR"
  let etatCourant = "HIDDEN";
  let fournisseurActif = "mistral";
  let secondesEcoulees = 0;
  let idIntervalleChrono = null;
  let idIntervalleKeepAlive = null;
  let idBoucleAnimation = null;
  let phaseOnde = 0;
  let ciblesBarres = [0.22, 0.35, 0.5, 0.35, 0.22];
  let hauteursBarres = [0.22, 0.35, 0.5, 0.35, 0.22];
  let elementCibleActif = null;
  let dernierTexteLive = "";
  let demarrageEnCours = false;

  // ── État de la capture audio in-situ (Gecko native) ──────────────────────
  let fluxMediaLocal = null;
  let mediaRecorderLocal = null;
  let tranchesAudioLocales = [];
  let dernierBlobLocal = null;
  let contexteAudioLocal = null;
  let noeudSourceLocal = null;
  let analyseurLocal = null;
  let donneesFreqLocales = null;
  let donneesTempsLocales = null;

  // Configuration locale synchronisée
  let configLocale = {
    caretGemEnabled: false,
    sitesExclus: [],
    shortcutKey: "KeyS",
    provider: "gemini",
    geminiModel: "gemini-3.5-transcribe"
  };

  // Références DOM dans le Shadow Root fermé
  let hoteShadow = null;
  let racineShadow = null;
  let conteneurWidget = null;
  let boutonGoutte = null;
  let vueCapsule = null;
  let btnOndeRouge = null;
  let barresBlanchesEls = [];
  let timerEl = null;
  let tickerLiveEl = null;
  let btnPause = null;
  let btnAnnuler = null;
  let banniereErreur = null;
  let texteErreurEl = null;
  let btnReessayer = null;
  let zoneStatutA11y = null;

  // Variables d'état pour le glisser-déposer (Draggable) de la pilule
  let positionGlissee = null;
  let estEnGlissement = false;
  let pointDepartGlissement = { x: 0, y: 0 };
  let offsetDepartGlissement = { x: 0, y: 0 };

  /**
   * Vocalise un message d'état pour les lecteurs d'écran.
   * @param {string} msg
   */
  function annoncerA11y(msg) {
    if (!zoneStatutA11y || !msg) return;
    zoneStatutA11y.textContent = "";
    setTimeout(() => {
      if (zoneStatutA11y) zoneStatutA11y.textContent = msg;
    }, 50);
  }

  /**
   * Récupère une chaîne traduite depuis i18n.
   * @param {string} cle
   * @returns {string}
   */
  function t(cle) {
    try {
      if (api && api.i18n && typeof api.i18n.getMessage === "function") {
        const msg = api.i18n.getMessage(cle);
        if (msg) return msg;
      }
    } catch {
      /* Fallback */
    }
    return "";
  }

  /**
   * Formate les secondes en MM:SS.
   * @param {number} sec
   * @returns {string}
   */
  function formaterDuree(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Vérifie si le domaine actuel fait partie de la liste des sites exclus.
   * @returns {boolean}
   */
  function estDomaineExclu() {
    try {
      const domaine = window.location.hostname.toLowerCase();
      if (!domaine) return false;
      const exclus = Array.isArray(configLocale.sitesExclus) ? configLocale.sitesExclus : [];
      return exclus.some((exclu) => domaine === exclu || domaine.endsWith("." + exclu));
    } catch {
      return false;
    }
  }

  /**
   * Traverse récursivement les Shadow DOMs ouverts pour identifier l'élément actif profond.
   * @returns {Element|null}
   */
  function obtenirElementActifProfond() {
    let actif = document.activeElement;
    while (actif && actif.shadowRoot && actif.shadowRoot.activeElement) {
      actif = actif.shadowRoot.activeElement;
    }
    return actif;
  }

  /**
   * Vérifie si un élément DOM est éligible pour la saisie vocale.
   * @param {Element} el
   * @returns {boolean}
   */
  function estElementEligible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Google Docs (rendu Canvas avec iframe/proxy de saisie)
    if (window.location.hostname === "docs.google.com") {
      return true;
    }

    // Exclusion stricte des éléments désactivés (y compris via fieldset parent) ou en lecture seule
    if (el.disabled || el.readOnly) return false;
    if (typeof el.closest === "function" && el.closest("fieldset:disabled")) return false;
    if (el.getAttribute("aria-readonly") === "true") return false;

    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      const typesInterdits = ["password", "hidden", "checkbox", "radio", "button", "submit", "file", "image", "reset"];
      if (typesInterdits.includes(type)) return false;
      return true;
    }

    if (el.tagName === "TEXTAREA") {
      return true;
    }

    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
      if (el.getAttribute("contenteditable") === "false") return false;
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. POSITIONNEMENT CALCULÉ DE LA GOUTTE & DE LA PILULE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calcule les coordonnées viewport optimales pour afficher le widget.
   * @returns {{ x: number, y: number, isCenter: boolean }}
   */
  function calculerPositionWidget(elementForce = null, etatForce = null) {
    const cible = elementForce || elementCibleActif;
    const etat = etatForce || etatCourant;

    // Cas spécial Google Docs : pilule calée en bas à droite (anti-collision Gemini Docs)
    if (window.location.hostname === "docs.google.com") {
      const estCapsule = etat !== "CARET_GEM";
      const largeur = estCapsule ? 260 : 36;
      const hauteur = estCapsule ? 56 : 36;
      return {
        x: Math.max(12, window.innerWidth - largeur - 28),
        y: Math.max(12, window.innerHeight - hauteur - 28),
        isCenter: false
      };
    }

    // 1. Repli prioritaire sur le rectangle de l'élément cible actif (input, textarea, contenteditable)
    if (cible && typeof cible.getBoundingClientRect === "function") {
      const rect = cible.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const estCapsule = etat !== "CARET_GEM";
        let decallageY;
        if (estCapsule) {
          decallageY = rect.bottom + 8;
        } else if (rect.height >= 50) {
          // Champ multi-lignes (textarea, éditeur étendu, carte Keep) : calé dans le coin supérieur droit
          decallageY = rect.top + 10;
        } else {
          // Champ mono-ligne (input standard) : centré verticalement à droite
          decallageY = rect.top + (rect.height / 2) - 9;
        }
        const decallageX = estCapsule ? rect.left + 8 : rect.right - 28;

        return {
          x: Math.min(window.innerWidth - (estCapsule ? 260 : 36), Math.max(12, decallageX)),
          y: Math.min(window.innerHeight - 50, Math.max(10, decallageY)),
          isCenter: false
        };
      }
    }

    // 2. Repli secondaire par le curseur de sélection (Range) si le conteneur n'a pas de dimensions
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          const dernierRect = rects[rects.length - 1];
          if (dernierRect.top > 0 || dernierRect.bottom > 0) {
            return {
              x: Math.min(window.innerWidth - 60, Math.max(12, dernierRect.right + 10)),
              y: Math.min(window.innerHeight - 50, Math.max(10, dernierRect.bottom + 4)),
              isCenter: false
            };
          }
        }
      }
    } catch {}

    // 3. Repli par défaut au centre bas du viewport
    return {
      x: Math.round(window.innerWidth / 2),
      y: window.innerHeight - 80,
      isCenter: true
    };
  }

  /**
   * Met à jour la position CSS du conteneur dans la page.
   */
  function actualiserPositionCSS() {
    if (!conteneurWidget) return;

    // Si l'utilisateur a déplacé manuellement la pilule pendant cette session active
    if (positionGlissee && etatCourant !== "HIDDEN" && etatCourant !== "CARET_GEM") {
      conteneurWidget.style.left = `${positionGlissee.x}px`;
      conteneurWidget.style.top = `${positionGlissee.y}px`;
      conteneurWidget.style.transform = "none";
      return;
    }

    const { x, y, isCenter } = calculerPositionWidget();

    if (isCenter) {
      conteneurWidget.style.left = "50%";
      conteneurWidget.style.top = `${y}px`;
      conteneurWidget.style.transform = "translateX(-50%)";
    } else {
      conteneurWidget.style.left = `${x}px`;
      conteneurWidget.style.top = `${y}px`;
      conteneurWidget.style.transform = "none";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MOTEUR D'INSERTION UNIVERSEL (POLYFILL RÉACTIF REACT/VUE/ANGULAR)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Insère le texte nettoyé au point d'insertion actif de manière polyvalente.
   * @param {string} texteAInserer
   */
  function insererTexteAuCurseur(texteAInserer) {
    if (!texteAInserer) return;
    const cible = elementCibleActif || obtenirElementActifProfond() || document.activeElement;

    // 1. Google Docs (Canvas avec iframe proxy de saisie)
    if (window.location.hostname === "docs.google.com") {
      try {
        const iframeProxy = document.querySelector(".docs-texteventtarget-iframe");
        if (iframeProxy) {
          const docProxy = iframeProxy.contentDocument || iframeProxy.contentWindow?.document;
          const cibleProxy = (docProxy && docProxy.activeElement) || docProxy?.body;
          if (cibleProxy) {
            cibleProxy.focus();
            if (docProxy.execCommand && docProxy.execCommand("insertText", false, texteAInserer)) {
              return;
            }
          }
        }
      } catch {}

      // Repli sur l'élément actif du document principal
      try {
        if (document.execCommand("insertText", false, texteAInserer)) {
          return;
        }
      } catch {}
    }

    if (!cible) return;

    // 2. Éléments contenteditable (Notion, Gmail, Gutenberg, Slack, Word Online)
    if (cible.isContentEditable || cible.getAttribute("contenteditable") === "true") {
      cible.focus();
      let reussi = false;
      try {
        reussi = document.execCommand("insertText", false, texteAInserer);
      } catch {
        reussi = false;
      }

      if (!reussi) {
        try {
          const sel = window.getSelection();
          let range = null;
          if (sel && sel.rangeCount > 0) {
            range = sel.getRangeAt(0);
          } else {
            range = document.createRange();
            range.selectNodeContents(cible);
            range.collapse(false);
          }
          range.deleteContents();
          const noeud = document.createTextNode(texteAInserer);
          range.insertNode(noeud);
          range.setStartAfter(noeud);
          range.setEndAfter(noeud);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
          cible.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: texteAInserer
            })
          );
        } catch (err) {
          if (DEBUG) console.error("[MagicVoiceScriber] Erreur insertion Range :", err);
        }
      }
      return;
    }

    // 3. Champs classiques <input> et <textarea> (ChatGPT, Claude, Formulaires Web)
    if (cible instanceof HTMLInputElement || cible instanceof HTMLTextAreaElement) {
      cible.focus();

      let debut = 0;
      let fin = 0;
      let supporteSelection = false;

      // Protection stricte contre InvalidStateError (ex: <input type="email"> ou "number")
      try {
        if (typeof cible.selectionStart === "number") {
          debut = cible.selectionStart;
          fin = typeof cible.selectionEnd === "number" ? cible.selectionEnd : debut;
          supporteSelection = true;
        }
      } catch {
        supporteSelection = false;
        debut = (cible.value || "").length;
        fin = debut;
      }

      const valeur = cible.value || "";
      const nouvelleValeur = valeur.slice(0, debut) + texteAInserer + valeur.slice(fin);
      const nouveauCurseur = debut + texteAInserer.length;

      // Événement synthétique beforeinput
      try {
        cible.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data: texteAInserer,
            inputType: "insertText"
          })
        );
      } catch {}

      // Appel du setter de prototype natif pour réveiller les stores React/Vue/Angular
      const proto = cible instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descripteur = Object.getOwnPropertyDescriptor(proto, "value");
      if (descripteur && typeof descripteur.set === "function") {
        descripteur.set.call(cible, nouvelleValeur);
      } else {
        cible.value = nouvelleValeur;
      }

      if (supporteSelection) {
        try {
          cible.selectionStart = nouveauCurseur;
          cible.selectionEnd = nouveauCurseur;
        } catch {}
      }

      // Événements synthétiques input et change
      cible.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: texteAInserer,
          inputType: "insertText"
        })
      );
      cible.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CONSTRUCTION DU SHADOW DOM FERMÉ & FEUILLE DE STYLE ISOLÉE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attache l'hôte Shadow DOM au document de manière résiliente.
   */
  function attacherHoteDOM() {
    if (!hoteShadow || hoteShadow.parentNode) return;
    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(hoteShadow);
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const p = document.body || document.documentElement;
          if (p && !hoteShadow.parentNode) {
            p.appendChild(hoteShadow);
          }
        },
        { once: true }
      );
    }
  }

  function creerStructureShadowDOM() {
    hoteShadow = document.createElement("div");
    hoteShadow.id = "mvs-web-widget-host";
    hoteShadow.setAttribute("aria-hidden", "false");

    racineShadow = hoteShadow.attachShadow({ mode: "closed" });

    // Styles CSS embarqués et isolés
    const feuilleStyle = document.createElement("style");
    feuilleStyle.textContent = `
      :host {
        all: initial;
      }
      .mvs-root {
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #f8fafc;
        pointer-events: none;
        user-select: none;
      }
      .mvs-interactive {
        pointer-events: auto;
      }

      /* ── Goutte Vocale au repos (16px) ── */
      .mvs-gem {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        border: 1.5px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 2px 8px rgba(234, 88, 12, 0.45);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .mvs-gem:hover {
        transform: scale(1.15);
        box-shadow: 0 4px 12px rgba(234, 88, 12, 0.6);
      }
      .mvs-gem-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #ffffff;
      }

      /* ── Pilule Sonore Déployée (Glassmorphism & Déplaçable) ── */
      .mvs-capsule {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px 5px 6px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 24px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2);
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: grab;
      }
      .mvs-capsule.mvs-dragging {
        cursor: grabbing;
        user-select: none;
      }

      /* Bouton Rouge d'Ondes Vocales */
      .mvs-wave-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #dc2626;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.5px;
        padding: 0 4px;
        box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
        transition: background-color 0.15s ease, transform 0.1s ease;
      }
      .mvs-wave-btn:hover {
        background: #ef4444;
        transform: scale(1.05);
      }
      .mvs-wave-btn.paused {
        background: #f59e0b;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
      }
      .mvs-wave-bar {
        width: 2px;
        height: 12px;
        background: #ffffff;
        border-radius: 1px;
        transform-origin: center;
        transition: transform 0.05s ease;
      }

      /* Chronomètre */
      .mvs-timer {
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #e2e8f0;
        letter-spacing: 0.3px;
        min-width: 34px;
      }

      /* Bouton de Mode Morphing (Rambler / Pro / Bullets) */
      .mvs-mode-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3px 7px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        color: #f1f5f9;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .mvs-mode-btn:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      /* Boutons d'action : Pause, Annuler */
      .mvs-ctrl-btn {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .mvs-ctrl-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.1);
      }

      /* Ticker de transcription live */
      .mvs-live-ticker {
        max-width: 240px;
        font-size: 11px;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0 4px;
      }

      /* Bannière d'erreur et réessai */
      .mvs-error-box {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: rgba(220, 38, 38, 0.2);
        border: 1px solid rgba(220, 38, 38, 0.4);
        border-radius: 14px;
      }
      .mvs-error-text {
        font-size: 11px;
        color: #fca5a5;
      }
      .mvs-btn-retry {
        padding: 2px 6px;
        background: #dc2626;
        color: #ffffff;
        border: none;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
      }

      /* Masquage utilitaire */
      .mvs-hidden {
        display: none !important;
      }
      .mvs-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `;

    racineShadow.appendChild(feuilleStyle);

    // Conteneur principal
    conteneurWidget = document.createElement("div");
    conteneurWidget.className = "mvs-root mvs-interactive mvs-hidden";

    // 1. Goutte Vocale
    boutonGoutte = document.createElement("div");
    boutonGoutte.className = "mvs-gem mvs-hidden";
    const estMacPlateforme = typeof navigator !== "undefined" && (
      (navigator.platform && navigator.platform.toUpperCase().includes("MAC")) ||
      (navigator.userAgent && navigator.userAgent.includes("Mac"))
    );
    boutonGoutte.title = estMacPlateforme
      ? "Démarrer la dictée vocale (⌃ ⇧ S)"
      : "Démarrer la dictée vocale (Alt + Shift + S)";
    const dot = document.createElement("div");
    dot.className = "mvs-gem-dot";
    boutonGoutte.appendChild(dot);
    conteneurWidget.appendChild(boutonGoutte);

    // 2. Capsule Complète
    vueCapsule = document.createElement("div");
    vueCapsule.className = "mvs-capsule mvs-hidden";

    // Bouton onde rouge
    btnOndeRouge = document.createElement("button");
    btnOndeRouge.type = "button";
    btnOndeRouge.className = "mvs-wave-btn";
    btnOndeRouge.title = "Arrêter et insérer le texte";
    barresBlanchesEls = [];
    for (let i = 0; i < 5; i++) {
      const b = document.createElement("div");
      b.className = "mvs-wave-bar";
      btnOndeRouge.appendChild(b);
      barresBlanchesEls.push(b);
    }
    vueCapsule.appendChild(btnOndeRouge);

    // Chrono
    timerEl = document.createElement("span");
    timerEl.className = "mvs-timer";
    timerEl.textContent = "00:00";
    vueCapsule.appendChild(timerEl);

    // Ticker Live
    tickerLiveEl = document.createElement("span");
    tickerLiveEl.className = "mvs-live-ticker mvs-hidden";
    vueCapsule.appendChild(tickerLiveEl);

    // Bouton Pause
    btnPause = document.createElement("button");
    btnPause.type = "button";
    btnPause.className = "mvs-ctrl-btn";
    btnPause.title = "Mettre en pause";
    btnPause.textContent = "⏸";
    vueCapsule.appendChild(btnPause);

    // Bouton Annuler (X)
    btnAnnuler = document.createElement("button");
    btnAnnuler.type = "button";
    btnAnnuler.className = "mvs-ctrl-btn";
    btnAnnuler.title = "Annuler la dictée (Échap)";
    btnAnnuler.textContent = "✕";
    vueCapsule.appendChild(btnAnnuler);

    // Bannière d'erreur
    banniereErreur = document.createElement("div");
    banniereErreur.className = "mvs-error-box mvs-hidden";
    texteErreurEl = document.createElement("span");
    texteErreurEl.className = "mvs-error-text";
    texteErreurEl.textContent = "Erreur";
    btnReessayer = document.createElement("button");
    btnReessayer.type = "button";
    btnReessayer.className = "mvs-btn-retry";
    btnReessayer.textContent = "Réessayer";
    banniereErreur.appendChild(texteErreurEl);
    banniereErreur.appendChild(btnReessayer);
    vueCapsule.appendChild(banniereErreur);

    conteneurWidget.appendChild(vueCapsule);

    // Zone d'annonces A11y
    zoneStatutA11y = document.createElement("div");
    zoneStatutA11y.className = "mvs-sr-only";
    zoneStatutA11y.setAttribute("role", "status");
    zoneStatutA11y.setAttribute("aria-live", "polite");
    conteneurWidget.appendChild(zoneStatutA11y);

    racineShadow.appendChild(conteneurWidget);
    attacherHoteDOM();

    // ── Événements sur les boutons du Shadow DOM ──
    boutonGoutte.addEventListener("mousedown", (e) => {
      e.preventDefault();
      demarrerDictée();
    });

    btnOndeRouge.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
        arreterEtTranscrire();
      }
    });

    btnPause.addEventListener("mousedown", (e) => {
      e.preventDefault();
      basculerPause();
    });

    btnAnnuler.addEventListener("mousedown", (e) => {
      e.preventDefault();
      annulerDictée();
    });

    btnReessayer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      reessayerTranscription();
    });

    // ── Gestion du Glisser-Déposer (Draggable) de la capsule ──
    vueCapsule.addEventListener("mousedown", (e) => {
      // Ignorer si le clic provient d'un bouton d'action ou autre élément interactif
      if (e.button !== 0 || e.target.closest("button") || e.target.closest(".mvs-ctrl-btn")) {
        return;
      }
      e.preventDefault();
      estEnGlissement = true;
      vueCapsule.classList.add("mvs-dragging");
      pointDepartGlissement = { x: e.clientX, y: e.clientY };
      const rect = conteneurWidget.getBoundingClientRect();
      offsetDepartGlissement = { x: rect.left, y: rect.top };
    });

    window.addEventListener(
      "mousemove",
      (e) => {
        if (!estEnGlissement) return;
        const deltaX = e.clientX - pointDepartGlissement.x;
        const deltaY = e.clientY - pointDepartGlissement.y;
        const rect = conteneurWidget.getBoundingClientRect();
        const larg = rect.width || 260;
        const haut = rect.height || 56;
        const nouveauX = Math.max(10, Math.min(window.innerWidth - larg - 10, offsetDepartGlissement.x + deltaX));
        const nouveauY = Math.max(10, Math.min(window.innerHeight - haut - 10, offsetDepartGlissement.y + deltaY));
        positionGlissee = { x: nouveauX, y: nouveauY };
        actualiserPositionCSS();
      },
      { passive: true }
    );

    window.addEventListener(
      "mouseup",
      () => {
        if (estEnGlissement) {
          estEnGlissement = false;
          if (vueCapsule) vueCapsule.classList.remove("mvs-dragging");
        }
      },
      { passive: true }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GESTION DES MODES ET DES ÉTATS DE L'INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Applique le nouvel état visuel de l'interface vocale.
   * @param {"HIDDEN" | "CARET_GEM" | "RECORDING" | "PAUSED" | "THINKING" | "ERROR"} nouvelEtat
   */
  function definirEtat(nouvelEtat) {
    etatCourant = nouvelEtat;
    actualiserPositionCSS();

    if (!conteneurWidget) return;

    if (nouvelEtat === "HIDDEN") {
      positionGlissee = null;
      estEnGlissement = false;
      if (vueCapsule) vueCapsule.classList.remove("mvs-dragging");
      conteneurWidget.classList.add("mvs-hidden");
      if (boutonGoutte) boutonGoutte.classList.add("mvs-hidden");
      if (vueCapsule) vueCapsule.classList.add("mvs-hidden");
      arreterAnimationOndes();
      arreterChrono();
      arreterKeepAlive();
      return;
    }

    conteneurWidget.classList.remove("mvs-hidden");

    if (nouvelEtat === "CARET_GEM") {
      if (boutonGoutte) boutonGoutte.classList.remove("mvs-hidden");
      if (vueCapsule) vueCapsule.classList.add("mvs-hidden");
      arreterAnimationOndes();
      arreterChrono();
      arreterKeepAlive();
      return;
    }

    // Dans tous les autres états, la capsule est visible
    if (boutonGoutte) boutonGoutte.classList.add("mvs-hidden");
    if (vueCapsule) vueCapsule.classList.remove("mvs-hidden");

    if (nouvelEtat === "RECORDING") {
      if (btnOndeRouge) btnOndeRouge.classList.remove("paused");
      if (btnPause) {
        btnPause.textContent = "⏸";
        btnPause.title = "Mettre en pause";
      }
      if (banniereErreur) banniereErreur.classList.add("mvs-hidden");
      demarrerAnimationOndes();
      demarrerChrono();
      demarrerKeepAlive();
      annoncerA11y("Enregistrement vocal en cours");
    } else if (nouvelEtat === "PAUSED") {
      if (btnOndeRouge) btnOndeRouge.classList.add("paused");
      if (btnPause) {
        btnPause.textContent = "▶";
        btnPause.title = "Reprendre l'enregistrement";
      }
      arreterAnimationOndes();
      arreterChrono();
      annoncerA11y("Enregistrement en pause");
    } else if (nouvelEtat === "THINKING") {
      arreterAnimationOndes();
      arreterChrono();
      if (timerEl) timerEl.textContent = "…";
      if (tickerLiveEl) {
        tickerLiveEl.classList.remove("mvs-hidden");
        tickerLiveEl.textContent = t("statusTranscribing") || "Transcription…";
      }
      annoncerA11y("Transcription en cours");
    } else if (nouvelEtat === "ERROR") {
      arreterAnimationOndes();
      arreterChrono();
      if (banniereErreur) banniereErreur.classList.remove("mvs-hidden");
    }
  }

  // ── Animation des 5 barres blanches d'ondes vocales ──
  // ── Utilitaires de conversion et libération audio locale ──
  function libererAudioLocal() {
    if (mediaRecorderLocal) {
      try {
        if (mediaRecorderLocal.state !== "inactive") {
          mediaRecorderLocal.stop();
        }
      } catch {}
      mediaRecorderLocal = null;
    }
    if (fluxMediaLocal) {
      fluxMediaLocal.getTracks().forEach((piste) => {
        try {
          piste.stop();
        } catch {}
      });
      fluxMediaLocal = null;
    }
    if (noeudSourceLocal) {
      try {
        noeudSourceLocal.disconnect();
      } catch {}
      noeudSourceLocal = null;
    }
    if (contexteAudioLocal && contexteAudioLocal.state !== "closed") {
      contexteAudioLocal.close().catch(() => {});
      contexteAudioLocal = null;
    }
    analyseurLocal = null;
    donneesFreqLocales = null;
    donneesTempsLocales = null;
  }

  function blobVersBase64Local(blob) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onloadend = () => {
        const res = lecteur.result;
        if (typeof res === "string") {
          const b64 = res.includes(",") ? res.split(",")[1].trim() : res.trim();
          resolve(b64);
        } else {
          reject(new Error("EMPTY_RECORDING"));
        }
      };
      lecteur.onerror = () => reject(new Error("EMPTY_RECORDING"));
      lecteur.readAsDataURL(blob);
    });
  }

  function calculerCinqBarresVocalesLocales() {
    if (!analyseurLocal || !donneesFreqLocales || !donneesTempsLocales) {
      return [0.22, 0.35, 0.5, 0.35, 0.22];
    }
    analyseurLocal.getByteFrequencyData(donneesFreqLocales);
    analyseurLocal.getByteTimeDomainData(donneesTempsLocales);

    let sommeCarres = 0;
    for (let i = 0; i < donneesTempsLocales.length; i++) {
      const norm = (donneesTempsLocales[i] - 128) / 128;
      sommeCarres += norm * norm;
    }
    const energieRms = Math.sqrt(sommeCarres / donneesTempsLocales.length);

    const plages = [
      [1, 4],
      [4, 9],
      [9, 18],
      [18, 32],
      [32, 52]
    ];
    const profilSymetrique = [0.65, 0.9, 1.15, 0.9, 0.65];
    const coefficientsFreq = [2.2, 3.0, 3.6, 3.0, 2.2];

    return plages.map(([debut, fin], idx) => {
      let somme = 0;
      const limite = Math.min(fin, donneesFreqLocales.length);
      const nb = Math.max(1, limite - debut);
      for (let i = debut; i < limite; i++) {
        somme += donneesFreqLocales[i];
      }
      const moyenneFreq = somme / (nb * 255);
      const composanteFreq = moyenneFreq * coefficientsFreq[idx];
      const composanteRms = energieRms * profilSymetrique[idx];
      const valeur = 0.18 + Math.max(composanteFreq, composanteRms);
      return Number(Math.min(1, Math.max(0.18, valeur)).toFixed(2));
    });
  }

  // ── Animation des 5 barres blanches d'ondes vocales à 60 FPS in-situ ──
  function demarrerAnimationOndes() {
    if (idBoucleAnimation) return;
    const animer = () => {
      if (etatCourant === "RECORDING") {
        ciblesBarres = calculerCinqBarresVocalesLocales();
      }
      phaseOnde += 0.08;
      for (let i = 0; i < 5; i++) {
        hauteursBarres[i] += (ciblesBarres[i] - hauteursBarres[i]) * 0.35;
        const echelle = Math.max(0.18, Math.min(1.0, hauteursBarres[i]));
        if (barresBlanchesEls[i]) {
          barresBlanchesEls[i].style.transform = `scaleY(${echelle})`;
        }
      }
      idBoucleAnimation = requestAnimationFrame(animer);
    };
    idBoucleAnimation = requestAnimationFrame(animer);
  }

  function arreterAnimationOndes() {
    if (idBoucleAnimation) {
      cancelAnimationFrame(idBoucleAnimation);
      idBoucleAnimation = null;
    }
    for (let i = 0; i < 5; i++) {
      if (barresBlanchesEls[i]) {
        barresBlanchesEls[i].style.transform = "scaleY(0.25)";
      }
    }
  }

  // ── Gestion du chronomètre ──
  function demarrerChrono() {
    if (idIntervalleChrono) return;
    idIntervalleChrono = setInterval(() => {
      secondesEcoulees++;
      if (timerEl) timerEl.textContent = formaterDuree(secondesEcoulees);
      if (secondesEcoulees >= DUREE_OPTIMALE_MAX_SEC) {
        arreterEtTranscrire();
      }
    }, 1000);
  }

  function arreterChrono() {
    if (idIntervalleChrono) {
      clearInterval(idIntervalleChrono);
      idIntervalleChrono = null;
    }
  }

  // ── Maintien de l'Event Page MV3 en vie ──
  function demarrerKeepAlive() {
    if (idIntervalleKeepAlive) return;
    idIntervalleKeepAlive = setInterval(() => {
      if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
        if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
          api.runtime.sendMessage({ action: "keepAliveAudioSession" }).catch(() => {});
        }
      }
    }, 8000);
  }

  function arreterKeepAlive() {
    if (idIntervalleKeepAlive) {
      clearInterval(idIntervalleKeepAlive);
      idIntervalleKeepAlive = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ACTIONS VOCALES IN-SITU & COMMUNICATION BACKGROUND
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Démarre la session d'enregistrement vocal in-situ dans l'onglet actif.
   * L'invite de permission native du micro s'affiche directement dans la page.
   */
  async function demarrerDictée() {
    if (demarrageEnCours || estDomaineExclu()) return;
    demarrageEnCours = true;

    secondesEcoulees = 0;
    dernierTexteLive = "";
    if (timerEl) timerEl.textContent = "00:00";
    if (tickerLiveEl) {
      tickerLiveEl.textContent = "";
      tickerLiveEl.classList.add("mvs-hidden");
    }

    // 1. Vérification de la configuration active auprès du background
    try {
      const configRep = await api.runtime.sendMessage({ action: "getConfig" });
      if (!configRep || !configRep.isConfigured) {
        api.runtime.sendMessage({ action: "openSetup" }).catch(() => {});
        reinitialiserApresAction();
        demarrageEnCours = false;
        return;
      }
      fournisseurActif = configRep.provider || "mistral";
    } catch {
      afficherErreur("SERVICE_UNAVAILABLE");
      demarrageEnCours = false;
      return;
    }

    // 2. Capture physique in-situ du microphone (Gecko User-Gesture)
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (errMicro) {
      if (DEBUG) console.error("[MagicVoiceScriber] Erreur getUserMedia in-situ :", errMicro);
      afficherErreur("MIC_DENIED");
      demarrageEnCours = false;
      return;
    }

    fluxMediaLocal = flux;

    // 3. AudioContext & AnalyserNode locaux pour animation des 5 barres à 60 FPS
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        contexteAudioLocal = new AudioCtx();
        if (contexteAudioLocal.state === "suspended") {
          await contexteAudioLocal.resume();
        }
        noeudSourceLocal = contexteAudioLocal.createMediaStreamSource(flux);
        analyseurLocal = contexteAudioLocal.createAnalyser();
        analyseurLocal.fftSize = 128;
        analyseurLocal.smoothingTimeConstant = 0.65;
        noeudSourceLocal.connect(analyseurLocal);
        donneesFreqLocales = new Uint8Array(analyseurLocal.frequencyBinCount);
        donneesTempsLocales = new Uint8Array(analyseurLocal.fftSize);
      }
    } catch (errCtx) {
      if (DEBUG) console.warn("[MagicVoiceScriber] Analyseur audio non initialisé :", errCtx);
    }

    // 4. MediaRecorder local
    tranchesAudioLocales = [];
    const candidatsMime = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    let mimeChoisi = "audio/webm";
    if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
      for (const m of candidatsMime) {
        if (MediaRecorder.isTypeSupported(m)) {
          mimeChoisi = m;
          break;
        }
      }
    }

    try {
      mediaRecorderLocal = new MediaRecorder(flux, { mimeType: mimeChoisi });
    } catch {
      mediaRecorderLocal = new MediaRecorder(flux);
    }

    mediaRecorderLocal.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) {
        tranchesAudioLocales.push(e.data);
      }
    });

    mediaRecorderLocal.start(100);
    definirEtat("RECORDING");
    demarrageEnCours = false;

    // Notifier le background de la session active
    if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
      api.runtime.sendMessage({ action: "startAudioSession" }).catch(() => {});
    }
  }

  /**
   * Met en pause ou reprend l'enregistrement audio in-situ.
   */
  function basculerPause() {
    if (!mediaRecorderLocal) return;
    if (etatCourant === "RECORDING" && mediaRecorderLocal.state === "recording") {
      try {
        mediaRecorderLocal.pause();
      } catch {}
      definirEtat("PAUSED");
    } else if (etatCourant === "PAUSED" && mediaRecorderLocal.state === "paused") {
      try {
        mediaRecorderLocal.resume();
      } catch {}
      definirEtat("RECORDING");
    }
  }

  /**
   * Arrête l'enregistrement, finalise la transcription et insère le texte propre au curseur.
   */
  async function arreterEtTranscrire() {
    definirEtat("THINKING");

    const rec = mediaRecorderLocal;
    const tranches = tranchesAudioLocales;
    const mime = rec ? rec.mimeType || "audio/webm" : "audio/webm";

    const blobFinal = await new Promise((resolve) => {
      if (!rec || rec.state === "inactive") {
        resolve(new Blob(tranches, { type: mime }));
        return;
      }
      rec.addEventListener(
        "stop",
        () => {
          resolve(new Blob(tranches, { type: mime }));
        },
        { once: true }
      );
      try {
        if (typeof rec.requestData === "function" && rec.state === "recording") {
          rec.requestData();
        }
        rec.stop();
      } catch {
        resolve(new Blob(tranches, { type: mime }));
      }
    });

    libererAudioLocal();
    dernierBlobLocal = blobFinal;

    if (!blobFinal || blobFinal.size < 100) {
      afficherErreur("EMPTY_RECORDING");
      return;
    }

    let audioBase64;
    try {
      audioBase64 = await blobVersBase64Local(blobFinal);
    } catch {
      afficherErreur("EMPTY_RECORDING");
      return;
    }

    try {
      const rep = await api.runtime.sendMessage({
        action: "transcribeAudio",
        audioBase64,
        mimeType: blobFinal.type || mime
      });

      if (rep && rep.success && rep.text) {
        insererTexteAuCurseur(rep.text);
        reinitialiserApresAction();
      } else {
        const err = rep && rep.error ? rep.error : "SERVICE_UNAVAILABLE";
        afficherErreur(err);
      }
    } catch (err) {
      if (DEBUG) console.error("[MagicVoiceScriber] Échec transcription :", err);
      afficherErreur("SERVICE_UNAVAILABLE");
    }
  }

  /**
   * Annule l'enregistrement in-situ sans transcrire.
   */
  function annulerDictée() {
    libererAudioLocal();
    if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
      api.runtime.sendMessage({ action: "cancelAudioSession" }).catch(() => {});
    }
    reinitialiserApresAction();
  }

  /**
   * Réessaie la transcription sur le dernier audio capturé sans ré-enregistrer.
   */
  async function reessayerTranscription() {
    if (!dernierBlobLocal || dernierBlobLocal.size < 100) {
      afficherErreur("EMPTY_RECORDING");
      return;
    }
    definirEtat("THINKING");
    try {
      const audioBase64 = await blobVersBase64Local(dernierBlobLocal);
      const rep = await api.runtime.sendMessage({
        action: "transcribeAudio",
        audioBase64,
        mimeType: dernierBlobLocal.type || "audio/webm"
      });
      if (rep && rep.success && rep.text) {
        insererTexteAuCurseur(rep.text);
        reinitialiserApresAction();
      } else {
        afficherErreur(rep && rep.error ? rep.error : "SERVICE_UNAVAILABLE");
      }
    } catch {
      afficherErreur("SERVICE_UNAVAILABLE");
    }
  }

  /**
   * Affiche un message d'erreur avec option de réessai.
   * @param {string} codeErreur
   */
  function afficherErreur(codeErreur) {
    definirEtat("ERROR");
    let msg = t("errorGeneric") || "Erreur de transcription";
    if (codeErreur === "MIC_DENIED") {
      msg = t("errorMicDenied") || "Microphone non autorisé";
    } else if (codeErreur === "EMPTY_RECORDING" || codeErreur === "NO_AUDIO") {
      msg = t("errorNoAudio") || "Aucun son détecté";
    } else if (codeErreur === "RATE_LIMITED") {
      msg = t("errorRateLimited") || "Limite d'appels atteinte";
    } else if (codeErreur === "NETWORK") {
      msg = t("errorNetwork") || "Erreur réseau";
    }
    if (texteErreurEl) texteErreurEl.textContent = msg;
    annoncerA11y(msg);
  }

  /**
   * Réinitialise l'affichage après insertion ou annulation.
   */
  function reinitialiserApresAction() {
    if (configLocale.caretGemEnabled && elementCibleActif && !estDomaineExclu()) {
      definirEtat("CARET_GEM");
    } else {
      definirEtat("HIDDEN");
    }
  }

  let dernierDeclenchementClavierMs = 0;
  let dernierBasculeDictéeMs = 0;

  /**
   * Bascule entre l'état inactif et l'enregistrement (raccourci clavier).
   */
  function basculerDictéeVocale() {
    const maintenant = Date.now();
    // Anti-rebond (ignore les déclenchements trop rapprochés < 350 ms)
    if (maintenant - dernierBasculeDictéeMs < 350) return;
    dernierBasculeDictéeMs = maintenant;

    if (estDomaineExclu()) return;
    if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
      arreterEtTranscrire();
    } else {
      // Trouver l'élément actif profond ou le curseur
      const el = obtenirElementActifProfond() || document.activeElement;
      if (estElementEligible(el)) {
        elementCibleActif = el;
      }
      demarrerDictée();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ÉCOUTEURS D'ÉVÉNEMENTS WEB & NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Variable de contrôle pour l'écouteur Google Docs
  let ecouteurDocsIframeAttache = false;

  /**
   * Attache le gestionnaire de raccourci clavier dans l'iframe proxy de Google Docs
   * afin d'intercepter les frappes avant leur neutralisation par l'éditeur Docs.
   */
  function attacherEcouteurGoogleDocs() {
    if (window.location.hostname !== "docs.google.com" || ecouteurDocsIframeAttache) return;
    try {
      const iframeProxy = document.querySelector(".docs-texteventtarget-iframe");
      if (iframeProxy) {
        const docIframe = iframeProxy.contentDocument || iframeProxy.contentWindow?.document;
        const winIframe = iframeProxy.contentWindow;
        if (docIframe) {
          docIframe.addEventListener("keydown", gererRaccourciClavier, true);
          if (winIframe) {
            winIframe.addEventListener("keydown", gererRaccourciClavier, true);
          }
          ecouteurDocsIframeAttache = true;
        }
      }
    } catch {}
  }

  /**
   * Gestionnaire centralisé des raccourcis clavier en phase de capture (True).
   * @param {KeyboardEvent} e
   */
  function gererRaccourciClavier(e) {
    // 1. Déclenchement de la dictée :
    // - Sur Mac : Control + Shift + S/D (sans conflit Google Docs) ou Option + Shift + S/D
    // - Sur Windows/Linux : Alt + Shift + S/D
    const modificateur = (e.ctrlKey || e.altKey) && e.shiftKey;
    if (modificateur) {
      if (e.code === "KeyS" || e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        dernierDeclenchementClavierMs = Date.now();
        basculerDictéeVocale();
        return;
      }
    }

    // 2. Contrôles pendant la session vocale active
    if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        arreterEtTranscrire();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        annulerDictée();
        return;
      }
    }
  }

  // Écoute des raccourcis clavier au plus haut de la chaîne d'événements (Window & Document en capture)
  window.addEventListener("keydown", gererRaccourciClavier, true);
  document.addEventListener("keydown", gererRaccourciClavier, true);

  // Focus sur les éléments de saisie du Web (avec résilience Shadow DOM & Google Docs)
  document.addEventListener(
    "focusin",
    (e) => {
      attacherEcouteurGoogleDocs();
      const cible = e.target;
      if (estElementEligible(cible) && !estDomaineExclu()) {
        elementCibleActif = cible;
        if (configLocale.caretGemEnabled && etatCourant === "HIDDEN") {
          definirEtat("CARET_GEM");
        }
        return;
      }

      // Repli asynchrone pour les composants à encapsulation Shadow DOM / Angular (ex: NotebookLM textarea)
      setTimeout(() => {
        const profond = obtenirElementActifProfond();
        if (profond && profond !== cible && estElementEligible(profond) && !estDomaineExclu()) {
          elementCibleActif = profond;
          if (configLocale.caretGemEnabled && etatCourant === "HIDDEN") {
            definirEtat("CARET_GEM");
          }
        }
      }, 50);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (e) => {
      // Si la capsule est activement en cours d'enregistrement, ne pas la fermer lors d'un léger changement de focus
      if (etatCourant === "RECORDING" || etatCourant === "PAUSED" || etatCourant === "THINKING") {
        return;
      }
      setTimeout(() => {
        const nouveauFocus = obtenirElementActifProfond() || document.activeElement;
        if (!estElementEligible(nouveauFocus)) {
          elementCibleActif = null;
          if (etatCourant === "CARET_GEM") {
            definirEtat("HIDDEN");
          }
        }
      }, 120);
    },
    true
  );

  // Mise à jour de la position sur scroll / redimensionnement
  window.addEventListener("scroll", () => actualiserPositionCSS(), { passive: true });
  window.addEventListener("resize", () => actualiserPositionCSS(), { passive: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ÉCOUTEURS DE MESSAGES DU SCRIPT D'ARRIÈRE-PLAN & DU STOCKAGE
  // ═══════════════════════════════════════════════════════════════════════════

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.action !== "string") return;

      if (message.action === "toggleVoicePill") {
        // Déduplication : si le raccourci vient déjà d'être déclenché par le keydown DOM (< 700 ms),
        // ignorer le message redondant provenant de la commande WebExtension globale
        if (Date.now() - dernierDeclenchementClavierMs < 700) {
          return;
        }
        basculerDictéeVocale();
        return;
      }

      if (message.action === "configUpdated") {
        rechargerConfiguration();
        return;
      }

      if (message.action === "updateVoiceBars" && Array.isArray(message.bars)) {
        ciblesBarres = message.bars;
        return;
      }

      if (message.action === "updateLiveTranscript") {
        dernierTexteLive = message.fullLiveText || message.committedText || "";
        if (tickerLiveEl && dernierTexteLive) {
          tickerLiveEl.classList.remove("mvs-hidden");
          tickerLiveEl.textContent = dernierTexteLive;
        }
      }
    });
  }

  // Écouteur réactif des modifications de configuration dans storage.local
  if (api && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") {
        rechargerConfiguration();
      }
    });
  }

  /**
   * Recharge les paramètres depuis le background.
   */
  async function rechargerConfiguration() {
    try {
      const rep = await api.runtime.sendMessage({ action: "getConfig" });
      if (rep && rep.success) {
        configLocale.caretGemEnabled = Boolean(rep.caretGemEnabled);
        configLocale.sitesExclus = Array.isArray(rep.sitesExclus) ? rep.sitesExclus : [];
        configLocale.shortcutKey = rep.shortcutKey || "KeyS";
        configLocale.provider = rep.provider || "gemini";
        configLocale.geminiModel = rep.geminiModel || "gemini-3.5-transcribe";
        fournisseurActif = configLocale.provider;

        if (estDomaineExclu()) {
          definirEtat("HIDDEN");
        } else if (configLocale.caretGemEnabled && elementCibleActif && etatCourant === "HIDDEN") {
          definirEtat("CARET_GEM");
        } else if (!configLocale.caretGemEnabled && etatCourant === "CARET_GEM") {
          definirEtat("HIDDEN");
        }
      }
    } catch {}
  }

  // Initialisation automatique au chargement en contexte WebExtension
  if (typeof document !== "undefined" && typeof document.createElement === "function" && typeof module === "undefined") {
    creerStructureShadowDOM();
    rechargerConfiguration();
    // Tentative d'attachement précoce de l'interception Google Docs
    attacherEcouteurGoogleDocs();
    setTimeout(attacherEcouteurGoogleDocs, 500);
    setTimeout(attacherEcouteurGoogleDocs, 1500);
  }

  // Export pour les tests unitaires automatisés Node.js
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      estElementEligible,
      insererTexteAuCurseur,
      estDomaineExclu,
      obtenirElementActifProfond,
      calculerPositionWidget,
      actualiserPositionCSS,
      gererRaccourciClavier,
      definirEtat,
      configLocale
    };
  }
})();
