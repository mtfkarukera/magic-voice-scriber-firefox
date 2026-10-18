# Magic Voice Scriber for Firefox

**Une expérience de dictée fluide inspirée d'outils comme Google Rambler ou Mistral Voxtral pour Mozilla Firefox.**

**Magic Voice Scriber** transforme votre voix en textes clairs, fluides et parfaitement ponctués directement dans n'importe quel champ de saisie du Web (formulaires, éditeurs de texte riches, Google Docs, Notion, webmails, réseaux sociaux). Inspiré d'outils comme Google Rambler et Mistral Voxtral, vos hésitations (« euh », « ben »), faux départs et répétitions sont gommés naturellement dès la transcription en une seule passe ultra-rapide (< 250 ms), sans latence ni reformulation artificielle.

---

## ✨ Fonctionnalités Principales

- 🎙️ **Dictée Sémantique Fluide** : Élimination naturelle et immédiate des bafouillements, faux départs et tics de langage dès la capture audio en Push-to-Talk 1 passe ultra-rapide (< 250 ms).
- ⚡ **Trio de Moteurs Épuré (BYOK)** :
  - **Google Gemini (Par défaut & Recommandé)** : Modèle natif Gemini 3.5 Transcribe en mode SMART 1-passe (filtrage sémantique immédiat des hésitations et bafouillements).
  - **Mistral AI (Haute fidélité)** : Transcription mot-à-mot ultra-précise via Voxtral Mini (`voxtral-mini-latest`).
  - **100 % Local & Gratuit** : Serveur Whisper local (ex: Faster-Whisper sur `http://localhost:8000`) pour une confidentialité absolue hors-ligne.
- 🌊 **Capsule Glassmorphism Déplaçable & Goutte Vocale Ergonomique** : Visualisation sonore réactive en direct à 60 FPS avec 5 barres d'ondes. Capsule flottante librement déplaçable à la souris (mémorisation de sa position durant la dictée). Goutte Vocale contextuelle intégrée discrètement à droite du champ actif (calage haut-droit sur textareas et éditeurs, centrage vertical sur inputs mono-lignes, et calage en bas à droite sur Google Docs pour ne pas masquer le bouton natif Gemini).
- ⌨️ **Raccourcis Clavier & Stratégie Keyboard-First** :
  - `Control+Shift+S` (`⌃ ⇧ S` sur macOS) ou `Alt+Shift+S` (Windows/Linux) : Déclenchement instantané de la dictée au plus haut de la chaîne d'événements, avec liaison directe à l'iframe de saisie de Google Docs.
  - `Espace` : Met en pause ou reprend l'écoute.
  - `Entrée` : Valide et insère le texte propre immédiatement au curseur.
  - `Échap` : Annule immédiatement la prise de parole sans rien insérer.
- 🛡️ **Ergonomie Web & Sécurité** : Liste noire de domaines (désactivation en 1 clic sur les sites sensibles), exclusion stricte des champs mot de passe (`type="password"`) et respect du `Ctrl+Z` natif.
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
