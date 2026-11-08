/** Forme d'un identifiant client Google : « <n° de projet>-<code>.apps.googleusercontent.com ». */
const MOTIF = /\d+-[a-z0-9]+\.apps\.googleusercontent\.com/i;

/**
 * Extrait l'identifiant client OAuth d'un texte collé (iPhone : espaces insécables, caractères invisibles,
 * retour à la ligne au milieu, texte autour comme « ID client »…). Renvoie null si aucun identifiant n'est reconnu.
 */
export function extraireIdClient(texte: string): string | null {
  const net = texte.replace(/[​-‍⁠﻿]/g, '');
  const m = net.match(MOTIF) ?? net.replace(/\s/g, '').match(MOTIF);
  return m ? m[0].toLowerCase() : null;
}
