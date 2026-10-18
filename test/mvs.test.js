/**
 * Magic Voice Scriber — Suite de Tests Unitaires et d'Intégrité
 * ═════════════════════════════════════════════════════════════
 *
 * Vérifie :
 *   1. L'orchestrateur MVSProviders (Gemini 3.5 Transcribe REST/Live SMART, OpenAI/Mistral, Local Ollama/Whisper)
 *   2. Les 3 modes de voix (natural, pro, bullets) et le nettoyage des réponses
 *   3. La parité stricte des 6 locales (en, fr, es, pt, de, vi) et la couverture de tous les attributs data-i18n*
 *   4. La conformité de sécurité (Zéro innerHTML, eval, alert, DEBUG = true)
 */

"use strict";

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../mvs-providers.js");
const MVSProviders = globalThis.MVSProviders;

const RACINE = path.resolve(__dirname, "..");

describe("1. MVSProviders — Utilitaires & Modes de Voix", () => {
  it("expose les 3 modes de voix (natural, pro, bullets) et génère des prompts distincts", () => {
    const pNatural = MVSProviders.construirePromptSysteme("natural");
    const pPro = MVSProviders.construirePromptSysteme("pro");
    const pBullets = MVSProviders.construirePromptSysteme("bullets");

    assert.ok(pNatural.includes("exact vocabulary"));
    assert.ok(pPro.includes("professional email"));
    assert.ok(pBullets.includes("bulleted list"));
  });

  it("nettoie les blocs markdown et guillemets parasites dans nettoyerReponseLLM", () => {
    assert.equal(MVSProviders.nettoyerReponseLLM("```text\nBonjour à tous.\n```"), "Bonjour à tous.");
    assert.equal(MVSProviders.nettoyerReponseLLM('"Rendez-vous demain à 14h."'), "Rendez-vous demain à 14h.");
    assert.equal(MVSProviders.nettoyerReponseLLM("« Texte propre »"), "Texte propre");
  });

  it("normalise correctement les endpoints STT et Chat OpenAI", () => {
    assert.equal(
      MVSProviders.construireEndpointSTT("https://api.openai.com"),
      "https://api.openai.com/v1/audio/transcriptions"
    );
    assert.equal(
      MVSProviders.construireEndpointSTT("http://localhost:8000/v1/"),
      "http://localhost:8000/v1/audio/transcriptions"
    );
    assert.equal(
      MVSProviders.construireEndpointChat("https://api.mistral.ai"),
      "https://api.mistral.ai/v1/chat/completions"
    );
    assert.equal(
      MVSProviders.construireEndpointChat("http://localhost:11434/v1"),
      "http://localhost:11434/v1/chat/completions"
    );
  });

  it("calcule des patterns d'origine WebExtension valides sans numéro de port", () => {
    assert.equal(
      MVSProviders.obtenirPatternOrigine("mistral"),
      "https://api.mistral.ai/*"
    );
    assert.equal(
      MVSProviders.obtenirPatternOrigine("gemini"),
      "https://generativelanguage.googleapis.com/*"
    );
    assert.equal(
      MVSProviders.obtenirPatternOrigine("openai", { openaiPreset: "mistral" }),
      "https://api.mistral.ai/*"
    );
    assert.equal(
      MVSProviders.obtenirPatternOrigine("local", { localLlmUrl: "http://localhost:11434" }),
      "http://localhost/*"
    );
  });

  it("valide estConfigure pour le Trio (Gemini par défaut, Mistral, Local)", () => {
    assert.equal(MVSProviders.estConfigure({ geminiApiKey: "AIzaKey" }), true);
    assert.equal(MVSProviders.estConfigure({}), false);
    assert.equal(MVSProviders.estConfigure({ provider: "gemini", geminiApiKey: "AIzaKey" }), true);
    assert.equal(MVSProviders.estConfigure({ provider: "gemini", geminiApiKey: "" }), false);
    assert.equal(MVSProviders.estConfigure({ provider: "mistral", mistralApiKey: "key" }), true);
    assert.equal(MVSProviders.estConfigure({ provider: "mistral", mistralApiKey: "" }), false);
    assert.equal(MVSProviders.estConfigure({ provider: "local", localSttUrl: "http://localhost:8000" }), true);
    assert.equal(MVSProviders.estConfigure({ provider: "local", localSttUrl: "" }), false);
  });

  it("construit la configuration WebSocket Gemini 3.5 Transcribe Live (v1beta) en mode SMART sans systemInstruction", () => {
    const urlWs = MVSProviders.obtenirUrlWebSocketGeminiLive("CLE_TEST");
    assert.ok(urlWs.startsWith("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta."));
    assert.ok(urlWs.includes("key=CLE_TEST"));

    const setup = MVSProviders.construireSetupGeminiLive();
    assert.equal(setup.setup.model, "models/gemini-3.5-transcribe-live");
    assert.equal(setup.setup.inputAudioTranscription.mode, "SMART");
    assert.equal(setup.setup.realtimeInputConfig.automaticActivityDetection.disabled, true);
    assert.equal(setup.setup.systemInstruction, undefined);
  });

  it("concatène proprement les segments de dictée en direct dans assemblerSegmentsLive", () => {
    assert.equal(MVSProviders.assemblerSegmentsLive("", "Bonjour"), "Bonjour");
    assert.equal(MVSProviders.assemblerSegmentsLive("Bonjour", ""), "Bonjour");
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Bonjour", "tout le monde"),
      "Bonjour tout le monde"
    );
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Bonjour", ", comment allez-vous ?"),
      "Bonjour, comment allez-vous ?"
    );
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Test", ". Suite de phrase"),
      "Test. Suite de phrase"
    );
  });

  it("gère les retours cumulatifs et incrémentaux sans duplication dans fusionnerSegmentFinal", () => {
    // 1. Initialisation
    assert.equal(MVSProviders.fusionnerSegmentFinal("", "Bonjour Fred"), "Bonjour Fred");
    assert.equal(MVSProviders.fusionnerSegmentFinal("Bonjour Fred", ""), "Bonjour Fred");

    // 2. Mode cumulatif de l'API (le nouveau segment englobe le texte précédent)
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour", "Bonjour Fred, voici les documents."),
      "Bonjour Fred, voici les documents."
    );

    // 3. Écho tardif ou redite (le segment est déjà présent à la fin de la base)
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred, voici les documents.", "documents."),
      "Bonjour Fred, voici les documents."
    );

    // 4. Incrémental pur avec espace ou ponctuation
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred", "voici les documents."),
      "Bonjour Fred voici les documents."
    );
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred", ", voici les documents."),
      "Bonjour Fred, voici les documents."
    );
  });
});

