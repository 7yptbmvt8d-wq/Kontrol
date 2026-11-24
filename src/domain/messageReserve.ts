// Message accompagnant l'envoi de la fiche d'une réserve à l'entreprise (objet + corps du mail), logique pure, testée.
import type { Chantier, Lot, Reserve } from './types';
import type { Profil } from './reunion';
import { refReserve } from './statuts';
import { fmtDate } from './dates';

export function messageReserve(r: Reserve, ch: Chantier, lot: Lot | undefined, profil: Profil): { objet: string; corps: string } {
  const ref = refReserve(r.numero);
  const resume = r.description.length > 60 ? `${r.description.slice(0, 59).trimEnd()}…` : r.description;
  const marche = lot ? `marché ${lot.numeroMarche ? `n° ${lot.numeroMarche} ` : ''}– lot ${lot.code}${lot.intitule ? ` ${lot.intitule}` : ''}` : `lot ${r.lotCode}`;
  const signature = [profil.nom, profil.fonction, profil.organisme].map((x) => x.trim()).filter(Boolean);
  const corps = [
    'Madame, Monsieur,',
    '',
    `Veuillez trouver ci-joint la fiche de la réserve ${ref} relevée le ${fmtDate(r.creeLe.slice(0, 10))} sur le chantier « ${ch.nom} » (${marche}) :`,
    `« ${r.description} »${r.localisation ? `\nLocalisation : ${r.localisation}` : ''}`,
    '',
    r.echeance
      ? `Je vous remercie de bien vouloir lever cette réserve avant le ${fmtDate(r.echeance)} et de m’en informer, photos à l’appui.`
      : 'Je vous remercie de bien vouloir lever cette réserve dans les meilleurs délais et de m’en informer, photos à l’appui.',
    '',
    'Cordialement,',
    ...signature,
  ].join('\n');
  return { objet: `${ch.nom} – Réserve ${ref} – ${resume}`, corps };
}
