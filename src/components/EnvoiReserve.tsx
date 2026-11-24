import { useEffect, useState } from 'react';
import { FileText, Send } from 'lucide-react';
import { db } from '../db/schema';
import { refReserve } from '../domain/statuts';
import { chargerChantier, nomFichier } from '../services/exports/donnees';
import { partager, taille, type FichierPret } from '../services/exports/partage';
import { lireProfil } from '../services/profil';
import { Sheet } from './ui';

/**
 * Fiche PDF d'une réserve à envoyer à l'entreprise (feuille de partage iOS : Mail, Messages, Fichiers…).
 * `nouvelle` : proposée juste après la création de la réserve.
 * Le PDF est préparé à l'ouverture ; l'envoi se fait au toucher (iOS exige un geste pour la feuille de partage).
 */
export function EnvoiReserve({ chantierId, rid, nouvelle, onClose }: { chantierId: number; rid: number; nouvelle?: boolean; onClose: () => void }) {
  const [fiche, setFiche] = useState<{ fichier: FichierPret; ref: string; entreprise: string; titre: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let abandon = false;
    (async () => {
      try {
        const [d, r, profil] = await Promise.all([chargerChantier(chantierId), db.reserves.get(rid), lireProfil()]);
        if (!r) throw new Error('Réserve introuvable');
        const { pdfFicheReserve } = await import('../services/exports/pdf');
        const ref = refReserve(r.numero);
        const site = nomFichier(d.ch.site.split(/[-·(]/)[0] || d.ch.nom);
        const fichier = await pdfFicheReserve(d, r, `${nomFichier('Reserve', ref, site)}.pdf`,
          { nom: profil.nom, fonction: profil.fonction, organisme: profil.organisme });
        if (!abandon) setFiche({ fichier, ref, entreprise: r.entreprise, titre: `Réserve ${ref} – ${d.ch.nom}` });
      } catch (e) {
        if (!abandon) setErreur((e as Error).message);
      }
    })();
    return () => { abandon = true; };
  }, [chantierId, rid]);

  const envoyer = async () => {
    if (!fiche) return;
    const r = await partager([fiche.fichier], fiche.titre);
    if (r !== 'annule') onClose();
  };

  return (
    <Sheet titre={nouvelle ? `Réserve ${fiche?.ref ?? ''} enregistrée` : 'Fiche de réserve'} sousTitre={fiche?.entreprise || undefined} onClose={onClose} auto
      pied={
        <div className="row">
          {nouvelle && <button type="button" className="btn sec tap" style={{ flex: '0 0 auto' }} onClick={onClose}>Plus tard</button>}
          <button type="button" className="btn block tap" disabled={!fiche} onClick={envoyer} aria-label="Envoyer à l’entreprise">
            {fiche ? <><Send size={22} strokeWidth={2.2} aria-hidden />{nouvelle ? 'Envoyer' : 'Envoyer à l’entreprise'}</> : <><span className="spinner" aria-hidden />Préparation…</>}
          </button>
        </div>
      }>
      <div className="stack" style={{ gap: 10 }}>
        <div>{nouvelle ? 'Envoyer la fiche PDF de cette réserve à l’entreprise ?' : 'Fiche PDF de la réserve, avec ses photos, à envoyer à l’entreprise.'}</div>
        {fiche && (
          <div className="card row" style={{ gap: 10 }}>
            <FileText size={24} strokeWidth={2} aria-hidden style={{ flex: '0 0 auto' }} />
            <span className="mono ellipsis" style={{ minWidth: 0, flex: '1 1 auto' }}>{fiche.fichier.nom}</span>
            <span className="mono ink2" style={{ flex: '0 0 auto' }}>{taille(fiche.fichier.blob.size)}</span>
          </div>
        )}
        {erreur && <div className="c-r" style={{ fontWeight: 600 }}>Fiche impossible : {erreur}</div>}
        <div className="ink2">La feuille de partage s’ouvre : choisissez Mail (ou Messages, Fichiers…).</div>
      </div>
    </Sheet>
  );
}
