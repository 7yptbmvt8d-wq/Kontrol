# Kontrol — spécification design (pour Claude Code)

PWA mobile de suivi de chantier (MOE, ministère des Armées). Usage terrain : plein soleil, gants, une main.
Direction retenue : **B « Poste de commande »** — sombre par défaut, ardoise + accent violet, IBM Plex Sans / Mono.

Fichiers fournis avec ce document :
- `tokens.css` — toutes les variables (couleurs clair/sombre, typo, rayons, tailles tactiles). **Source de vérité : ne jamais coder une couleur en dur.**
- `maquettes/*.dc.html` — maquettes de référence des 8 écrans + icône (HTML, styles inline lisibles). Les reproduire fidèlement ; les données sont fictives.
- `icon.svg` — icône d'app.

---

## 1. Règles non négociables

1. Texte ≥ 16 px partout (labels, métadonnées compris). Champs et titres de ligne : 17 px.
2. Zone tactile ≥ 48 × 48 px pour tout élément cliquable. Bouton principal : 56 px de haut. FAB : 64 px.
3. Le statut n'est **jamais** porté par la couleur seule : toujours pastille + libellé (et pictogramme pour « bloquant »).
4. Contraste texte ≥ 4.5:1 dans les deux modes (les tokens fournis le respectent).
5. Safe areas : `viewport-fit=cover` + `env(safe-area-inset-*)`. Barre d'action basse = 12 px + inset bas.
6. Mode sombre par défaut ; bascule clair dans les réglages + respect de `prefers-color-scheme`.
7. Format de référence : iPhone 390 × 844. Marges latérales 16 px.
8. Composants accessibles natifs : `<button>`, `<a>`, `<input>`, `<label>` ; `aria-label` sur les boutons-icônes ; `aria-current="page"` sur l'onglet actif ; `aria-pressed` sur les segments.
9. Icônes : SVG trait (stroke 2–2.4, `currentColor`, extrémités arrondies). Pas d'emoji. Lucide convient.

## 2. Code couleur des statuts

| Couleur | Réserves | Points de contrôle | Jalons |
|---|---|---|---|
| Rouge `--r` | En retard | Non conforme, **bloquant** | En retard |
| Orange `--o` | Relancée | À revoir | — |
| Bleu `--b` | Ouverte | À contrôler | À venir |
| Vert `--g` | Levée | Conforme | Fait |
| Gris `--n` | Sans objet | Sans objet | — |

Pastille de statut : hauteur 30 px, rayon pilule, fond `--x-bg`, texte `--x`, 16 px / 600, point de 8 px en `currentColor` avant le libellé.
Élément bloquant ou en retard (ligne, carte, jalon) : fond `--r-bg` + contour intérieur 2 px `--r`.

## 3. Typographie

- IBM Plex Sans : interface. Graisses 400 / 600 / 700.
- IBM Plex Mono 500/600 : **références et données** — n° de réserve (R-06), article CCTP (§3.4.2), dates, compteurs, pourcentages, code site (CAMP NORD · B12).
- Échelle : H1 30/700 (Accueil), titre d'écran 20–24/700, titre de section 17/700, élément 17/600, corps 16/400–600, bouton 18/600.

## 4. Composants

- **En-tête d'écran** : bouton retour 48 px (chevron) + bloc 2 lignes : ligne mono `--ink2` (site · bât · avancement) + titre 20/700.
- **Onglets chantier** (Checklist, Réserves, Jalons, Intervenants) : contrôle segmenté, conteneur `--surface2` rayon 16, padding 4 ; onglet 44 px, actif = fond `--surface`.
- **Puce de filtre** : 48 px, pilule, bord `--line`, fond `--surface`. Active = fond `--accent`, texte `--on-accent`. Compteur en mono dans la puce. Pastille de couleur 10 px pour les filtres de statut.
- **Carte de section** : `--surface`, bord 1 px `--line`, rayon 18, padding 14–16.
- **Ligne de réserve** : carte rayon 16, padding 12 ; vignette 64 × 64 rayon 12 ; ligne 1 = réf mono + pastille à droite ; ligne 2 = description 17/600 ; ligne 3 = entreprise (gauche) + échéance mono (droite, rouge si dépassée avec « +N j »).
- **Ligne de point de contrôle** : dans une carte groupée par lot (code lot mono `--accent`) puis phase, compteur « 14/22 » à droite ; réf CCTP mono + pastille d'état ; titre 17/600 ; si bloquant : mention « Point bloquant · motif » en rouge avec pictogramme triangle.
- **Segment de choix** (lot, gravité, état, échéance) : boutons 48 px côte à côte, `--surface2`, bord `--line`. Sélectionné = fond `--acc-bg`, contour 2 px `--accent`. Pour l'état d'un point : sélectionné prend la couleur du statut.
- **Bouton principal** : 56 px, rayon 16, `--accent` / `--on-accent`, 18/600, icône 22 px optionnelle. Variante validation (lever une réserve) : `--g` / `--on-g`.
- **Bouton secondaire** : 52–56 px, `--surface`, bord `--line` ; ou `--acc-bg` + bord `--accent`.
- **FAB « + »** : rond 64 px, `--accent`, ombre `0 8px 24px rgba(0,0,0,.35)`, à 20 px du bord droit, au-dessus de l'inset bas.
- **Panneau du bas (bottom sheet)** : fond `--surface`, rayon haut 28, poignée 40 × 5, voile `--scrim` derrière, ouvert jusqu'à ~64 px du haut.
- **Frise (historique, jalons)** : point 12 px coloré par statut + trait vertical 2 px `--line` ; dates en mono.
- **Barre d'action basse** : fixe, fond `--bg`, bord haut `--line`, padding 12 / 16 / inset bas.

