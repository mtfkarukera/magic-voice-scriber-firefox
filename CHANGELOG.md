# Changelog — Magic Voice Scriber for Firefox

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.3.0] - 2026-10-19

### Audit Technique, Accessibilité WCAG 2.1 AA & Robustesse In-Situ
- **Accessibilité Clavier Intégrale (WCAG 2.1 AA)** :
  - **Goutte Vocale In-Situ Accessible** : Transformation de la Goutte Vocale en `<button type="button">` avec `tabindex="0"`, libellé contextuel `aria-label` et déclenchement sur `click` (tout en conservant la prévention de perte de focus sur `mousedown`).
  - **Rôles Sémantiques & États ARIA** : Ajout de `role="switch"` sur l'ensemble des cases à cocher configurables (`popup`, `options`, `setup`), et gestion synchronisée de l'attribut `aria-pressed` sur les sélecteurs de raccourcis segmentés.
  - **Restauration & Gestion du Focus** : Restauration automatique du focus au curseur dans l'élément d'édition cible dès l'insertion ou l'annulation de la dictée ; déplacement du focus accessible sur le titre de l'étape active (`h2`) dans l'Assistant de configuration (`setup.js`).
  - **Ergonomie & Cibles Tactiles (WCAG 2.5.8)** : Agrandissement de la Goutte Vocale à 28x28px avec hit-box accessible, passages des interrupteurs du mini-popup à 42x24px et bouton de suppression de tags à 24x24px minimum.
  - **Indicateurs `:focus-visible` & Internationalisation** : Anneaux de focus haute visibilité orange (`#ea580c`) et synchronisation automatique de l'attribut `document.documentElement.lang` selon la langue UI du navigateur.
- **Robustesse du Cycle de Vie Event Page MV3** :
  - **Signal KeepAlive Continu en État `THINKING`** : Maintien du battement de cœur `keepAliveAudioSession` pendant toute la durée de la transcription et du traitement IA, protégeant contre la mise en sommeil prématurée de l'Event Page sous Firefox MV3.
  - **Nettoyage Événementiel `pagehide`** : Libération immédiate et systématique des flux micro et instances `AudioContext` en cas de fermeture ou navigation de l'onglet actif.
  - **Sécurisation de l'Insertion In-Situ** : Re-validation stricte de l'éligibilité et de la connectivité DOM de l'élément cible avant insertion, avec annonce vocale accessible via la zone de statut ARIA `aria-live`.
  - **Durcissement des Messages Inter-Scripts** : Validation stricte de l'expéditeur interne (`expediteur.id === api.runtime.id`) dans `background.js` sans risque de fail-open.
  - **Test Réseau Actif du Moteur Local** : Remplacement du mock local par un véritable appel `fetch` (avec timeout de 3s) dans `mvs-providers.js` pour valider si le service Whisper local écoute réellement.
- **Harmonisation Graphique & Charte Magic-Softs** :
  - **Purge de la Dérive Chromatique** : Rétablissement de la palette orange officielle Magic-Softs (`--opt-accent: #ea6512;` / `#f97316;`) dans `options.css` et élimination des teintes violettes résiduelles.
  - **Contraste de Texte en Mode Sombre** : Correction du texte du bouton primaire en mode sombre (`color: #0f172a;` sur fond orange vif) garantissant un ratio de contraste supérieur à 9:1.
  - **Fluidité Visuelle à 60 FPS** : Suppression du conflit de transitions CSS sur les 5 barres spectrales (`will-change: transform` pur sans transition concurrente).
  - **Nettoyage du Code Mort** : Retrait définitif des sélecteurs CSS obsolètes liés aux anciens modes de traitement dans `content-injected.js` et `setup.css`.
  - **Favicons Standardisés** : Intégration du favicon `icons/icon-32.png` dans `setup.html` et `options.html`.
- **Permissions Moindre Privilège** :
  - Retrait de la permission `clipboardWrite` superflue dans `manifest.json`.
  - Déplacement de `localhost` et `127.0.0.1` vers `optional_host_permissions` pour garantir une validation AMO irréprochable sans avertissement d'origine excessive.

---

## [1.2.0] - 2026-10-18

### Épuration des Permissions Réseau & Sécurité Moindre Privilège (Option A)
- **Suppression des Hôtes Inutilisés (`manifest.json`)** :
  - Retrait définitif des permissions réseau `https://api.openai.com/*` et `https://api.groq.com/*`.
  - Alignement strict sur le « Trio Champion » effectivement proposé dans l'interface : Google Gemini API (`generativelanguage.googleapis.com`), Mistral AI (`api.mistral.ai`) et Modèle 100 % Local (`localhost` / `127.0.0.1`).
  - Élimination des avertissements trompeurs sur la fiche officielle Mozilla Add-ons (AMO) et respect absolu du principe du moindre privilège (*Least Privilege*).
- **Mise à Jour de la Documentation & Politique de Confidentialité** :
  - Harmonisation de `PRIVACY_POLICY.md` et de `submission_kit.md` (sections FR et EN) pour refléter exclusivement les hôtes autorisés.

---

## [1.1.0] - 2026-10-18

### Perfectionnement Ergonomique, Google Docs & Stratégie Keyboard-First (Phase 8)
- **Stratégie Keyboard-First & Interception Google Docs** :
  - Écoute des raccourcis clavier (`⌃ ⇧ S` sur Mac, `Alt + Shift + S` sous Windows/Linux) au plus haut de la chaîne d'événements (`window.addEventListener("keydown", ..., true)`).
  - Liaison dynamique des écouteurs à l'iframe proxy `.docs-texteventtarget-iframe` de Google Docs, garantissant un déclenchement instantané de la dictée même lorsque le traitement de texte capture le focus.