describe("2. MVSProviders — Pipelines Gemini, OpenAI/Mistral & Local (Mock Fetch)", () => {
  it("exécute le pipeline Gemini 3.5 Transcribe en une passe avec mode SMART (sans prompt texte ni temperature)", async () => {
    const fetchOriginal = globalThis.fetch;
    let urlAppelee = "";
    let corpsEnvoye = null;

    globalThis.fetch = async (url, options) => {
      urlAppelee = url;
      corpsEnvoye = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: "Bonjour, voici le rapport final." }]
                }
              }
            ]
          };
        }
      };
    };

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/webm",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Bonjour, voici le rapport final.");
      assert.ok(urlAppelee.includes("models/gemini-3.5-transcribe:generateContent"));
      assert.equal(corpsEnvoye.generationConfig.audioTranscriptionConfig.mode, "SMART");
      assert.equal(corpsEnvoye.generationConfig.temperature, undefined);
      assert.equal(corpsEnvoye.contents[0].parts.length, 1);
      assert.ok(corpsEnvoye.contents[0].parts[0].inlineData);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("parse correctement le format ASR dédié de gemini-3.5-transcribe (part.audioTranscription.text)", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    audioTranscription: {
                      text: "Bonjour, ceci est un test de dictée vocale."
                    }
                  }
                ],
                role: "model"
              },
              finishReason: "STOP",
              index: 0
            }
          ]
        };
      }
    });

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Bonjour, ceci est un test de dictée vocale.");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("gère gracieusement le silence sans jeter de fausse erreur SERVICE_UNAVAILABLE (finishReason STOP sans content)", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              finishReason: "STOP",
              index: 0
            }
          ]
        };
      }
    });

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("exécute le pipeline en 2 étapes (STT Whisper + LLM Mistral/OpenAI)", async () => {
    const fetchOriginal = globalThis.fetch;
    const appels = [];

    globalThis.fetch = async (url) => {
      appels.push(url);
      if (url.includes("/audio/transcriptions")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { text: "euh je veux envoyer trois non quatre pommes" };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: { content: "Je veux envoyer quatre pommes." }
              }
            ]
          };
        }
      };
    };

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "openai",
          openaiPreset: "mistral",
          sttBaseUrl: "https://api.groq.com/openai",
          sttApiKey: "gsk_test",
          sttModel: "whisper-large-v3-turbo",
          llmBaseUrl: "https://api.mistral.ai",
          llmApiKey: "mistral_test",
          llmModel: "mistral-small-latest"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/webm",
        "pro"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Je veux envoyer quatre pommes.");
      assert.equal(appels.length, 2);
      assert.ok(appels[0].includes("/audio/transcriptions"));
      assert.ok(appels[1].includes("/chat/completions"));
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("garantit l'absence de ?key= dans l'URL Gemini et transmet la clé par en-tête x-goog-api-key", async () => {
    const fetchOriginal = globalThis.fetch;
    let urlRequete = "";
    let headersRequete = null;

    globalThis.fetch = async (url, options) => {
      urlRequete = url;
      headersRequete = options && options.headers;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ audioTranscription: { text: "Texte test" } }],
                  role: "model"
                },
                finishReason: "STOP",
                index: 0
              }
            ]
          };
        }
      };
    };

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaSecretKey123",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );

      assert.equal(res.success, true);
      assert.ok(!urlRequete.includes("?key="), "L'URL ne doit jamais contenir ?key=");
      assert.equal(headersRequete["x-goog-api-key"], "AIzaSecretKey123");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("isole strictement les clés STT et LLM en présence d'origines différentes (sécurité cross-domain)", async () => {
    const fetchOriginal = globalThis.fetch;
    const authHeaders = [];

    globalThis.fetch = async (url, options) => {
      authHeaders.push({ url, auth: options && options.headers && options.headers.Authorization });
      if (url.includes("/audio/transcriptions")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { text: "texte brut" };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: "Texte final." } }] };
        }
      };
    };

    try {
      await MVSProviders.transcrire(
        {
          provider: "openai",
          sttBaseUrl: "https://stt.example.com",
          sttApiKey: "key-stt-only",
          sttModel: "whisper-1",
          llmBaseUrl: "https://llm.other-domain.com",
          llmApiKey: "key-llm-only",
          llmModel: "gpt-4o-mini"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/webm",
        "pro"
      );

      assert.equal(authHeaders[0].auth, "Bearer key-stt-only");
      assert.equal(authHeaders[1].auth, "Bearer key-llm-only");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("exécute le pipeline Mistral Voxtral (obtention de session realtime et transcription REST)", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async (url) => {
      if (url.includes("/v1/client/sessions")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              client_secret: "rt_test_token_123",
              purpose: "realtime"
            };
          }
        };
      }
      if (url.includes("/v1/audio/transcriptions")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              text: "Bonjour, ceci est une dictée Mistral Voxtral."
            };
          }
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      const token = await MVSProviders.FournisseurMistral.obtenirSessionRealtime("CLE_MISTRAL");
      assert.equal(token, "rt_test_token_123");

      // 2. URL WebSocket
      const wsUrl = MVSProviders.FournisseurMistral.obtenirUrlWebSocketRealtime("rt_test_token_123");
      assert.ok(wsUrl.includes("wss://api.mistral.ai/v1/audio/transcriptions/realtime"));
      assert.ok(wsUrl.includes("client_secret=rt_test_token_123"));

      // 3. Transcription REST
      const res = await MVSProviders.transcrire(
        {
          provider: "mistral",
          mistralApiKey: "CLE_MISTRAL"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );
      assert.equal(res.success, true);
      assert.equal(res.text, "Bonjour, ceci est une dictée Mistral Voxtral.");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("valide la méthode testerConnexion pour Mistral, Gemini, OpenAI et Local", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async (url) => {
      if (url.includes("api.mistral.ai")) {
        return { ok: true, status: 200, async json() { return { client_secret: "rt_123" }; } };
      }
      if (url.includes("googleapis.com")) {
        return { ok: true, status: 200, async json() { return { models: [] }; } };
      }
      if (url.includes("openai.com") || url.includes("localhost")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { choices: [{ message: { content: "Bonjour, test de connexion." } }] };
          }
        };
      }
      return { ok: true, status: 200, async json() { return {}; } };
    };

    try {
      const resMistral = await MVSProviders.testerConnexion({
        provider: "mistral",
        mistralApiKey: "mis_test_key"
      });
      assert.equal(resMistral.success, true);

      const resGemini = await MVSProviders.testerConnexion({
        provider: "gemini",
        geminiApiKey: "AIzaTestKey"
      });
      assert.equal(resGemini.success, true);

      const resOpenai = await MVSProviders.testerConnexion({
        provider: "openai",
        llmApiKey: "sk-test",
        sttApiKey: "sk-test",
        llmBaseUrl: "https://api.openai.com",
        sttBaseUrl: "https://api.openai.com"
      });
      assert.equal(resOpenai.success, true);

      const resLocal = await MVSProviders.testerConnexion({
        provider: "local",
        localSttUrl: "http://localhost:8000"
      });
      assert.equal(resLocal.success, true);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

describe("3. Internationalisation (Parité des 6 langues & Zéro texte en dur)", () => {
  const LOCALES = ["en", "fr", "es", "pt", "de", "vi"];

  it("possède exactement les mêmes clés dans les 6 locales et aucune chaîne vide", () => {
    const dicEn = JSON.parse(
      fs.readFileSync(path.join(RACINE, "_locales/en/messages.json"), "utf8")
    );
    const clesRef = Object.keys(dicEn).sort();
    assert.ok(clesRef.length >= 60, "Le dictionnaire de référence doit être complet");

    for (const code of LOCALES) {
      const chemin = path.join(RACINE, `_locales/${code}/messages.json`);
      assert.ok(fs.existsSync(chemin), `Fichier manquant pour la locale ${code}`);
      const dic = JSON.parse(fs.readFileSync(chemin, "utf8"));
      const cles = Object.keys(dic).sort();

      assert.deepEqual(cles, clesRef, `Parité des clés rompue dans la locale '${code}'`);

      for (const cle of cles) {
        assert.ok(
          dic[cle] && typeof dic[cle].message === "string" && dic[cle].message.trim().length > 0,
          `Message vide pour la clé '${cle}' dans la locale '${code}'`
        );
      }
    }
  });

  it("couvre tous les attributs data-i18n* utilisés dans options.html, popup.html et setup.html", () => {
    const dicEn = JSON.parse(
      fs.readFileSync(path.join(RACINE, "_locales/en/messages.json"), "utf8")
    );
    const fichiersHtml = [
      path.join(RACINE, "options/options.html"),
      path.join(RACINE, "popup/popup.html"),
      path.join(RACINE, "setup/setup.html")
    ];

    const regexAttr = /data-i18n(?:-[a-z-]+)?="([^"]+)"/g;
    for (const fichier of fichiersHtml) {
      const contenu = fs.readFileSync(fichier, "utf8");
      let match;
      while ((match = regexAttr.exec(contenu)) !== null) {
        const cle = match[1];
        assert.ok(
          Object.prototype.hasOwnProperty.call(dicEn, cle),
          `Clé i18n '${cle}' référencée dans ${path.basename(fichier)} mais absente de messages.json`
        );
      }
    }
  });
});

