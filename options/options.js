/**
 * Magic Voice Scriber — Logique Métier de la Page de Paramètres (Options)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Appliquer l'internationalisation native sur tous les nœuds déclaratifs (6 langues)
 *   2. Charger et sauvegarder les préférences dans browser.storage.local
 *   3. Gérer le Trio de Moteurs (Mistral AI par défaut, Google Gemini, Localhost)
 *   4. Gérer l'ergonomie web (Goutte vocale au repos, liste noire de domaines)
 *   5. Vérifier et demander en 1 clic les permissions d'hôtes WebExtension
 *   6. Tester en direct la connexion au moteur sélectionné et relancer le wizard
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

/**
 * Récupère une chaîne traduite depuis _locales/<lang>/messages.json.
 * @param {string} cle - Identifiant de la clé i18n
 * @returns {string}
 */
function t(cle) {
  try {
    if (api && api.i18n && typeof api.i18n.getMessage === "function") {
      const msg = api.i18n.getMessage(cle);
      if (msg) return msg;
    }
  } catch {
    /* Ignorer */
  }
  return "";
}

/**
 * Parcourt le DOM et applique les traductions sur tous les attributs data-i18n*.
 */
function appliquerI18n() {
  if (api && api.i18n && typeof api.i18n.getUILanguage === "function") {
    try {
      const uiLang = api.i18n.getUILanguage();
      if (uiLang) {
        document.documentElement.lang = uiLang.substring(0, 2);
      }
    } catch {}
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const cle = el.getAttribute("data-i18n");
    const msg = t(cle);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-placeholder");
    const msg = t(cle);
    if (msg) el.setAttribute("placeholder", msg);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-title");
    const msg = t(cle);
    if (msg) el.setAttribute("title", msg);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-aria-label");
    const msg = t(cle);
    if (msg) el.setAttribute("aria-label", msg);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  appliquerI18n();

  // ── Références DOM ─────────────────────────────────────────────────────────
  const form = document.getElementById("form-options");
  const btnOpenSetup = document.getElementById("btn-open-setup");
  const selectProvider = document.getElementById("select-provider");
  const providerBadge = document.getElementById("provider-badge");
  const helpProvider = document.getElementById("help-provider");

  // Section 1A : Google Gemini (Par défaut)
  const sectionGemini = document.getElementById("section-gemini");
  const inputGeminiKey = document.getElementById("gemini-api-key");
  const btnToggleGeminiKey = document.getElementById("btn-toggle-gemini-key");

  // Section 1B : Mistral AI
  const sectionMistral = document.getElementById("section-mistral");
  const inputMistralKey = document.getElementById("mistral-api-key");
  const btnToggleMistralKey = document.getElementById("btn-toggle-mistral-key");

  // Section 1C : Modèle 100 % Local
  const sectionLocal = document.getElementById("section-local");
  const inputLocalSttUrl = document.getElementById("local-stt-url");
  const inputLocalSttModel = document.getElementById("local-stt-model");

  // Section 2 : Ergonomie Web & Exclusions
  const switchCaretGem = document.getElementById("caret-gem-enabled");
  const inputNewDomain = document.getElementById("input-new-domain");
  const btnAddDomain = document.getElementById("btn-add-domain");
  const sitesExclusContainer = document.getElementById("sites-exclus-container");
  const sitesExclusEmpty = document.getElementById("sites-exclus-empty");

  // Bannière Permission & Statut
  const permissionBanner = document.getElementById("permission-warning-banner");
  const permissionDomainCode = document.getElementById("permission-domain-code");
  const btnGrantPermission = document.getElementById("btn-grant-permission");
  const statusContainer = document.getElementById("status-container");
  const statusIcon = document.getElementById("status-icon");
  const statusText = document.getElementById("status-text");
  const btnTest = document.getElementById("btn-test");

  // ── Valeurs par défaut ─────────────────────────────────────────────────────
  const DEFAUTS = {
    provider: "gemini",
    geminiApiKey: "",
    mistralApiKey: "",
    localSttUrl: "http://localhost:8000",
    localSttModel: "whisper-1",
    caretGemEnabled: false,
    sitesExclus: []
  };

  // Liste locale des domaines exclus
  let listeSitesExclus = [];

  /**
   * Met à jour le rendu visuel de la liste des domaines exclus (Zéro innerHTML).
   */
  function rendreSitesExclus() {
    if (!sitesExclusContainer) return;
    sitesExclusContainer.replaceChildren();

    if (listeSitesExclus.length === 0) {
      if (sitesExclusEmpty) sitesExclusEmpty.classList.remove("mvs-hidden");
      return;
    }

    if (sitesExclusEmpty) sitesExclusEmpty.classList.add("mvs-hidden");

    listeSitesExclus.forEach((domaine, index) => {
      const badge = document.createElement("span");
      badge.className = "mvs-tag-badge";

      const nomSpan = document.createElement("span");
      nomSpan.textContent = domaine;
      badge.appendChild(nomSpan);

      const btnSuppr = document.createElement("button");
      btnSuppr.type = "button";
      btnSuppr.className = "mvs-btn-remove-tag";
      btnSuppr.setAttribute("aria-label", `Supprimer ${domaine}`);
      btnSuppr.textContent = "✕";
      btnSuppr.addEventListener("click", () => {
        listeSitesExclus.splice(index, 1);
        rendreSitesExclus();
      });

      badge.appendChild(btnSuppr);
      sitesExclusContainer.appendChild(badge);
    });
  }

  /**
   * Ajoute un nom de domaine à la liste des sites exclus après assainissement.
   */
  function ajouterDomaineExclu() {
    if (!inputNewDomain) return;
    let brut = inputNewDomain.value.trim().toLowerCase();
    if (!brut) return;

    // Assainissement (retrait http/https et slash)
    brut = brut.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();

    if (!brut || !brut.includes(".")) {
      afficherStatut("error", t("domainInvalid") || "Nom de domaine invalide");
      return;
    }

    if (listeSitesExclus.includes(brut)) {
      afficherStatut("error", t("domainAlreadyExcluded") || "Ce domaine est déjà exclu");
      return;
    }

    listeSitesExclus.push(brut);
    inputNewDomain.value = "";
    rendreSitesExclus();
  }

  if (btnAddDomain) {
    btnAddDomain.addEventListener("click", ajouterDomaineExclu);
  }
  if (inputNewDomain) {
    inputNewDomain.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ajouterDomaineExclu();
      }
    });
  }

  // ── Relance de l'Assistant de Configuration ──────────────────────────────
  if (btnOpenSetup) {
    btnOpenSetup.addEventListener("click", async () => {
      try {
        const urlSetup = api.runtime.getURL("setup/setup.html");
        await api.tabs.create({ url: urlSetup });
      } catch (err) {
        if (DEBUG) console.error("[MagicVoiceScriber] Erreur ouverture setup :", err);
      }
    });
  }

  /**
   * Affiche un message dans la bannière de statut.
   * @param {'loading'|'success'|'error'} type
   * @param {string} message
   */
  function afficherStatut(type, message) {
    if (!statusContainer || !statusIcon || !statusText) return;
    statusContainer.className = `mvs-status-banner mvs-status-${type}`;
    statusContainer.classList.remove("mvs-hidden");

    if (type === "loading") statusIcon.textContent = "⏳";
    else if (type === "success") statusIcon.textContent = "✓";
    else statusIcon.textContent = "⚠";

    statusText.textContent = message;
  }

  /**
   * Collecte la configuration actuelle saisie dans le formulaire.
   * @returns {typeof DEFAUTS}
   */
  function lireConfigFormulaire() {
    return {
      provider: selectProvider ? selectProvider.value : "gemini",
      geminiApiKey: inputGeminiKey ? inputGeminiKey.value.trim() : "",
      mistralApiKey: inputMistralKey ? inputMistralKey.value.trim() : "",
      localSttUrl: inputLocalSttUrl ? inputLocalSttUrl.value.trim() || "http://localhost:8000" : "http://localhost:8000",
      localSttModel: inputLocalSttModel ? inputLocalSttModel.value.trim() || "whisper-1" : "whisper-1",
      caretGemEnabled: Boolean(switchCaretGem && switchCaretGem.checked),
      sitesExclus: [...listeSitesExclus]
    };
  }

  /**
   * Met à jour les panneaux visibles selon le fournisseur sélectionné.
   */
  function actualiserVisibiliteFournisseur() {
    if (!selectProvider) return;
    const provider = selectProvider.value;

    if (sectionGemini) sectionGemini.classList.add("mvs-hidden");
    if (sectionMistral) sectionMistral.classList.add("mvs-hidden");
    if (sectionLocal) sectionLocal.classList.add("mvs-hidden");

    if (provider === "gemini") {
      if (sectionGemini) sectionGemini.classList.remove("mvs-hidden");
      if (providerBadge) providerBadge.textContent = t("badgeDefault") || "Google Gemini (Par défaut)";
      if (helpProvider) helpProvider.textContent = t("helpProviderGemini") || "";
    } else if (provider === "mistral") {
      if (sectionMistral) sectionMistral.classList.remove("mvs-hidden");
      if (providerBadge) providerBadge.textContent = "Mistral AI (Haute fidélité)";
      if (helpProvider) helpProvider.textContent = t("helpProviderMistral") || "";
    } else if (provider === "local") {
      if (sectionLocal) sectionLocal.classList.remove("mvs-hidden");
      if (providerBadge) providerBadge.textContent = "Localhost (Whisper)";
      if (helpProvider) helpProvider.textContent = t("helpProviderLocal") || "";
    }

    verifierPermissionOrigine();
  }

  /**
   * Vérifie si la permission réseau d'hôte est déjà accordée pour l'URL configurée.
   */
  async function verifierPermissionOrigine() {
    if (!globalThis.MVSProviders) return;
    const config = lireConfigFormulaire();
    const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

    try {
      if (api && api.permissions && api.permissions.contains) {
        const accorde = await api.permissions.contains({ origins: [origine] });
        if (!accorde) {
          if (permissionDomainCode) permissionDomainCode.textContent = origine;
          if (permissionBanner) permissionBanner.classList.remove("mvs-hidden");
          return;
        }
      }
    } catch {
      /* Ignorer */
    }
    if (permissionBanner) permissionBanner.classList.add("mvs-hidden");
  }

  /**
   * Configure un bouton Afficher / Masquer pour un champ de clé API.
   * @param {HTMLButtonElement} bouton
   * @param {HTMLInputElement} champ
   */
  function lierBoutonVisibiliteCle(bouton, champ) {
    if (!bouton || !champ) return;
    bouton.addEventListener("click", () => {
      champ.type = champ.type === "password" ? "text" : "password";
    });
  }

  lierBoutonVisibiliteCle(btnToggleMistralKey, inputMistralKey);
  lierBoutonVisibiliteCle(btnToggleGeminiKey, inputGeminiKey);

  // ── Chargement initial depuis browser.storage.local ────────────────────────
  try {
    const stocke = await api.storage.local.get(Object.keys(DEFAUTS));
    const cfg = { ...DEFAUTS, ...stocke };

    if (selectProvider) selectProvider.value = cfg.provider;
    if (inputGeminiKey) inputGeminiKey.value = cfg.geminiApiKey || "";
    if (inputMistralKey) inputMistralKey.value = cfg.mistralApiKey || "";

    if (inputLocalSttUrl) inputLocalSttUrl.value = cfg.localSttUrl || "http://localhost:8000";
    if (inputLocalSttModel) inputLocalSttModel.value = cfg.localSttModel || "whisper-1";

    if (switchCaretGem) {
      switchCaretGem.checked = Boolean(cfg.caretGemEnabled);
    }
    listeSitesExclus = Array.isArray(cfg.sitesExclus) ? [...cfg.sitesExclus] : [];
    rendreSitesExclus();
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Erreur lecture options :", err);
  }

  actualiserVisibiliteFournisseur();

  // ── Événements de Changement de Fournisseur ─────────────────────────────────
  if (selectProvider) {
    selectProvider.addEventListener("change", actualiserVisibiliteFournisseur);
  }
  if (inputLocalSttUrl) {
    inputLocalSttUrl.addEventListener("input", verifierPermissionOrigine);
  }

  // ── Autorisation Réseau 1-Clic ─────────────────────────────────────────────
  if (btnGrantPermission) {
    btnGrantPermission.addEventListener("click", async () => {
      const config = lireConfigFormulaire();
      const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);
      try {
        if (api.permissions && api.permissions.request) {
          const accorde = await api.permissions.request({ origins: [origine] });
          if (accorde && permissionBanner) {
            permissionBanner.classList.add("mvs-hidden");
          }
        }
      } catch {
        /* Ignorer */
      }
    });
  }

  // ── Test de Connexion en Direct ────────────────────────────────────────────
  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      const config = lireConfigFormulaire();
      const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

      try {
        if (api.permissions && api.permissions.request) {
          await api.permissions.request({ origins: [origine] });
          await verifierPermissionOrigine();
        }
      } catch {
        /* Ignorer */
      }

      afficherStatut("loading", t("statusTesting") || "Test en cours...");

      try {
        const res = await api.runtime.sendMessage({
          action: "testProvider",
          config
        });

        if (res && res.success) {
          afficherStatut("success", t("statusTestSuccess") || "Connexion établie avec succès !");
        } else {
          const code = (res && res.message) || "SERVICE_UNAVAILABLE";
          const detail = code === "UNAUTHORIZED" ? (t("errorUnauthorized") || "Clé invalide") : code;
          afficherStatut("error", `${t("statusTestFailed") || "Échec du test :"} ${detail}`);
        }
      } catch {
        afficherStatut("error", `${t("statusTestFailed") || "Échec du test :"} ${t("errorNetwork") || "Erreur réseau"}`);
      }
    });
  }

  // ── Sauvegarde des Paramètres ──────────────────────────────────────────────
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const config = lireConfigFormulaire();
      const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

      try {
        if (api.permissions && api.permissions.request) {
          await api.permissions.request({ origins: [origine] });
          await verifierPermissionOrigine();
        }
      } catch {
        /* Ignorer */
      }

      try {
        await api.storage.local.set(config);
        afficherStatut("success", t("statusSaved") || "Paramètres enregistrés avec succès !");
      } catch {
        afficherStatut("error", t("errorServiceUnavailable") || "Erreur lors de la sauvegarde.");
      }
    });
  }
});
