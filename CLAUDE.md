# Kontrol — règles du projet

PWA iPhone de suivi de chantier pour un maître d'œuvre du SID (marchés publics de travaux) :
checklist de contrôle issue du CCTP/CCAP et suivi des réserves. Interface en français.

## Contraintes impératives
- **Local-first** : toutes les données sur le téléphone (IndexedDB via Dexie). Aucun serveur, aucune API externe,
  **sauf** la sauvegarde Google Drive (OAuth, scope `drive.file` uniquement).
- Hors ligne (service worker, vite-plugin-pwa — étape f). Polices embarquées (@fontsource), jamais Google Fonts.
- Hébergement du code : GitHub Pages uniquement (`base: '/Kontrol/'`, routage par hash `#/…`).
- Utilisation à une main, en extérieur. Format de référence iPhone 390 × 844.

## Stack
React 19 + Vite 8 + TypeScript, Dexie 4 (+ dexie-react-hooks), lucide-react (icônes),
SheetJS (Excel), jsPDF (PDF), JSZip (sauvegarde). Pas de backend.

## Design — source de vérité : `design/`
- `design/DESIGN.md` (règles), `design/tokens.css`, `design/maquettes/*.dc.html` (à reproduire fidèlement).
- `src/styles/tokens.css` = copie de `design/tokens.css` sans `@import`. **Jamais de couleur en dur** : tokens uniquement.
- Texte ≥ 16 px ; zones tactiles ≥ 48 px ; bouton principal 56 px ; FAB 64 px.
- Statut jamais porté par la couleur seule : pastille + libellé (+ triangle pour « bloquant »).
- Mono (IBM Plex Mono) pour références, dates, compteurs, %, code site.
- Safe areas : `viewport-fit=cover` + `env(safe-area-inset-*)`. Sombre par défaut (réglage Sombre / Clair / Système).
- Composants natifs accessibles (`button`, `a`, `label`), `aria-label` sur boutons-icônes,
  `aria-current="page"` onglet actif, `aria-pressed` segments et filtres.
- Dates JJ/MM/AAAA (JJ/MM en liste), heure 24 h, retard « +N j » en rouge.

## Principe d'usage
**Après l'import JSON, tout se fait sur le téléphone** : aucun retour nécessaire vers Claude ou un ordinateur.
Toute donnée importée doit être modifiable dans l'app (points, jalons, pénalités, lots/marchés, intervenants),
et on doit pouvoir en ajouter ou en supprimer. Prévoir des actions groupées quand une correction répétitive est probable
(ex. « points bloquants par type » dans les paramètres du chantier).

## Règle d'arbitrage
En cas d'écart entre le cahier des charges et les maquettes, **le cahier des charges prime** (choix de l'utilisateur).
Les maquettes donnent la forme ; le cahier des charges donne les fonctions et les libellés métier.

## Modèle métier
- **Un lot = un marché.** Chaque lot porte son n° de marché, son titulaire (+ sous-traitants), sa date d'OS
  (vide = OS générale du chantier) et sa date de réception réelle (vide = règle ci-dessous).
  Un chantier de 5 lots = 5 marchés = 5 n° de marché.
- États d'un point : `a_faire` (À faire, bleu) · `en_cours` (En cours, orange) · `conforme` (vert) ·
  `non_conforme` (rouge) · `sans_objet` (gris). Un point non conforme propose de créer une réserve liée.
- Point bloquant non validé = `bloquant` et état ≠ conforme / sans objet → mis en évidence (fond `--r-bg` + contour `--r`).
- Statuts réserve enregistrés : `ouvert` · `relance` · `levee_a_verifier` · `leve`.
  **« En retard » est calculé** (échéance dépassée et non levée), jamais stocké.