- **Dégagement de l'Icône Gemini Docs** :
  - Repositionnement de la capsule et de la goutte en bas à droite du viewport (`right: 28px; bottom: 28px`) sur `docs.google.com`, libérant totalement le bouton natif Gemini centré au bas de l'écran.
- **Pilule Vocale Déplaçable (Draggable Vanilla JS)** :
  - Possibilité de déplacer la capsule d'enregistrement à la souris par simple glisser-déposer sur n'importe quelle zone de l'écran, avec conservation de la position choisie tout au long de la session de dictée active.
- **Résilience du Focus pour Conteneurs Angular Material (NotebookLM)** :
  - Mécanisme de repli asynchrone à 50 ms via `obtenirElementActifProfond()` dans l'écouteur `focusin`, garantissant la détection immédiate des zones de texte `<textarea>` encapsulées dans le Shadow DOM.
- **Pédagogie Factualisée de la Permission Microphone par Site** :
  - Révision des libellés du guide d'accueil dans les 6 langues (`_locales/*/messages.json`) : explication claire et factuelle du modèle de sécurité Gecko qui sollicite l'accès au micro par origine de domaine lors du premier usage.
- **Épuration Radicale du Live & Champion Google Gemini (Phase 7)** :
  - Modèle Push-to-Talk 1-passe ultra-rapide (< 250 ms) avec Google Gemini (`gemini-3.5-transcribe` SMART) par défaut et Mistral Voxtral (`voxtral-mini-latest`) verbatim.
  - Positionnement adaptatif de la Goutte Vocale dans le coin supérieur droit des textareas et éditeurs multi-lignes.
- **Conformité & Suite de Tests** :
  - 28 tests unitaires validés à 100 % (`npm test`), incluant le positionnement spécifique Google Docs et la gestion des raccourcis clavier.
  - 0 erreur, 0 avertissement sur `npx web-ext lint`.

---

## [1.0.0] - 2026-10-17

### Lancement Officiel — Version Firefox Manifest V3
- **Script d'Injection Web Universel (`content/content-injected.js`)** :
  - Isolation complète dans un Shadow DOM fermé (`attachShadow({ mode: "closed" })`) interdisant toute interférence de style entre les pages web et le widget vocal.
  - Moteur d'insertion polyvalent et réactif : prise en charge des `<input>` (`text`, `search`, `email`), `<textarea>`, éléments `contenteditable` (Gmail, Notion, Slack, WordPress) et documents Google Docs (saisie Canvas via iframe proxy).
  - Émission synthétique des événements natifs `beforeinput`, `input` et `change` avec invocation du setter de prototype pour garantir la synchronisation instantanée des stores d'état dans React, Vue, Angular et Svelte (ChatGPT, Claude, etc.).
  - Goutte Vocale furtive par défaut au repos (`caretGemEnabled = false`) pour éliminer tout encombrement visuel, avec activation contextuelle via le raccourci clavier.
  - Double écoute clavier tolérante prenant en charge simultanément `Alt+Shift+S` et `Alt+Shift+D` (`⌥⇧S` et `⌥⇧D` sur macOS).
  - Exclusion stricte de sécurité interdisant toute capture ou injection dans les champs de mot de passe (`<input type="password">`).
- **Mini-Popup Popover de Barre d'Outils (`popup/`)** :
  - Interrupteur d'activation/exclusion en 1 clic pour le domaine courant (`sitesExclus`).
  - Interrupteur de persistance de la Goutte Vocale sous le curseur au repos.
  - Sélecteur de raccourci clavier avec détection automatique de l'OS (`⌥ ⇧ S` / `⌥ ⇧ D` sur macOS).
  - Raccourcis directs vers l'Assistant de configuration et la page d'Options complètes.
- **Assistant de Configuration & Diagnostic en 5 Étapes (`setup/`)** :
  - **Étape 1** : Diagnostic microphone direct avec visualiseur spectral 5 barres et autorisation Gecko standard mémorisée.
  - **Étape 2** : Choix du moteur d'IA (BYOK) avec test de connexion instantané et préréglages complets (`construireConfigActive()`).
  - **Étape 3** : Présentation conditionnelle selon l'**Invariant Strict #1** (mise en valeur de la technologie native Gemini SMART en 1 passe sans prompt parasite, ou sélecteur à 3 modes pour OpenAI/Local).
  - **Étape 4** : Bac à sable interactif permettant de lire une phrase test à voix haute et d'observer le résultat nettoyé et ponctué en direct.
  - **Étape 5** : Clôture et démarrage rapide.
- **Cœur Réseau Multi-Moteurs & Sécurité (`mvs-providers.js`, `background.js`)** :
  - Support de Google Gemini (streaming temps réel WebSocket `gemini-3.5-transcribe-live` et batch REST `gemini-3.5-transcribe`).
  - Élimination totale du paramètre `?key=` dans les URLs REST (authentification sécurisée exclusivement par en-tête `x-goog-api-key`).
  - Protection cross-domain interdisant le partage de clés d'API entre STT et LLM sur des domaines distincts.
  - Protection anti-SSRF renforcée sur l'action privilégiée `testProvider`.
- **Options Complètes & Internationalisation (`options/`, `_locales/`)** :
  - Nouvelle section « Ergonomie Web & Sites Exclus » permettant d'administrer visuellement la liste noire de domaines.
  - Couverture multilingue intégrale et parité stricte à 100 % sur les 6 langues (`fr`, `en`, `de`, `es`, `pt`, `vi`).
- **Tests & Conformité Qualité** :
  - Suite de 22 tests unitaires automatisés validant la résilience des champs web, les pipelines IA, la sécurité DOM/CSP (zéro innerHTML, zéro eval) et l'internationalisation.
