# Changelog — Magic Voice Scriber for Firefox

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.0.0] - 2026-10-14

### Initialisation
- **Socle d'extension Firefox MV3** :
  - Déclinaison de l'architecture pour le navigateur Mozilla Firefox (Manifest V3, ciblage `action`).
  - Moteur universel `mvs-providers.js` avec support complet de Google Gemini (`gemini-3.5-transcribe` REST et `gemini-3.5-transcribe-live` WebSocket Bidi avec Manual VAD strict).
  - Hub IA pour OpenAI, Mistral, Groq et modèles locaux souverains (Whisper local + Ollama / LM Studio).
  - Traduction native intégrale en 6 langues (FR, EN, ES, PT, DE, VI).
  - Visualisation en temps réel via Web Audio API (5 barres d'ondes spectrales).