## 5. Écrans

1. **Accueil – Mes chantiers** : en-tête (logo + puce « Drive 16:42 » verte) ; date du jour ; H1 ; bandeau 3 compteurs cumulés (ouvertes bleu, en retard rouge, bloquants rouge ; tuiles fond teinté, chiffre mono 30) ; cartes chantier (code site mono, phase, nom, barre d'avancement accent + %, 3 puces compteurs, grises si 0) ; barre basse « Nouveau chantier ».
2. **Fiche chantier – Checklist** : en-tête + bouton exports ; onglets ; barre d'avancement empilée (vert conforme / rouge non conforme / orange à revoir) + « 34/58 » ; filtres Tous / Bloquants / À contrôler ; points groupés lot > phase.
3. **Détail d'un point** : badge Bloquant + réf CCTP ; titre ; carte clé/valeur (Type, Critère d'acceptation, Référentiel NF/DTU en mono, Échéance) ; segment État (Conforme / Non conf. / À revoir / S.O.) ; commentaire ; photos 72 px + tuile d'ajout pointillée ; barre basse « Créer une réserve » (pré-remplit la saisie : lot, localisation, origine CCTP).
4. **Onglet Réserves** : filtres statut avec compteurs (Toutes, Retard, Relancées, Ouvertes…, défilement horizontal) ; filtres Lot ▾ / Entreprise ▾ ; bouton tri ; liste ; FAB.
5. **Saisie rapide** (bottom sheet ouvert par le FAB) — **objectif 30 s** : photo en premier (vignette + grande tuile d'ajout) ; Lot (segment) ; Entreprise (déduite du lot, modifiable) ; Localisation (mémoriser la dernière saisie) ; Description + bouton dictée 48 px (Web Speech API) ; Gravité (Mineure / Majeure / Bloquante) ; Échéance (+8 j / +15 j / +30 j / calendrier, date calculée affichée) ; « Enregistrer la réserve ». Valeurs par défaut pré-sélectionnées pour ne toucher que l'essentiel.
6. **Détail réserve et levée** : statut en haut à droite ; réf · lot · entreprise ; photos Avant / Après (étiquettes datées rouge / vert) ; grille 2×2 (localisation, gravité, échéance, origine) ; historique ; barre basse « Refuser » + « Lever la réserve » (vert ; exige une photo « après »).
7. **Onglet Jalons** : carte délai (J+n / total, barre temps écoulé + repère avancement travaux, fin contractuelle) ; frise des jalons (notification, fin de préparation, OS de démarrage, visas, fin de délai / réception, DOE, fin de GPA) ; dates calculées à partir de la date d'OS et des durées du marché ; jalon dépassé encadré rouge avec « +N j ».
8. **Exports et sauvegarde** : carte Drive (état, horodatage, dossier, contenu, interrupteur sauvegarde auto, « Sauvegarder maintenant ») ; liste d'exports, chacun avec boutons PDF et XLSX : points non soldés, liste des réserves (selon filtres actifs), réserves par entreprise, état des jalons.

## 6. Icône

K blanc dont la jambe est une coche violette, sur fond ardoise `#1B263B`, rayon ~22 %. Voir `icon.svg`. Décliner en 180 / 192 / 512 px (manifest PWA, apple-touch-icon) ; prévoir une version maskable avec marge de sécurité de 10 %.

## 7. Comportements

- Retour visuel au toucher immédiat (opacité ou fond `--surface2`), pas d'animation > 200 ms.
- Saisie hors ligne : enregistrer localement, synchroniser ensuite ; la puce Drive passe en orange « En attente » puis verte.
- Dates au format JJ/MM/AAAA (JJ/MM dans les listes), heure 24 h.
- Les écarts d'échéance s'affichent « +N j » (retard) en rouge.
