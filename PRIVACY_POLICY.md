# Politique de Confidentialité / Privacy Policy — Magic Voice Scriber for Firefox

*Dernière mise à jour : 17 octobre 2026*

---

## 🇫🇷 Version Française

### 1. Principe Fondamental : Zéro Collecte de Données
**Magic Voice Scriber** est conçu selon le principe du respect absolu de la vie privée (*Privacy by Design*) :
- **Aucun serveur intermédiaire** : L'extension est développée par **MTF Karukera** et fonctionne intégralement en local au sein de votre navigateur Firefox. Nous ne possédons aucun serveur de collecte et n'interceptons jamais vos enregistrements vocaux, vos textes ou vos clés d'API.
- **Aucune télémétrie ni pistage** : Aucun outil d'analyse, traceur publicitaire ou script de télémétrie n'est intégré dans l'extension.

### 2. Traitement des Données Vocales et Textuelles
Lorsque vous déclenchez manuellement une dictée vocale (via le raccourci clavier `Alt+Shift+S`, la Goutte Vocale ou le popup) :
- L'audio capturé par votre microphone est conservé temporairement en mémoire vive (RAM) le temps de l'enregistrement, puis immédiatement purgé dès la transcription terminée ou annulée (`Échap`).
- L'extension n'enregistre ni n'injecte jamais de texte dans les champs de mot de passe (`<input type="password">`).
- Selon le fournisseur que vous avez explicitement choisi dans les paramètres :
  1. **Google Gemini API** : L'audio est envoyé directement à l'API officielle de Google (`generativelanguage.googleapis.com`) avec votre propre clé API via une connexion HTTPS chiffrée.
  2. **OpenAI / Tiers Cloud (Mistral, Groq...)** : L'audio et le texte sont transmis directement aux endpoints officiels que vous avez configurés (`api.openai.com`, `api.groq.com`, `api.mistral.ai` ou votre URL personnalisée).
  3. **Modèle Local (Ollama, LM Studio, Whisper local)** : L'intégralité du traitement vocal et textuel s'effectue à 100 % sur votre propre machine (`http://localhost` / `http://127.0.0.1`). Aucune donnée ne quitte votre ordinateur.

### 3. Stockage Local (`storage`)
Vos préférences (fournisseur actif, mode de voix préféré, URLs, clés d'API, liste des sites exclus et options de la Goutte) sont enregistrées exclusivement en local dans le stockage interne de votre profil Firefox via `browser.storage.local`.

### 4. Justification des Permissions
- **`scripting`** : Nécessaire pour injecter le widget vocal flottant et insérer le texte transcrit au point d'insertion actif de la page web.
- **`storage`** : Permet de sauvegarder localement vos préférences et la configuration de vos moteurs d'IA.
- **`menus`** : Permet d'accéder rapidement aux options via un clic droit sur l'icône de l'extension.
- **`clipboardWrite`** : Permet de copier d'un clic les exemples et clés lors de la configuration.
- **Permissions d'hôtes (`host_permissions`)** : Permettent au script d'arrière-plan de contacter directement l'API du moteur IA que vous avez sélectionné (Google Gemini, OpenAI, Groq, Mistral ou `localhost`).

---

## 🇬🇧 English Version

### 1. Core Principle: Zero Data Collection
**Magic Voice Scriber** is built with strict *Privacy by Design* principles:
- **No intermediate servers**: Developed by **MTF Karukera**, this extension runs 100% locally inside your Firefox browser. We do not operate any backend servers and never collect, store, or intercept your voice recordings, typed texts, or API keys.
- **No telemetry or tracking**: No analytics, tracking scripts, or telemetry tools are included.

### 2. Voice and Text Processing
When you manually trigger voice dictation (via the `Alt+Shift+S` shortcut, Caret Gem, or popup):
- Captured microphone audio is held only in volatile memory (RAM) during recording and is immediately discarded once transcription finishes or is canceled (`Escape`).
- Password fields (`<input type="password">`) are strictly excluded from all voice capture and text injection.
- Depending on the provider you explicitly configured in the settings:
  1. **Google Gemini API**: Audio is sent directly to Google's official API (`generativelanguage.googleapis.com`) using your own API key over encrypted HTTPS.
  2. **OpenAI / Cloud Providers (Mistral, Groq...)**: Audio and text are sent directly to your configured endpoints (`api.openai.com`, `api.groq.com`, `api.mistral.ai`, or your custom URL).
  3. **Local Model (Ollama, LM Studio, Local Whisper)**: All speech-to-text and LLM cleanup processing happens 100% offline on your own computer (`http://localhost` / `http://127.0.0.1`). Zero data ever leaves your device.

### 3. Local Storage (`storage`)
Your preferences (active provider, voice mode preference, endpoints, API keys, excluded domains, and Caret Gem settings) are stored exclusively on your device within your Firefox profile using `browser.storage.local`.

### 4. Permissions Justification
- **`scripting`**: Required to inject the lightweight floating voice widget and insert cleaned text at the active insertion point.
- **`storage`**: Used to locally save your preferences and AI provider settings.
- **`menus`**: Provides quick access to extension settings via right-click on the toolbar icon.
- **`clipboardWrite`**: Allows convenient one-click copying during setup and testing.
- **Host Permissions (`host_permissions`)**: Allow the background script to communicate directly with your selected AI provider (Google Gemini, OpenAI, Groq, Mistral, or `localhost`).
