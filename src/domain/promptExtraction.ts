// Prompt à coller dans Claude avec le CCTP, le CCAP et les actes d'engagement pour obtenir le JSON d'import.
// Rédigé par l'utilisateur, complété pour que Kontrol calcule toutes les dates (période de préparation, fin_preparation,
// garanties, échéances en texte reconnues par echeanceEvenement). À tenir aligné sur src/domain/import.ts.
export const PROMPT_EXTRACTION = `À partir des pièces jointes (CCTP, CCAP, actes d'engagement), produis un fichier JSON d'extraction
pour mon application de suivi de chantier. Livre-le sous forme de fichier téléchargeable
nommé chantier-<site>.json. Le JSON doit être strictement valide, sans commentaire.

RÈGLES
- Un lot = un marché : chaque lot a son propre numero_marche (acte d'engagement) et son titulaire.
- Points de contrôle : extrais du CCTP tout ce que le MOE doit vérifier ou obtenir :
  documents à remettre, agréments/visas de matériaux, points d'arrêt, contrôles,
  essais, prescriptions d'exécution importantes. Vise 10 à 40 points par lot, sans doublon.
  - id : "<LOT>-<article>-<n°>" (ex. GO-3.2-01), unique.
  - phase : preparation | execution | reception | cloture
  - type : document | agrement | point_arret | controle | essai | prescription
  - responsable : entreprise | moe | controleur_technique | csps
  - critere_acceptation : critère mesurable tiré du CCTP (valeur, tolérance, norme).
  - reference : NF DTU, norme NF EN, arrêté… cités dans l'article.
  - echeance : {"type":"relative","valeur":"J+30"} = 30 jours après l'OS de démarrage ;
    {"type":"evenement","valeur":"avant coulage"} ; {"type":"date","valeur":"JJ/MM/AAAA"}.
    Pour les échéances liées au marché, utilise exactement ces formulations :
    "avant fin de la période de préparation", "avant le début des travaux",
    "à la demande de réception", "à la réception", "pendant la GPA",
    avec un décalage éventuel : "15 jours avant la réception", "dans le mois suivant la réception".
  - bloquant : true si le point conditionne la suite des travaux (point d'arrêt, agrément
    préalable, essai avant fermeture/enrobage), sinon false.
    Une simple remise de document (attestation, planning, PPSPS…) n'est pas bloquante,
    sauf si le CCAP en fait explicitement une condition préalable au démarrage des travaux.
- Jalons : extrais du CCAP les délais et échéances : période de préparation, délai d'exécution
  (categorie "delai", référence OS_demarrage), remise des documents d'exécution, DOE,
  projet de décompte final, garanties (GPA, biennale, décennale).
  - echeance.reference : OS_demarrage | fin_preparation | reception | autre ; echeance.jours : entier.
  - Période de préparation : un jalon categorie "delai", intitulé commençant par
    "Période de préparation", référence OS_demarrage, jours = sa durée. Si le CCAP précise
    qu'elle n'est pas comprise dans le délai d'exécution, écris-le dans l'intitulé
    ("non comprise dans le délai d'exécution").
  - Délai d'exécution : un jalon categorie "delai", référence OS_demarrage, jours = délai.
  - Ce qui est dû à l'expiration de la période de préparation : référence fin_preparation, jours 0.
  - Garanties : référence reception ; GPA 365 j, biennale 730 j, décennale 3650 j.
  - Convertis les mois en jours calendaires (1 mois = 30 j, 1 an = 365 j).
  - "lot" : uniquement si le jalon est propre à un lot ; sinon "" (commun à tous les lots).
- Pénalités : toutes celles du CCAP (motif, montant ou taux, article). "lot" seulement si
  propre à un lot, sinon "".
- N'invente rien : si une information est absente des pièces, laisse le champ vide ("").
  Indique-moi ensuite, hors du fichier, la liste de ce qui manquait.

FORMAT
{
  "chantier": { "nom": "", "operation": "", "site": "",
    "lots": [{ "code": "GO", "intitule": "", "numero_marche": "", "titulaire": "", "sous_traitants": [] }] },
  "points_controle": [{ "id": "", "lot": "", "article_cctp": "", "phase": "", "type": "",
    "intitule": "", "critere_acceptation": "", "reference": "", "responsable": "",
    "echeance": { "type": "", "valeur": "" }, "bloquant": false }],
  "jalons": [{ "id": "", "lot": "", "categorie": "delai | documentaire | reception | garantie | paiement",
    "intitule": "", "article_ccap": "", "echeance": { "reference": "", "jours": 0 } }],
  "penalites": [{ "lot": "", "motif": "", "montant_ou_taux": "", "article_ccap": "" }]
}
`;
