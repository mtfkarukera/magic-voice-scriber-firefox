/**
 * Magic Voice Scriber — Logique Métier de l'Assistant de Configuration (Firefox MV3)
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Guider l'utilisateur pas-à-pas à travers un stepper interactif (5 étapes)
 *   2. Diagnostiquer l'accès microphone avec visualiseur 5 barres et autorisation native Firefox
 *   3. Valider en 1 clic la connexion aux APIs d'IA (Gemini, Mistral, Groq, OpenAI, Local)
 *   4. Offrir un bac à sable interactif en direct (phrase test, dictée, badges de nettoyage)
 *   5. Enregistrer les préférences globales dans browser.storage.local
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

/**
 * Récupère une chaîne traduite depuis les dictionnaires i18n.
 * @param {string} cle - Clé de traduction
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
}

/**
 * Convertit un Blob audio en chaîne Base64 pure.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobVersBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onloadend = () => {
      if (typeof lecteur.result === "string") {
        const base64 = lecteur.result.includes(",")
          ? lecteur.result.split(",")[1]
          : lecteur.result;
        resolve(base64);
      } else {
        reject(new Error("NO_AUDIO"));
      }
    };
    lecteur.onerror = () => reject(new Error("NO_AUDIO"));
    lecteur.readAsDataURL(blob);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (api && api.i18n && typeof api.i18n.getUILanguage === "function") {
    const lang = api.i18n.getUILanguage().slice(0, 2);
    document.documentElement.lang = lang;
  }
  appliquerI18n();

  // ═════════════════════════════════════════════════════════════════════════
  // 1. GESTION DU STEPPER (NAVIGATION PAS-À-PAS)
  // ═════════════════════════════════════════════════════════════════════════

  let etapeCourante = 1;
  const totalEtapes = 5;

  const panels = {
    1: document.getElementById("step-panel-1"),
    2: document.getElementById("step-panel-2"),
    3: document.getElementById("step-panel-3"),
    4: document.getElementById("step-panel-4"),
    5: document.getElementById("step-panel-5")
  };

  const stepIndicators = {
    1: document.getElementById("step-btn-1"),
    2: document.getElementById("step-btn-2"),
    3: document.getElementById("step-btn-3"),
    4: document.getElementById("step-btn-4"),
    5: document.getElementById("step-btn-5")
  };

  function afficherEtape(numero) {
    if (numero < 1 || numero > totalEtapes) return;

    if (etapeCourante === 1 && numero !== 1) {
      arreterTestMicro();
    }
    if (etapeCourante === 4 && numero !== 4 && typeof arreterEnregistrementDemo === "function") {
      arreterEnregistrementDemo(true);
    }

    etapeCourante = numero;

    Object.keys(panels).forEach((k) => {
      const n = parseInt(k, 10);
      if (panels[n]) {
        panels[n].classList.toggle("active", n === numero);
      }
    });

    Object.keys(stepIndicators).forEach((k) => {
      const n = parseInt(k, 10);
      const btn = stepIndicators[n];
      if (btn) {
        btn.classList.toggle("active", n === numero);
        btn.classList.toggle("completed", n < numero);
        if (n === numero) {
          btn.setAttribute("aria-current", "step");
        } else {
          btn.removeAttribute("aria-current");
        }
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    // Restauration du focus accessible sur le titre de l'étape active
    const panneauActif = panels[numero];
    if (panneauActif) {
      const titreEtape = panneauActif.querySelector("h2");
      if (titreEtape) {
        titreEtape.setAttribute("tabindex", "-1");
        titreEtape.focus({ preventScroll: true });
      }
    }
  }

  document.querySelectorAll(".mvs-btn-next").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cible = parseInt(btn.getAttribute("data-next"), 10);
      afficherEtape(cible);
    });
  });

  document.querySelectorAll(".mvs-btn-prev").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cible = parseInt(btn.getAttribute("data-prev"), 10);
      afficherEtape(cible);
    });
  });

  Object.keys(stepIndicators).forEach((k) => {
    const n = parseInt(k, 10);
    const btn = stepIndicators[n];
    if (btn) {
      btn.addEventListener("click", () => afficherEtape(n));
    }
  });

  window.addEventListener("pagehide", () => {
    arreterTestMicro();
    if (typeof arreterEnregistrementDemo === "function") {
      arreterEnregistrementDemo(true);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. ÉTAPE 1 : DÉTECTION OS & TEST MICROPHONE EN DIRECT
  // ═════════════════════════════════════════════════════════════════════════

  let platformOS = "unknown";
  const osIcon = document.getElementById("os-icon");
  const osNameLabel = document.getElementById("os-name-label");
  const osDetailText = document.getElementById("os-detail-text");
  const setupShortcutBadge = document.getElementById("setup-shortcut-badge");

  try {
    if (api && api.runtime && typeof api.runtime.getPlatformInfo === "function") {
      const info = await api.runtime.getPlatformInfo();
      platformOS = info.os || "unknown";
    }
  } catch {
    if (navigator.userAgent.includes("Linux")) platformOS = "linux";
    else if (navigator.userAgent.includes("Mac")) platformOS = "mac";
    else if (navigator.userAgent.includes("Win")) platformOS = "win";
  }

  if (platformOS === "linux") {
    if (osIcon) osIcon.textContent = "🐧";
    if (osNameLabel) osNameLabel.textContent = "Système Linux détecté";
    if (osDetailText) osDetailText.textContent = "Ubuntu, Debian ou dérivé Linux";
  } else if (platformOS === "mac") {
    if (osIcon) osIcon.textContent = "🍏";
    if (osNameLabel) osNameLabel.textContent = "Système macOS détecté";
    if (osDetailText) osDetailText.textContent = "Apple Silicon ou Intel";
    if (setupShortcutBadge) setupShortcutBadge.textContent = "⌃ + Shift + S";
  } else if (platformOS === "win") {
    if (osIcon) osIcon.textContent = "🪟";
    if (osNameLabel) osNameLabel.textContent = "Système Windows détecté";
    if (osDetailText) osDetailText.textContent = "Microsoft Windows 10/11";
  } else {
    if (osIcon) osIcon.textContent = "💻";
    if (osNameLabel) osNameLabel.textContent = "Système détecté";
  }

  let testAudioStream = null;
  let testAudioCtx = null;
  let testAudioAnalyser = null;
  let testAudioInterval = null;
  let testAudioMaxAmplitude = 0;
  let testAudioStartTime = 0;

  const btnTestMic = document.getElementById("btn-test-mic");
  const micStatusText = document.getElementById("mic-status-text");
  const waveformBars = document.querySelectorAll("#mic-visualizer .mvs-waveform-bar");

  function definirContenuBoutonMicro(btn, icone, texte) {
    if (!btn) return;
    const spanIcone = document.createElement("span");
    spanIcone.className = "mvs-btn-icon-symbol";
    spanIcone.setAttribute("aria-hidden", "true");
    spanIcone.textContent = icone;
    const spanTexte = document.createElement("span");
    spanTexte.textContent = texte;
    btn.replaceChildren(spanIcone, spanTexte);
  }

  function definirStatutMicro(element, titre, sousTitre, couleur) {
    if (!element) return;
    element.replaceChildren();
    if (titre) {
      const s = document.createElement("strong");
      if (couleur) s.style.color = couleur;
      s.textContent = titre;
      element.appendChild(s);
    }
    if (sousTitre) {
      if (titre) element.appendChild(document.createElement("br"));
      const span = document.createElement("span");
      span.textContent = sousTitre;
      element.appendChild(span);
    }
  }

  function arreterTestMicro() {
    if (testAudioInterval) {
      clearInterval(testAudioInterval);
      testAudioInterval = null;
    }
    if (testAudioStream) {
      testAudioStream.getTracks().forEach((track) => track.stop());
      testAudioStream = null;
    }
    if (testAudioCtx && testAudioCtx.state !== "closed") {
      testAudioCtx.close().catch(() => {});
      testAudioCtx = null;
    }
    waveformBars.forEach((bar) => {
      bar.style.height = "6px";
    });
    if (btnTestMic) {
      definirContenuBoutonMicro(btnTestMic, "🎙️", t("btnTestMic") || "Tester le microphone");
      btnTestMic.classList.remove("mvs-btn-secondary");
      btnTestMic.classList.add("mvs-btn-primary");
    }
  }

  let testDemarrageEnCours = false;
  async function demarrerTestMicro() {
    if (testDemarrageEnCours) return;
    if (testAudioStream) {
      arreterTestMicro();
      if (micStatusText) micStatusText.textContent = t("micStatusIdle") || "Test terminé. Cliquez pour relancer.";
      return;
    }

    testDemarrageEnCours = true;
    if (micStatusText) micStatusText.textContent = "Demande d'autorisation du microphone dans Firefox…";
    testAudioMaxAmplitude = 0;
    testAudioStartTime = Date.now();

    try {
      testAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      testAudioCtx = new AudioCtxClass();
      if (testAudioCtx.state === "suspended") {
        await testAudioCtx.resume();
      }

      const sourceNode = testAudioCtx.createMediaStreamSource(testAudioStream);
      testAudioAnalyser = testAudioCtx.createAnalyser();
      testAudioAnalyser.fftSize = 64;
      sourceNode.connect(testAudioAnalyser);

      const freqData = new Uint8Array(testAudioAnalyser.frequencyBinCount);

      if (btnTestMic) {
        definirContenuBoutonMicro(btnTestMic, "⏹️", "Arrêter le test");
        btnTestMic.classList.remove("mvs-btn-primary");
        btnTestMic.classList.add("mvs-btn-secondary");
      }
      if (micStatusText) micStatusText.textContent = "Parlez dans votre micro : les barres doivent réagir !";

      testAudioInterval = setInterval(() => {
        if (!testAudioAnalyser) return;
        testAudioAnalyser.getByteFrequencyData(freqData);

        let total = 0;
        for (let i = 0; i < freqData.length; i++) total += freqData[i];
        const moyenne = total / freqData.length;
        if (moyenne > testAudioMaxAmplitude) {
          testAudioMaxAmplitude = moyenne;
        }

        waveformBars.forEach((bar, idx) => {
          const val = freqData[idx * 2] || moyenne;
          const h = Math.max(6, Math.min(42, Math.round((val / 255) * 44)));
          bar.style.height = `${h}px`;
        });

        const ecoule = Date.now() - testAudioStartTime;
        if (ecoule > 1800) {
          if (testAudioMaxAmplitude < 1.5) {
            definirStatutMicro(
              micStatusText,
              "⚠️ Faible niveau audio capté.",
              "Vérifiez que votre microphone n'est pas coupé ou en sourdine.",
              "#f59e0b"
            );
          } else {
            definirStatutMicro(
              micStatusText,
              "Microphone parfaitement opérationnel ✓",
              "Signal audio capté avec succès dans Firefox !",
              "#10b981"
            );
          }
        }
      }, 70);
    } catch (err) {
      if (DEBUG) console.warn("[Setup] Erreur test micro :", err);
      definirStatutMicro(
        micStatusText,
        "Impossible d'accéder au microphone.",
        "Vérifiez l'autorisation dans la barre d'adresse de Firefox (icône cadenas/micro).",
        "#ef4444"
      );
      arreterTestMicro();
    } finally {
      testDemarrageEnCours = false;
    }
  }

  if (btnTestMic) {
    btnTestMic.addEventListener("click", demarrerTestMicro);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ═════════════════════════════════════════════════════════════════════════
  // 3. ÉTAPE 2 : CONFIGURATION DU FOURNISSEUR & TEST DE CONNEXION API
  // ═════════════════════════════════════════════════════════════════════════

  const selectProvider = document.getElementById("setup-select-provider");
  const panelMistral = document.getElementById("setup-panel-mistral");
  const panelGemini = document.getElementById("setup-panel-gemini");
  const panelLocal = document.getElementById("setup-panel-local");

  const inputMistralKey = document.getElementById("setup-mistral-key");
  const btnToggleMistralKey = document.getElementById("btn-toggle-setup-mistral-key");
  const inputGeminiKey = document.getElementById("setup-gemini-key");
  const btnToggleGeminiKey = document.getElementById("btn-toggle-setup-gemini-key");
  const inputLocalUrl = document.getElementById("setup-local-url");

  const switchCaretGem = document.getElementById("setup-caret-gem-enabled");
  const btnTestApi = document.getElementById("btn-test-api");
  const apiTestStatus = document.getElementById("api-test-status");

  function construireConfigActive() {
    const provider = selectProvider ? selectProvider.value : "gemini";
    const config = {
      provider
    };

    if (provider === "gemini") {
      config.geminiApiKey = inputGeminiKey ? inputGeminiKey.value.trim() : "";
      config.geminiModel = "gemini-3.5-transcribe";
    } else if (provider === "mistral") {
      config.mistralApiKey = inputMistralKey ? inputMistralKey.value.trim() : "";
      config.mistralModel = "voxtral-mini-latest";
    } else if (provider === "local") {
      config.localSttUrl = inputLocalUrl ? inputLocalUrl.value.trim() : "http://localhost:8000";
      config.localSttModel = "whisper-1";
      config.localApiKey = "";
    }
    return config;
  }

  if (btnToggleMistralKey && inputMistralKey) {
    btnToggleMistralKey.addEventListener("click", () => {
      const estMasque = inputMistralKey.type === "password";
      inputMistralKey.type = estMasque ? "text" : "password";
      btnToggleMistralKey.setAttribute("aria-pressed", estMasque ? "true" : "false");
    });
  }

  if (btnToggleGeminiKey && inputGeminiKey) {
    btnToggleGeminiKey.addEventListener("click", () => {
      const estMasque = inputGeminiKey.type === "password";
      inputGeminiKey.type = estMasque ? "text" : "password";
      btnToggleGeminiKey.setAttribute("aria-pressed", estMasque ? "true" : "false");
    });
  }

  function actualiserAffichageFournisseur() {
    const val = selectProvider ? selectProvider.value : "gemini";
    if (panelGemini) panelGemini.classList.toggle("mvs-hidden", val !== "gemini");
    if (panelMistral) panelMistral.classList.toggle("mvs-hidden", val !== "mistral");
    if (panelLocal) panelLocal.classList.toggle("mvs-hidden", val !== "local");

    if (apiTestStatus) {
      apiTestStatus.textContent = "";
      apiTestStatus.className = "mvs-api-status";
    }
  }

  if (selectProvider) {
    selectProvider.addEventListener("change", actualiserAffichageFournisseur);
  }

  try {
    const configExistante = await api.storage.local.get([
      "provider",
      "mistralApiKey",
      "geminiApiKey",
      "localSttUrl",
      "caretGemEnabled"
    ]);

    if (configExistante.provider && selectProvider) {
      selectProvider.value = configExistante.provider;
    }
    if (configExistante.mistralApiKey && inputMistralKey) {
      inputMistralKey.value = configExistante.mistralApiKey;
    }
    if (configExistante.geminiApiKey && inputGeminiKey) {
      inputGeminiKey.value = configExistante.geminiApiKey;
    }
    if (configExistante.localSttUrl && inputLocalUrl) {
      inputLocalUrl.value = configExistante.localSttUrl;
    }
    if (typeof configExistante.caretGemEnabled === "boolean" && switchCaretGem) {
      switchCaretGem.checked = configExistante.caretGemEnabled;
    }
    actualiserAffichageFournisseur();
  } catch (errStockage) {
    if (DEBUG) console.warn("[Setup] Impossible de lire le storage :", errStockage);
  }

  if (btnTestApi) {
    btnTestApi.addEventListener("click", async () => {
      if (apiTestStatus) {
        apiTestStatus.textContent = "Vérification en cours…";
        apiTestStatus.className = "mvs-api-status";
      }

      const configTest = construireConfigActive("gemini-3.5-transcribe-live");

      try {
        let res;
        if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
          res = await api.runtime.sendMessage({ action: "testProvider", config: configTest });
        } else if (globalThis.MVSProviders) {
          res = await globalThis.MVSProviders.testerConnexion(configTest);
        }

        if (res && res.success) {
          if (apiTestStatus) {
            apiTestStatus.textContent = "Connexion réussie ✓ Prêt à l'emploi";
            apiTestStatus.className = "mvs-api-status success";
          }
        } else {
          const detail = res && res.message ? res.message : "Vérifiez votre clé d'API";
          if (apiTestStatus) {
            apiTestStatus.textContent = `Échec de connexion : ${detail}`;
            apiTestStatus.className = "mvs-api-status error";
          }
        }
      } catch (errApi) {
        if (apiTestStatus) {
          apiTestStatus.textContent = `Erreur réseau : ${errApi.message || "Impossible de joindre le service"}`;
          apiTestStatus.className = "mvs-api-status error";
        }
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. ÉTAPE 4 : BAC À SABLE INTERACTIF (ESSAYEZ LA MAGIE EN DIRECT !)
  // ═════════════════════════════════════════════════════════════════════════

  let demoAudioStream = null;
  let demoAudioCtx = null;
  let demoAudioAnalyser = null;
  let demoAudioInterval = null;
  let demoMediaRecorder = null;
  let demoAudioChunks = [];
  let demoIsRecording = false;

  const btnDemoRecord = document.getElementById("btn-demo-record");
  const demoStatusText = document.getElementById("demo-status-text");
  const demoResultBox = document.getElementById("demo-result-box");
  const demoResultContent = document.getElementById("demo-result-content");
  const demoWaveformBars = document.querySelectorAll("#demo-visualizer .mvs-waveform-bar");

  function arreterEnregistrementDemo(annuler = false) {
    demoIsRecording = false;
    if (demoAudioInterval) {
      clearInterval(demoAudioInterval);
      demoAudioInterval = null;
    }
    if (demoMediaRecorder && demoMediaRecorder.state !== "inactive") {
      try {
        demoMediaRecorder.stop();
      } catch {}
    }
    if (demoAudioStream) {
      demoAudioStream.getTracks().forEach((track) => track.stop());
      demoAudioStream = null;
    }
    if (demoAudioCtx && demoAudioCtx.state !== "closed") {
      demoAudioCtx.close().catch(() => {});
      demoAudioCtx = null;
    }
    demoWaveformBars.forEach((bar) => {
      bar.style.height = "6px";
    });
    demoAudioChunks = [];

    if (btnDemoRecord) {
      btnDemoRecord.disabled = false;
      btnDemoRecord.classList.remove("mvs-btn-secondary");
      btnDemoRecord.classList.add("mvs-btn-primary");
      definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
    }

    if (annuler && demoStatusText) {
      demoStatusText.textContent = t("demoStatusIdle") || "Cliquez sur « Lire la phrase » et parlez à voix haute.";
    }
  }

  let demoDemarrageEnCours = false;
  async function demarrerEnregistrementDemo() {
    if (demoDemarrageEnCours) return;
    if (demoIsRecording) {
      if (demoStatusText) {
        demoStatusText.textContent = t("demoStatusProcessing") || "Nettoyage sémantique en cours… ✨";
      }
      if (btnDemoRecord) {
        btnDemoRecord.disabled = true;
        definirContenuBoutonMicro(btnDemoRecord, "⏳", "Traitement IA en cours…");
      }

      demoIsRecording = false;
      if (demoAudioInterval) {
        clearInterval(demoAudioInterval);
        demoAudioInterval = null;
      }
      demoWaveformBars.forEach((bar) => {
        bar.style.height = "6px";
      });

      if (demoMediaRecorder && demoMediaRecorder.state === "recording") {
        demoMediaRecorder.addEventListener("stop", async () => {
          await traiterAudioDemo();
        }, { once: true });
        try {
          demoMediaRecorder.stop();
        } catch {
          await traiterAudioDemo();
        }
      } else {
        await traiterAudioDemo();
      }
      return;
    }

    demoDemarrageEnCours = true;
    if (demoResultBox) demoResultBox.classList.add("mvs-hidden");
    if (demoResultContent) demoResultContent.textContent = "";
    demoAudioChunks = [];

    try {
      demoAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      demoAudioCtx = new AudioCtxClass();
      if (demoAudioCtx.state === "suspended") {
        await demoAudioCtx.resume();
      }

      const sourceNode = demoAudioCtx.createMediaStreamSource(demoAudioStream);
      demoAudioAnalyser = demoAudioCtx.createAnalyser();
      demoAudioAnalyser.fftSize = 64;
      sourceNode.connect(demoAudioAnalyser);

      const freqData = new Uint8Array(demoAudioAnalyser.frequencyBinCount);

      demoAudioInterval = setInterval(() => {
        if (!demoAudioAnalyser) return;
        demoAudioAnalyser.getByteFrequencyData(freqData);
        let total = 0;
        for (let i = 0; i < freqData.length; i++) total += freqData[i];
        const moyenne = total / freqData.length;

        demoWaveformBars.forEach((bar, idx) => {
          const val = freqData[idx * 2] || moyenne;
          const h = Math.max(6, Math.min(42, Math.round((val / 255) * 44)));
          bar.style.height = `${h}px`;
        });
      }, 70);

      let mime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mime = "audio/webm";
        }
      }

      demoMediaRecorder = new MediaRecorder(demoAudioStream, { mimeType: mime });
      demoMediaRecorder.onerror = (e) => {
        if (DEBUG) console.warn("[Setup] Erreur MediaRecorder démo :", e);
        arreterEnregistrementDemo(true);
      };
      demoMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          demoAudioChunks.push(e.data);
        }
      };
      demoMediaRecorder.start(250);

      demoIsRecording = true;
      if (btnDemoRecord) {
        btnDemoRecord.classList.remove("mvs-btn-primary");
        btnDemoRecord.classList.add("mvs-btn-secondary");
        definirContenuBoutonMicro(btnDemoRecord, "⏹️", t("btnDemoStop") || "Arrêter et voir le résultat");
      }
      if (demoStatusText) {
        demoStatusText.textContent = t("demoStatusRecording") || "Enregistrement en cours… Lisez la phrase à voix haute.";
      }
    } catch (errDemoMic) {
      if (DEBUG) console.warn("[Setup] Erreur micro démo :", errDemoMic);
      arreterEnregistrementDemo(true);
      if (demoStatusText) {
        demoStatusText.textContent = "Impossible d'accéder au micro. Veuillez vérifier vos autorisations à l'étape 1.";
      }
    } finally {
      demoDemarrageEnCours = false;
    }
  }

  async function traiterAudioDemo() {
    if (demoAudioStream) {
      demoAudioStream.getTracks().forEach((track) => track.stop());
      demoAudioStream = null;
    }
    if (demoAudioCtx && demoAudioCtx.state !== "closed") {
      demoAudioCtx.close().catch(() => {});
      demoAudioCtx = null;
    }

    const mime = (demoMediaRecorder && demoMediaRecorder.mimeType) || "audio/webm";
    const blobFinal = new Blob(demoAudioChunks, { type: mime });

    if (blobFinal.size < 200) {
      demoAudioChunks = [];
      if (demoStatusText) {
        demoStatusText.textContent = "Aucun son suffisant capté. Réessayez en parlant bien distinctement.";
      }
      if (btnDemoRecord) {
        btnDemoRecord.disabled = false;
        definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
        btnDemoRecord.classList.remove("mvs-btn-secondary");
        btnDemoRecord.classList.add("mvs-btn-primary");
      }
      return;
    }

    try {
      const base64Audio = await blobVersBase64(blobFinal);
      const configDemo = construireConfigActive();

      let resultat;
      if (globalThis.MVSProviders) {
        resultat = await globalThis.MVSProviders.transcrire(
          configDemo,
          base64Audio,
          blobFinal.type || "audio/webm",
          "natural"
        );
      }

      if (etapeCourante !== 4) return;

      if (resultat && resultat.text && resultat.text.trim()) {
        if (demoResultContent) {
          demoResultContent.textContent = resultat.text.trim();
        }
        if (demoResultBox) {
          demoResultBox.classList.remove("mvs-hidden");
        }
        if (demoStatusText) {
          demoStatusText.textContent = "Transcription et nettoyage sémantique réussis ✓";
        }
      } else {
        if (demoStatusText) {
          demoStatusText.textContent = "Le moteur n'a retourné aucun texte. Vérifiez votre clé API à l'étape 2.";
        }
      }
    } catch (errTranscription) {
      if (DEBUG) console.warn("[Setup] Erreur transcription démo :", errTranscription);
      if (etapeCourante === 4 && demoStatusText) {
        const msg = errTranscription && errTranscription.message ? errTranscription.message : "Erreur réseau";
        demoStatusText.textContent = `Échec de transcription : ${msg}. Vérifiez votre clé d'API.`;
      }
    } finally {
      demoAudioChunks = [];
      if (btnDemoRecord) {
        btnDemoRecord.disabled = false;
        definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
        btnDemoRecord.classList.remove("mvs-btn-secondary");
        btnDemoRecord.classList.add("mvs-btn-primary");
      }
    }
  }

  if (btnDemoRecord) {
    btnDemoRecord.addEventListener("click", demarrerEnregistrementDemo);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. ÉTAPE 5 : FINALISATION & SAUVEGARDE GLOBALE
  // ═════════════════════════════════════════════════════════════════════════

  const btnFinish = document.getElementById("btn-finish-setup");
  if (btnFinish) {
    btnFinish.addEventListener("click", async () => {
      btnFinish.disabled = true;
      btnFinish.textContent = "Enregistrement en cours…";

      const configSauvegarde = {
        ...construireConfigActive(),
        caretGemEnabled: switchCaretGem ? switchCaretGem.checked : false
      };

      try {
        await api.storage.local.set(configSauvegarde);
        btnFinish.textContent = "Configuration enregistrée ✓";

        setTimeout(async () => {
          try {
            if (api && api.tabs && typeof api.tabs.getCurrent === "function") {
              const ongletActuel = await api.tabs.getCurrent();
              if (ongletActuel && ongletActuel.id) {
                await api.tabs.remove(ongletActuel.id);
                return;
              }
            }
          } catch {
            /* Fallback */
          }
          window.close();
        }, 800);
      } catch (errSave) {
        btnFinish.disabled = false;
        btnFinish.textContent = "Erreur lors de la sauvegarde";
        if (DEBUG) console.error("[Setup] Erreur de sauvegarde :", errSave);
      }
    });
  }
});