describe("4. Sécurité DOM, CSP & Garde-fou DEBUG (Règles 11, 12, 14)", () => {
  const fichiersJs = [
    "background.js",
    "mvs-providers.js",
    "content/content-injected.js",
    "popup/popup.js",
    "setup/setup.js",
    "options/options.js"
  ];

  it("n'utilise jamais innerHTML, outerHTML, insertAdjacentHTML, eval, alert, confirm ou prompt", () => {
    const patternsInterdits = [
      /\.\s*innerHTML\b/,
      /\.\s*outerHTML\b/,
      /\.\s*insertAdjacentHTML\b/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
      /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/
    ];

    for (const rel of fichiersJs) {
      const src = fs.readFileSync(path.join(RACINE, rel), "utf8");
      for (const regex of patternsInterdits) {
        assert.equal(
          regex.test(src),
          false,
          `Pattern interdit ${regex} détecté dans ${rel}`
        );
      }
    }
  });

  it("maintient DEBUG = false dans tous les scripts", () => {
    const regexDebugTrue = /(?:const|let|var)?\s*DEBUG\s*=\s*true/;
    for (const rel of fichiersJs) {
      const src = fs.readFileSync(path.join(RACINE, rel), "utf8");
      assert.equal(
        regexDebugTrue.test(src),
        false,
        `DEBUG = true détecté dans ${rel}`
      );
    }
  });
});

