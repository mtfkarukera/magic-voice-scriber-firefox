# Magic Voice Scriber for Firefox

**Dictée vocale sémantique et intelligente inspirée de Google Rambler pour Mozilla Firefox.**

**Magic Voice Scriber** transforme votre voix en textes clairs, fluides et parfaitement ponctués directement dans n'importe quel champ de saisie du Web (formulaires, éditeurs de texte riches, Google Docs, Notion, webmails, réseaux sociaux). Contrairement aux outils classiques de reconnaissance vocale, il élimine automatiquement les hésitations (« euh », « ben »), résout vos auto-corrections orales à la volée et structure votre pensée en paragraphes ou en listes à puces à la position de votre curseur.

---

## ✨ Fonctionnalités Principales

- 🎙️ **Dictée Sémantique Style Rambler** : Suppression intelligente des bafouillements, faux départs et répétitions.
- 🌊 **Capsule Glassmorphism Flottante** : Visualisation sonore en temps réel avec 5 barres réactives (`AudioContext` + `AnalyserNode`) animées sous votre curseur.
- ⌨️ **Raccourcis Clavier Rapides** :
  - `Alt+Shift+S` : Démarre / Arrête la dictée.
  - `Espace` : Met en pause ou reprend l'enregistrement.
  - `Échap` : Annule immédiatement la prise de parole sans rien insérer.
- 🎭 **3 Modes de Voix Morphing** : *Naturel*, *Professionnel* et *Synthèse / Puces*.
- 🔌 **Architecture Multi-Moteurs Ouverte (BYOK)** : Google Gemini (REST / Live Streaming), OpenAI, Mistral, Groq, et Modèles Locaux Souverains (Whisper local + Ollama / LM Studio).
- 🌍 **Interface Multilingue (6 langues)** : Français, Anglais, Espagnol, Portugais, Allemand, Vietnamien.

---

## 🚀 Installation & Compilation

```bash
# Exécuter les tests unitaires
npm test

# Compiler le package .xpi dans dist/
bash build.sh
```

---

## 🔒 Confidentialité

**Magic Voice Scriber** s'exécute à 100 % en local dans votre navigateur Firefox. Aucune donnée, aucun enregistrement vocal ni aucune clé d'API ne transitent par nos serveurs. Consultez [PRIVACY_POLICY.md](file:///Users/mtfkarukera/Scripts/magic-voice-scriber/magic-voice-scriber-firefox/PRIVACY_POLICY.md) pour plus de détails.

---

## 📄 Licence

Distribué sous licence **Mozilla Public License 2.0 (MPL-2.0)**. Voir [LICENSE](file:///Users/mtfkarukera/Scripts/magic-voice-scriber/magic-voice-scriber-firefox/LICENSE).

---
*Développé par **MTF Karukera**. Découvre toutes les solutions logicielles et outils de productivité de la suite **magic-softs** sur [mtfk.fr](https://mtfk.fr/).*
