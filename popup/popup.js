/**
 * Magic Voice Scriber — Logique Métier du Mini-Popup Popover (Firefox MV3)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Détecter l'onglet actif et le domaine courant (liste noire sitesExclus)
 *   2. Basculer le mode furtif de la Goutte Vocale (caretGemEnabled)
 *   3. Sélectionner le raccourci clavier (Alt+Shift+S / Alt+Shift+D avec détection macOS ⌥)
 *   4. Lancer instantanément la dictée ou ouvrir l'assistant / options
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

/**
 * Récupère une chaîne traduite depuis les dictionnaires i18n.
 * @param {string} cle - Clé de message
 * @returns {string}
 */
function t(cle) {
  try {
    if (api && api.i18n && typeof api.i18n.getMessage === "function") {
      const msg = api.i18n.getMessage(cle);
      if (msg) return msg;
    }
  } catch {
    /* Fallback silencieux */
  }
  return "";
}

/**
 * Applique l'internationalisation sur tous les éléments déclaratifs du DOM.
 */
function appliquerI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const cle = el.getAttribute("data-i18n");
    const msg = t(cle);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-title");
    const msg = t(cle);
    if (msg) el.setAttribute("title", msg);
  });
}

/**
 * Initialisation principale du mini-popup.
 */
document.addEventListener("DOMContentLoaded", async () => {
  appliquerI18n();

  // Éléments du DOM
  const switchSite = document.getElementById("switch-site-enabled");
  const switchCaretGem = document.getElementById("switch-caret-gem");
  const domainNameEl = document.getElementById("popup-domain-name");
  const btnShortcutS = document.getElementById("btn-shortcut-s");
  const btnShortcutD = document.getElementById("btn-shortcut-d");
  const labelShortcutS = document.getElementById("label-shortcut-s");
  const labelShortcutD = document.getElementById("label-shortcut-d");
  const btnQuickDictate = document.getElementById("btn-quick-dictate");
  const btnOpenSetup = document.getElementById("btn-open-setup");
  const btnOpenOptions = document.getElementById("btn-open-options");

  // Détection macOS pour le formatage visuel des touches
  const estMac = /Mac/i.test(navigator.userAgent || navigator.platform || "");
  if (labelShortcutS) labelShortcutS.textContent = estMac ? "⌥ ⇧ S" : "Alt + Shift + S";
  if (labelShortcutD) labelShortcutD.textContent = estMac ? "⌥ ⇧ D" : "Alt + Shift + D";

  let domaineActif = "";
  let ongletActifId = null;

  // 1. Détection de l'onglet et du domaine actif
  try {
    const onglets = await api.tabs.query({ active: true, currentWindow: true });
    if (onglets && onglets[0]) {
      ongletActifId = onglets[0].id;
      if (onglets[0].url) {
        try {
          const u = new URL(onglets[0].url);
          if (u.protocol === "http:" || u.protocol === "https:") {
            domaineActif = u.hostname.toLowerCase();
          } else {
            domaineActif = "";
          }
        } catch {
          domaineActif = "";
        }
      }
    }
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Note tabs.query :", err);
  }

  if (domainNameEl) {
    if (domaineActif) {
      domainNameEl.textContent = domaineActif;
    } else {
      domainNameEl.textContent = t("popupDomainSystem") || "Page système / non supportée";
      if (switchSite) switchSite.disabled = true;
    }
  }

  // 2. Chargement de la configuration existante
  let config = {};
  try {
    const reponseConfig = await api.runtime.sendMessage({ action: "getConfig" });
    if (reponseConfig && reponseConfig.success) {
      config = reponseConfig;
    }
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Erreur getConfig :", err);
  }

  // État du site actuel dans la liste noire (avec prise en compte des sous-domaines)
  const sitesExclus = Array.isArray(config.sitesExclus) ? config.sitesExclus : [];
  const estExclu = domaineActif
    ? sitesExclus.some((ex) => domaineActif === ex || domaineActif.endsWith("." + ex))
    : false;
  if (switchSite && domaineActif) {
    switchSite.checked = !estExclu;
  }

  // État de la Goutte Vocale
  if (switchCaretGem) {
    switchCaretGem.checked = Boolean(config.caretGemEnabled);
  }

  // État du raccourci clavier sélectionné
  const raccourciActif = config.shortcutKey === "KeyD" ? "KeyD" : "KeyS";
  if (raccourciActif === "KeyD") {
    btnShortcutD.classList.add("active");
    btnShortcutS.classList.remove("active");
  } else {
    btnShortcutS.classList.add("active");
    btnShortcutD.classList.remove("active");
  }

  /**
   * Notifie l'onglet actif du rechargement des paramètres web.
   */
  async function notifierOngletActif() {
    if (!ongletActifId) return;
    try {
      await api.tabs.sendMessage(ongletActifId, { action: "configUpdated" });
    } catch {
      /* Ignorer si le script n'est pas encore injecté */
    }
  }

  // 3. Gestionnaire du toggle Activation sur le site courant
  if (switchSite && domaineActif) {
    switchSite.addEventListener("change", async () => {
      const activeSurCeSite = switchSite.checked;
      try {
        await api.runtime.sendMessage({
          action: "toggleDomainExclusion",
          domain: domaineActif,
          enabled: activeSurCeSite
        });
        await notifierOngletActif();
      } catch (err) {
        if (DEBUG) console.error("[MagicVoiceScriber] Erreur toggleDomainExclusion :", err);
      }
    });
  }

  // 4. Gestionnaire du toggle Goutte Vocale au repos
  if (switchCaretGem) {
    switchCaretGem.addEventListener("change", async () => {
      const activee = switchCaretGem.checked;
      try {
        await api.runtime.sendMessage({
          action: "updateWebConfig",
          caretGemEnabled: activee
        });
        await notifierOngletActif();
      } catch (err) {
        if (DEBUG) console.error("[MagicVoiceScriber] Erreur updateWebConfig caretGem :", err);
      }
    });
  }

  // 5. Gestionnaire de bascule du raccourci clavier
  function selectionnerRaccourci(code) {
    const touche = code === "KeyD" ? "KeyD" : "KeyS";
    if (touche === "KeyD") {
      btnShortcutD.classList.add("active");
      btnShortcutS.classList.remove("active");
    } else {
      btnShortcutS.classList.add("active");
      btnShortcutD.classList.remove("active");
    }
    api.runtime
      .sendMessage({
        action: "updateWebConfig",
        shortcutKey: touche
      })
      .then(() => notifierOngletActif())
      .catch(() => {});
  }

  if (btnShortcutS) {
    btnShortcutS.addEventListener("click", () => selectionnerRaccourci("KeyS"));
  }
  if (btnShortcutD) {
    btnShortcutD.addEventListener("click", () => selectionnerRaccourci("KeyD"));
  }

  // 6. Démarrage instantané de la dictée
  if (btnQuickDictate) {
    btnQuickDictate.addEventListener("click", async () => {
      try {
        await api.runtime.sendMessage({ action: "toggleVoicePill" });
      } catch {
        /* Ignorer */
      }
      window.close();
    });
  }

  // 7. Accès rapide à l'Assistant de configuration & Options
  if (btnOpenSetup) {
    btnOpenSetup.addEventListener("click", async () => {
      try {
        await api.runtime.sendMessage({ action: "openSetup" });
      } catch {
        /* Ignorer */
      }
      window.close();
    });
  }

  if (btnOpenOptions) {
    btnOpenOptions.addEventListener("click", async () => {
      try {
        await api.runtime.sendMessage({ action: "openOptions" });
      } catch {
        /* Ignorer */
      }
      window.close();
    });
  }
});