describe("5. Injection Universelle, Éligibilité des Champs & Résilience Clavier", () => {
  // Mock léger d'environnement DOM pour tester content-injected.js
  const mockDocument = {
    activeElement: null,
    location: { hostname: "example.com" },
    querySelector: () => null,
    addEventListener: () => {},
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {}
    })
  };

  class MockHTMLElement {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = attributes;
      this.disabled = Boolean(attributes.disabled);
      this.readOnly = Boolean(attributes.readonly);
      this.value = attributes.value || "";
      this.selectionStart = attributes.selectionStart ?? this.value.length;
      this.selectionEnd = attributes.selectionEnd ?? this.selectionStart;
      this.isContentEditable = Boolean(attributes.isContentEditable);
      this.dispatchedEvents = [];
    }

    getAttribute(nom) {
      return this.attributes[nom] || null;
    }

    closest(selecteur) {
      if (this.attributes.inDisabledFieldset && selecteur === "fieldset:disabled") {
        return {};
      }
      return null;
    }

    focus() {}

    dispatchEvent(ev) {
      this.dispatchedEvents.push(ev);
      return true;
    }
  }

  // Configuration de l'environnement global simulé
  const globalDocOriginal = globalThis.document;
  const globalWinOriginal = globalThis.window;
  const globalHTMLInputElementOriginal = globalThis.HTMLInputElement;
  const globalHTMLTextAreaElementOriginal = globalThis.HTMLTextAreaElement;
  const globalInputEventOriginal = globalThis.InputEvent;
  const globalEventOriginal = globalThis.Event;

  globalThis.window = {
    location: { hostname: "example.com" },
    addEventListener: () => {},
    innerWidth: 1024,
    innerHeight: 768
  };
  globalThis.document = mockDocument;
  globalThis.HTMLElement = MockHTMLElement;
  globalThis.HTMLInputElement = class extends MockHTMLElement {};
  globalThis.HTMLTextAreaElement = class extends MockHTMLElement {};
  globalThis.InputEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.data = init.data;
      this.inputType = init.inputType;
      this.bubbles = Boolean(init.bubbles);
    }
  };
  globalThis.Event = class {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = Boolean(init.bubbles);
    }
  };

  const contentModule = require("../content/content-injected.js");

  it("exclut strictement les champs de mot de passe, readonly, disabled et fieldset désactivé", () => {
    const inputPwd = new globalThis.HTMLInputElement("input", { type: "password" });
    const inputReadonly = new globalThis.HTMLInputElement("input", { type: "text", readonly: true });
    const inputDisabled = new globalThis.HTMLInputElement("input", { type: "text", disabled: true });
    const inputInFieldset = new globalThis.HTMLInputElement("input", { type: "text", inDisabledFieldset: true });
    const divAriaReadonly = new MockHTMLElement("div", { isContentEditable: true, "aria-readonly": "true" });
    const contentEditableFalse = new MockHTMLElement("div", { contenteditable: "false" });

    assert.equal(contentModule.estElementEligible(inputPwd), false);
    assert.equal(contentModule.estElementEligible(inputReadonly), false);
    assert.equal(contentModule.estElementEligible(inputDisabled), false);
    assert.equal(contentModule.estElementEligible(inputInFieldset), false);
    assert.equal(contentModule.estElementEligible(divAriaReadonly), false);
    assert.equal(contentModule.estElementEligible(contentEditableFalse), false);
  });

  it("autorise les champs text, search, email, textarea, contenteditable et Google Docs", () => {
    const inputText = new globalThis.HTMLInputElement("input", { type: "text" });
    const inputEmail = new globalThis.HTMLInputElement("input", { type: "email" });
    const inputSearch = new globalThis.HTMLInputElement("input", { type: "search" });
    const textarea = new globalThis.HTMLTextAreaElement("textarea");
    const divEditable = new MockHTMLElement("div", { isContentEditable: true });

    assert.equal(contentModule.estElementEligible(inputText), true);
    assert.equal(contentModule.estElementEligible(inputEmail), true);
    assert.equal(contentModule.estElementEligible(inputSearch), true);
    assert.equal(contentModule.estElementEligible(textarea), true);
    assert.equal(contentModule.estElementEligible(divEditable), true);

    // Google Docs
    const docOriginal = globalThis.window.location.hostname;
    globalThis.window.location.hostname = "docs.google.com";
    assert.equal(contentModule.estElementEligible(new MockHTMLElement("div")), true);
    globalThis.window.location.hostname = docOriginal;
  });

  it("gère l'insertion sans erreur sur un champ email où selectionStart jette InvalidStateError", () => {
    const inputEmail = new globalThis.HTMLInputElement("input", { type: "email", value: "contact@" });
    // Simuler le comportement standard Gecko : InvalidStateError sur selectionStart pour type email
    Object.defineProperty(inputEmail, "selectionStart", {
      get() { throw new Error("InvalidStateError"); },
      set() { throw new Error("InvalidStateError"); }
    });

    globalThis.document.activeElement = inputEmail;
    assert.doesNotThrow(() => {
      contentModule.insererTexteAuCurseur("example.com");
    });
  });

  it("valide la détection d'exclusion des domaines et sous-domaines (sitesExclus)", () => {
    contentModule.configLocale.sitesExclus = ["interdit.fr", "banque.com"];

    globalThis.window.location.hostname = "interdit.fr";
    assert.equal(contentModule.estDomaineExclu(), true);

    globalThis.window.location.hostname = "compte.banque.com";
    assert.equal(contentModule.estDomaineExclu(), true);

    globalThis.window.location.hostname = "autorise.com";
    assert.equal(contentModule.estDomaineExclu(), false);
  });

  it("calcule la position ergonomique de la Goutte Vocale (haut-droit sur textarea, centré sur input)", () => {
    // Champ multi-lignes (textarea: height = 120 >= 50)
    const mockTextarea = new MockHTMLElement("textarea");
    mockTextarea.getBoundingClientRect = () => ({
      top: 100,
      bottom: 220,
      left: 200,
      right: 600,
      width: 400,
      height: 120
    });

    const posMulti = contentModule.calculerPositionWidget(mockTextarea, "CARET_GEM");
    assert.equal(posMulti.y, 110);
    assert.equal(posMulti.x, 572);

    // Champ mono-ligne (input: height = 32 < 50)
    const mockInput = new MockHTMLElement("input");
    mockInput.getBoundingClientRect = () => ({
      top: 100,
      bottom: 132,
      left: 200,
      right: 600,
      width: 400,
      height: 32
    });

    const posMono = contentModule.calculerPositionWidget(mockInput, "CARET_GEM");
    assert.equal(posMono.y, 107);
    assert.equal(posMono.x, 572);
  });

  it("cale la capsule et la goutte en bas à droite sur Google Docs (évite l'icône Gemini Docs)", () => {
    const docOriginal = globalThis.window.location.hostname;
    try {
      globalThis.window.location.hostname = "docs.google.com";

      // Capsule sonore déployée (état RECORDING)
      const posCapsule = contentModule.calculerPositionWidget(null, "RECORDING");
      assert.equal(posCapsule.isCenter, false);
      assert.equal(posCapsule.x, 1024 - 260 - 28); // 736
      assert.equal(posCapsule.y, 768 - 56 - 28);   // 684

      // Goutte vocale (état CARET_GEM)
      const posGoutte = contentModule.calculerPositionWidget(null, "CARET_GEM");
      assert.equal(posGoutte.isCenter, false);
      assert.equal(posGoutte.x, 1024 - 36 - 28);  // 960
      assert.equal(posGoutte.y, 768 - 36 - 28);   // 704
    } finally {
      globalThis.window.location.hostname = docOriginal;
    }
  });

  it("intercepte et stoppe la propagation des raccourcis clavier Control+Shift+S et Alt+Shift+S", () => {
    let preventDefaultAppele = false;
    let stopPropagationAppele = false;

    const eventMac = {
      ctrlKey: true,
      shiftKey: true,
      code: "KeyS",
      preventDefault() { preventDefaultAppele = true; },
      stopPropagation() { stopPropagationAppele = true; }
    };

    contentModule.gererRaccourciClavier(eventMac);
    assert.equal(preventDefaultAppele, true);
    assert.equal(stopPropagationAppele, true);

    preventDefaultAppele = false;
    stopPropagationAppele = false;
    const eventWin = {
      altKey: true,
      shiftKey: true,
      code: "KeyD",
      preventDefault() { preventDefaultAppele = true; },
      stopPropagation() { stopPropagationAppele = true; }
    };

    contentModule.gererRaccourciClavier(eventWin);
    assert.equal(preventDefaultAppele, true);
    assert.equal(stopPropagationAppele, true);
  });

  it("intercepte les touches Entrée et Échap pendant la session vocale active", () => {
    let preventDefaultAppele = false;
    let stopPropagationAppele = false;

    const eventEchap = {
      key: "Escape",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() { preventDefaultAppele = true; },
      stopPropagation() { stopPropagationAppele = true; }
    };

    // Hors session active, Escape ne doit pas être intercepté
    contentModule.definirEtat("HIDDEN");
    contentModule.gererRaccourciClavier(eventEchap);
    assert.equal(preventDefaultAppele, false);

    // En session active, Escape doit être intercepté
    contentModule.definirEtat("RECORDING");
    contentModule.gererRaccourciClavier(eventEchap);
    assert.equal(preventDefaultAppele, true);
    assert.equal(stopPropagationAppele, true);

    contentModule.definirEtat("HIDDEN");
  });

  // Nettoyage de l'environnement global simulé
  after(() => {
    globalThis.document = globalDocOriginal;
    globalThis.window = globalWinOriginal;
    globalThis.HTMLInputElement = globalHTMLInputElementOriginal;
    globalThis.HTMLTextAreaElement = globalHTMLTextAreaElementOriginal;
    globalThis.InputEvent = globalInputEventOriginal;
    globalThis.Event = globalEventOriginal;
  });
});