- Gravité : bloquante / majeure / mineure. Origine : visite / OPR / CR / contrôle.
- Lot et entreprise (et localisation) mémorisent la dernière saisie (table `reglages`).
- Photos : largeur max 1600 px, JPEG 0,7, + vignette ; stockées dans la table `photos`, référencées par id.
- Jalons et pénalités : **communs** (sans `lot`) ou **propres à un marché** (`lot` renseigné).
- Dates des jalons **calculées à l'affichage** (`contexte()` dans `src/domain/dates.ts`, testé) :
  - contexte d'un lot : OS du lot (sinon OS générale) ; délai = plus grand jalon `delai` rapporté à l'OS propre au lot,
    sinon commun ; réception = réelle du lot › (si ni OS ni délai propres) réception de l'ensemble › OS du lot + délai ;
  - contexte de l'ensemble : OS générale, délai commun, réception réelle du chantier ou OS + délai ;
  - `OS_demarrage` → OS + jours ; `reception` → réception + jours ; `autre` → date saisie dans l'app (`dateFixe`) ;
  - un jalon propre à un lot se calcule dans le contexte de ce lot ; un jalon commun dans celui de l'ensemble
    (ou du lot filtré dans l'onglet Jalons) ;
  - jalon fait = `dateRealisee` renseignée.
- Échéance d'un point : `relative` = jours après l'OS **de son lot** (« 30 », « J+30 », « OS-15 ») ;
  `date` = JJ/MM/AAAA ou AAAA-MM-JJ ; `evenement` = texte libre.

## Format du fichier JSON d'import
```json
{
  "chantier": { "nom": "", "operation": "", "site": "",
    "lots": [{ "code": "GO", "intitule": "", "numero_marche": "", "titulaire": "", "sous_traitants": [] }] },
  "points_controle": [{ "id": "GO-3.2-01", "lot": "GO", "article_cctp": "GO 3.2",
    "phase": "preparation | execution | reception | cloture",
    "type": "document | agrement | point_arret | controle | essai | prescription",
    "intitule": "", "critere_acceptation": "", "reference": "NF DTU / norme",
    "responsable": "entreprise | moe | controleur_technique | csps",
    "echeance": { "type": "relative | evenement | date", "valeur": "" }, "bloquant": true }],
  "jalons": [{ "id": "", "lot": "(facultatif : absent = commun)",
    "categorie": "delai | documentaire | reception | garantie | paiement",
    "intitule": "", "article_ccap": "", "echeance": { "reference": "OS_demarrage | reception | autre", "jours": 0 } }],
  "penalites": [{ "lot": "(facultatif)", "motif": "", "montant_ou_taux": "", "article_ccap": "" }]
}
```
Validation : `src/domain/import.ts` (erreurs bloquantes + avertissements, chemin précis du champ ;
tolère BOM et nombres à la place de textes ; ancien `chantier.numero_marche` accepté pour un lot unique).
Exemple : `exemples/chantier-exemple.json` (2 lots = 2 marchés, 15 points, 6 jalons dont 1 propre au lot CVC).

## Arborescence
- `src/db/schema.ts` — Dexie (tables chantiers, lots, intervenants, points, reserves, jalons, penalites, photos, reglages).
  Toute évolution du schéma = nouvelle `version(n)` avec migration, jamais de modification de `version(1)`.
- `src/domain/` — types, dates, statuts, import (logique pure, sans React).
- `src/components/` — composants UI communs (`ui.tsx` : Header, Pastille, Sheet, Segment, toast).
- `src/screens/` — écrans. `src/router.ts` — routeur hash minimal.
- `tests/` — tests Vitest de la logique métier (dates, import, migration, checklist, réserves).
- `src/services/photos.ts` — compression (1600 px, JPEG 0,7) + vignette 240 px ; `src/components/Photos.tsx` — bandeau, visionneuse.
- Réserves : `src/domain/reserves.ts` (compteurs, filtres, tri), `src/services/reserves.ts` (création numérotée R-01…,
  relance, levée signalée, levée avec photo obligatoire, refus, réouverture — historique tenu à chaque action),
  `OngletReserves`, `SaisieReserve` (panneau du bas, création et modification), `DetailReserve`.
  « En retard » = échéance dépassée et statut ouvert ou relancé (une levée à vérifier attend le MOE, pas l'entreprise).
  Bouton « + » flottant sur les onglets Checklist, Réserves et Jalons. Dictée : `components/Dictee.tsx`
  (Web Speech API si disponible, sinon micro du clavier iOS).
- Checklist : `src/domain/checklist.ts` (filtres, groupes, stats, parcours précédent/suivant),
  `OngletChecklist`, `DetailPoint` (état en un toucher, commentaire auto-enregistré, photos), `EditionPoint`.

## Fluidité (conventions)
- Lectures réactives via `useLive(cle, requete, deps)` (`src/db/live.ts`) : affiche immédiatement le dernier
  résultat connu à la navigation, sans écran vide. Ne pas utiliser `useLiveQuery` directement dans les écrans.
- Navigation : `aller()` (nouvelle page), `remplacer()` (onglets, après création), `retour(parent)` (bouton retour :
  revient dans l'historique si le parent est la page précédente, sinon va au parent — jamais de sortie de l'app).
  Le défilement est restauré au retour arrière.
- Panneaux du bas : composant `Sheet` (animation ≤ 200 ms, `prefers-reduced-motion` respecté).
- Sous une barre d'action basse fixe, ajouter `<div className="bar-space" />` en fin de contenu.
- Écritures multiples en une transaction Dexie.
- Mises à jour : `src/pwa/miseAJour.ts` compare le script chargé à celui en ligne (requête sans cache) ;
  bandeau « Nouvelle version disponible » + « tirer pour actualiser » (`components/Actualisation.tsx`) +
  bouton dans Réglages. GitHub Pages met index.html en cache 10 min : toujours recharger via `rafraichir()`.
- `src/services/` — photos, exports, Drive. `scripts/icons.mjs` — génération des icônes PNG.

## Feuille de route V1
(a) chantiers + import JSON ✅ · (b) checklist ✅ · (c) réserves + photos ✅ · (d) exports · (e) sauvegarde Drive · (f) PWA hors ligne.
À la fin de chaque étape : marche à suivre pour tester sur iPhone.

### Hors périmètre V1 (ne pas développer)
Réserves pointées sur plan, PGC SPS, rapport du contrôleur technique, prix/DPGF, multi-utilisateur,
messagerie avec les entreprises.

## Commandes
- `npm run dev` (accessible sur le réseau local) · `npm run build` · `npm run typecheck` · `npm test`
- `npm run icons` (nécessite Playwright) — régénère `public/icons/*.png` depuis `public/icons/icon.svg`.
- Vérifier chaque écran à 390 px de large : pas de défilement horizontal, aucun texte < 16 px, aucune cible < 44 px.
- Déploiement : `.github/workflows/deploy.yml` → GitHub Pages à chaque push sur `main` ou `claude/**`.
