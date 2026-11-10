# Kontrol — règles du projet

PWA iPhone de suivi de chantier pour un maître d'œuvre du SID (marchés publics de travaux) :
checklist de contrôle issue du CCTP/CCAP et suivi des réserves. Interface en français.

## Contraintes impératives
- **Local-first** : toutes les données sur le téléphone (IndexedDB via Dexie). Aucun serveur, aucune API externe,
  **sauf** la sauvegarde Google Drive (OAuth, scope `drive.file` uniquement).
- Hors ligne (service worker, vite-plugin-pwa). Polices embarquées (@fontsource), jamais Google Fonts.
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
  - période de préparation (chantier : `dureePreparation`, `preparationComprise`, `dateDebutTravaux` = OS n° 2 facultative) :
    fin de PP = début des travaux saisi, sinon OS + durée ; **départ du délai** = OS, ou fin de PP si la PP n'est pas
    comprise dans le délai (CCAP) ; réception prévisionnelle = départ du délai + délai ;
  - `OS_demarrage` → OS + jours (jalons « delai » : départ du délai + jours) ; `fin_preparation` → fin de PP + jours ;
    `reception` → réception + jours ; `autre` → date saisie dans l'app (`dateFixe`) ; libellé : `calculJalon()` ;
  - un jalon propre à un lot se calcule dans le contexte de ce lot ; un jalon commun dans celui de l'ensemble
    (ou du lot filtré dans l'onglet Jalons) ;
  - jalon fait = `dateRealisee` renseignée.
- Échéance d'un point : `relative` = jours après l'OS **de son lot** (« 30 », « J+30 », « OS-15 ») ;
  `date` = JJ/MM/AAAA ou AAAA-MM-JJ ; `evenement` = texte libre, rattaché quand c'est possible à une date du chantier
  (`echeanceEvenement` : période de préparation, début des travaux, (demande de) réception / OPR, GPA, OS ; décalage
  « 15 jours avant… ») ; les événements du déroulement (commande, pose, coulage…) restent sans date.
  `datePoint(p, ch, lots, jalons)` : toujours passer les jalons.
- `src/domain/preparation.ts` (testé) : `analyserPreparation()` lit la période de préparation dans les jalons
  (jalon « delai » « période de préparation », « non comprise » → hors délai) et corrige les jalons mal typés
  (fin de PP, « après l'OS de démarrage », garanties biennale / décennale) — à l'import, migration Dexie v5, restauration.

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
- `src/db/schema.ts` — Dexie (tables chantiers, lots, intervenants, points, reserves, jalons, penalites, penalitesAppliquees, reunions, photos, reglages).
  Toute évolution du schéma = nouvelle `version(n)` avec migration, jamais de modification de `version(1)`.
- `src/domain/` — types, dates, statuts, import (logique pure, sans React).
- `src/components/` — composants UI communs (`ui.tsx` : Header, Pastille, Sheet, Segment, toast).
- `src/screens/` — écrans. `src/router.ts` — routeur hash minimal.
- `tests/` — tests Vitest de la logique métier (dates, import, migration, checklist, réserves, exports, sauvegarde, pénalités, réunion).
- `src/services/photos.ts` — compression (1600 px, JPEG 0,7) + vignette 240 px ; `src/components/Photos.tsx` — bandeau, visionneuse.
- Réserves : `src/domain/reserves.ts` (compteurs, filtres, tri), `src/services/reserves.ts` (création numérotée R-01…,
  relance, levée signalée, levée avec photo obligatoire, refus, réouverture — historique tenu à chaque action),
  `OngletReserves`, `SaisieReserve` (panneau du bas, création et modification), `DetailReserve`.
  « En retard » = échéance dépassée et statut ouvert ou relancé (une levée à vérifier attend le MOE, pas l'entreprise).
  Bouton « + » flottant sur les onglets Checklist, Réserves et Jalons. Dictée : `components/Dictee.tsx`
  (Web Speech API si disponible, sinon micro du clavier iOS).
- Exports : écran `Exports` (bouton ↓ de l'en-tête chantier). `src/services/exports/` : `donnees.ts` (chargement, libellés),
  `texte.ts` (points non soldés à coller dans Claude), `xlsx.ts` (SheetJS, vraies dates Excel), `pdf.ts` (jsPDF A4,
  photos réduites à 1000 px ; polices standard = Windows-1252 → `pdfTexte()` remplace ≥, ≤…), `partage.ts`
  (feuille de partage iOS via un 2ᵉ toucher « Fichier prêt », sinon téléchargement). xlsx et pdf chargés à la demande.
- Sauvegarde : `src/services/sauvegarde.ts` — ZIP `donnees.json` (toutes les tables, format `kontrol-sauvegarde` v1,
  n° de schéma) + `photos/<id>.jpg` ; restauration (Réglages) = remplacement complet, avec mise au schéma courant.
  Même format pour Google Drive (étape e).
- Google Drive : `src/drive/` — `oauth.ts` (flux « jeton » OAuth par **redirection pleine page**, pas de pop-up :
  les pop-ups ne reviennent pas à une PWA iOS ; portée `drive.file` seule ; jeton 1 h en localStorage ;
  importé EN PREMIER dans main.tsx pour retirer le jeton de l'URL avant le routeur hash ; `state` vérifié),
  `api.ts` (REST Drive v3 : dossier « Kontrol », envoi reprenable avec progression, liste, suppression, téléchargement),
  `sauvegardeDrive.ts` (état partagé `useDrive`, sauvegarde = même ZIP que la sauvegarde locale, 5 conservées,
  automatique à l'ouverture si > 24 h et données modifiées ; jeton expiré → reconnexion silencieuse `prompt=none`
  au plus toutes les 6 h ; refus → pastille « Reconnecter » ; l'action demandée reprend au retour de Google).
  `src/db/suivi.ts` : crochets Dexie → date de dernière modification (« En attente »).
  Arborescence Drive : `Kontrol / Sauvegardes /` (ZIP « Kontrol – sauvegarde du JJ-MM-AAAA à HHhMM.zip »,
  5 conservées ; les ZIP de l'ancienne racine y sont déplacés et renommés) et
  `Kontrol / <chantier> /` (`drive/dossiersChantiers.ts`, mis à jour à chaque sauvegarde) : `Rapport – <chantier>.pdf`
  (`pdfRapport` : synthèse, checklist, réserves sans photos, jalons, pénalités), `Suivi – <chantier>.xlsx` (`xlsxSuivi`),
  `Photos /` (nommées par réserve / point, `drive/nommage.ts` testé ; seules les nouvelles sont envoyées ; renommées si
  besoin ; mises à la corbeille Drive si supprimées de l'app). Fichiers repérés par `appProperties` (pas par le nom).
  Un dossier de chantier supprimé de l'app reste sur le Drive. Échec des dossiers ≠ échec de la sauvegarde (`config.documents`).
  À venir : `Comptes rendus /` (CR .docx de réunion depuis le modèle de l'utilisateur).
  Identifiant client OAuth saisi une fois dans Réglages (ou `VITE_GOOGLE_CLIENT_ID`) ; collage tolérant (`drive/identifiant.ts`).
  Projet Google Cloud « Kontrol » (kontrol-514109), en production, portée `drive.file` seule : **ne pas supprimer
  `public/confidentialite.html`** (règles de confidentialité déclarées dans l'écran de consentement Google ; exclue du
  `navigateFallback` du service worker). UI : `components/Drive.tsx`
  (pastille accueil, carte Exports), `screens/SectionDrive.tsx` (Réglages : configuration, restauration Drive).
- Pénalités : **barème du CCAP** (table `penalites`, importé) ≠ **pénalités appliquées** (table `penalitesAppliquees`,
  schéma v3 : marché, entreprise, article du barème, date, quantité × montant unitaire, statut constatée / notifiée /
  retenue au décompte). `src/domain/penalites.ts` lit le barème (« 200 € HT par absence », « 1/1000 du montant HT du
  marché par jour » → × `lot.montantHT`). Écran : onglet Jalons › sélecteur Jalons / Pénalités (route `penalites`),
  `OngletPenalites`, `SaisiePenalite`, `EditionBareme` (dont « déplacer dans les pénalités appliquées »).
  Exports : registre PDF / Excel et section 7 du texte pour Claude. Accès depuis Intervenants (total par marché).
- Mode réunion : table `reunions` (schéma v4 : n°, date, heure, type, lieu, participants avec présence P/E/A,
  observations / décisions par lot ou générales avec responsable et échéance, prochaine réunion, clôture).
  `src/domain/reunion.ts` (testé) : participants initiaux (MOE + intervenants + participants libres reconduits),
  reprise des actions non soldées **avec échéance**, `pointsASuivre` (prioritaires : non conformes, en retard,
  en cours, échéance ≤ 15 j ; autres bloquants à part, repliés), `changementsDepuis` (début de la réunion
  précédente), `compteRendu` (texte pour Claude). Accès : onglet Intervenants › sélecteur Intervenants / Réunions
  (route `reunions`) ; écran `Reunion` (route `reunion/<id>`) en 3 étapes Appel / Déroulé / CR.
  Absence d'un titulaire → pénalité d'absence pré-remplie (article du barème contenant « absen »).
  En tête de l'appel : l'utilisateur, **représentant du MOE** (`participantMoe`, présent par défaut) puis l'organisme
  **MOE** (`participantEntiteMoe`, non pointé par défaut : ignoré par « Autres présents » et absent du CR tant qu'il
  n'est pas pointé). Profil Réglages › Vous (`components/Profil.tsx`) : vous (nom, fonction, défaut « Représentant du MOE »),
  maîtrise d'œuvre (organisme ; nom et fonction facultatifs de son représentant → ligne MOE « nom · fonction · organisme (MOE) ») ;
  enregistrer met à jour les réunions non clôturées. Autres participants : touchés dans l'appel → `FicheParticipant`
  (nom, rôle, lot, retrait de la liste) ; un participant issu d'un intervenant n'est modifié que pour la réunion.
  Lignes MOE touchées → `FicheMoe` (profil, `services/profil.ts` `enregistrerProfil` partagé avec Réglages).
- Photos : deux entrées (`EntreesPhotos`) — appareil photo direct (`capture`) et photothèque (sans `capture`,
  sélection multiple) : sur iPhone, `capture` empêche de choisir dans la photothèque.
- Checklist : `src/domain/checklist.ts` (filtres, groupes, stats, parcours précédent/suivant),
  `OngletChecklist`, `DetailPoint` (état en un toucher, commentaire auto-enregistré, photos), `EditionPoint`.

- Accueil : **pas de compteurs globaux** (choix de l'utilisateur) ; chaque carte chantier porte ses 3 compteurs
  (réserves ouvertes, réserves en retard, points bloquants), raccourcis vers Réserves « Non levées » / « Retard »
  et Checklist « Bloquants » (`filtrerReservesSur`, `filtrerChecklistSur`).

## Fluidité (conventions)
- Lectures réactives via `useLive(cle, requete, deps)` (`src/db/live.ts`) : affiche immédiatement le dernier
  résultat connu à la navigation, sans écran vide. Ne pas utiliser `useLiveQuery` directement dans les écrans.
- Navigation : `aller()` (nouvelle page), `remplacer()` (onglets, après création), `retour(parent)` (bouton retour :
  revient dans l'historique si le parent est la page précédente, sinon va au parent — jamais de sortie de l'app).
  Le défilement est restauré au retour arrière.
- Panneaux du bas : composant `Sheet` (animation ≤ 200 ms, `prefers-reduced-motion` respecté). Il suit le clavier iOS
  (visualViewport : le pied « Enregistrer » reste visible) et protège la saisie (fermeture par zone sombre / × / Échap
  après modification → confirmation). Un formulaire qui enregistre appelle `onClose` directement.
- Sous une barre d'action basse fixe, ajouter `<div className="bar-space" />` en fin de contenu.
- Écritures multiples en une transaction Dexie.
- Hors ligne : vite-plugin-pwa (`registerType: 'prompt'`, manifeste = `public/manifest.webmanifest`) ; tout le build
  est précaché (y compris les modules PDF / Excel / sauvegarde chargés à la demande, polices woff2, icônes).
  `src/pwa/sw.ts` : enregistrement, recherche de mise à jour au retour dans l'app et toutes les 30 min,
  `activerDerniereVersion()` (télécharge, active, recharge). Toast « App prête pour une utilisation hors ligne ».
- Mises à jour : `src/pwa/miseAJour.ts` compare le script chargé à celui en ligne (requête sans cache, non
  interceptée par le service worker) ; bandeau « Nouvelle version disponible » + « tirer pour actualiser »
  (`components/Actualisation.tsx`) + bouton dans Réglages. Toujours recharger via `rafraichir()` (passe par le
  service worker ; sans lui, contourne le cache HTTP de 10 min de GitHub Pages).
- Réseau : pastille « Hors ligne » / « En attente » ; au retour du réseau, sauvegarde Drive due envoyée
  (`lancerSiDue(false)` : jamais de redirection Google en cours d'utilisation).
- `src/services/` — photos, exports, Drive. `scripts/icons.mjs` — génération des icônes PNG.

## Feuille de route V1
(a) chantiers + import JSON ✅ · (b) checklist ✅ · (c) réserves + photos ✅ · (d) exports ✅ · (e) sauvegarde Drive ✅ · (f) PWA hors ligne ✅ — **V1 complète (1.0.0)**.
V1.1 : registre des pénalités appliquées, photos depuis la photothèque. V1.2 : mode réunion.
V1.3 : dossiers chantiers sur Google Drive (rapport PDF, Excel, photos).
V1.4 : période de préparation (comprise ou non dans le délai), échéances en texte rattachées aux dates du chantier.
À la fin de chaque étape : marche à suivre pour tester sur iPhone.

### Hors périmètre V1 (ne pas développer)
Réserves pointées sur plan, PGC SPS, rapport du contrôleur technique, prix/DPGF, multi-utilisateur,
messagerie avec les entreprises.

## Version
`package.json` : 0.<n° d'étape terminée>.x jusqu'à la V1 complète (1.0.0 après l'étape f) — **à incrémenter à chaque
étape ou correction notable**. Numéro de build (= nombre de commits) et date de mise en ligne (heure de Paris)
ajoutés automatiquement au build et affichés dans Réglages › Version.

## Commandes
- `npm run dev` (accessible sur le réseau local) · `npm run build` · `npm run typecheck` · `npm test`
- `npm run icons` (nécessite Playwright) — régénère `public/icons/*.png` depuis `public/icons/icon.svg`.
- Vérifier chaque écran à 390 px de large : pas de défilement horizontal, aucun texte < 16 px, aucune cible < 44 px.
- Déploiement : `.github/workflows/deploy.yml` → GitHub Pages **uniquement depuis `main`** (= version en ligne).
  Travailler sur sa branche `claude/…`, puis mettre en ligne en reportant sur `main` (avance rapide :
  `git push origin HEAD:main` depuis une branche à jour de `main` ; jamais de réécriture de `main`).
  L'utilisateur a autorisé les envois sur `main` pour les mises en ligne ; s'il demande un aperçu avant, ne pas reporter.
