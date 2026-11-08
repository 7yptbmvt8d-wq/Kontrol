import { CalendarPlus, ChevronRight } from 'lucide-react';
import { db, getReglage } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier } from '../domain/types';
import { PROFIL_DEFAUT, TYPE_REUNION, nouvelleReunion, type Profil } from '../domain/reunion';
import { fmtDate } from '../domain/dates';
import { Pastille, toast } from '../components/ui';
import { aller } from '../router';

export function OngletReunions({ chantier: ch }: { chantier: Chantier }) {
  const id = ch.id!;
  const reunions = useLive(`reunions:${id}`, () => db.reunions.where('chantierId').equals(id).reverse().sortBy('numero'), [id]);

  const demarrer = async () => {
    const [lots, intervenants, toutes] = await Promise.all([
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
      db.intervenants.where('chantierId').equals(id).toArray(),
      db.reunions.where('chantierId').equals(id).sortBy('numero'),
    ]);
    const precedente = toutes.at(-1);
    const profil = await getReglage<Profil>('profil', PROFIL_DEFAUT);
    const r = nouvelleReunion(id, (precedente?.numero ?? 0) + 1, intervenants, lots, precedente, new Date(), profil);
    const rid = (await db.reunions.add(r)) as number;
    if (r.observations.length) toast(`${r.observations.length} action(s) non soldée(s) reprise(s) de la réunion n°${precedente!.numero}`);
    aller('chantier', id, 'reunion', rid);
  };

  if (!reunions) return null;
  const enCours = reunions.find((r) => !r.cloturee);
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      {enCours ? (
        <button type="button" className="btn block tap" onClick={() => aller('chantier', id, 'reunion', enCours.id!)}>
          Reprendre la réunion n°{enCours.numero}
        </button>
      ) : (
        <button type="button" className="btn block tap" onClick={demarrer}>
          <CalendarPlus size={22} strokeWidth={2.2} aria-hidden />Démarrer une réunion
        </button>
      )}
      <div className="ink2" style={{ marginTop: 8 }}>
        Présences, observations et décisions par marché, revue des réserves et des points, puis compte rendu à coller dans Claude.
      </div>

      <h2 className="sec-title" style={{ margin: '20px 0 8px' }}>Réunions</h2>
      {reunions.length === 0 && <div className="card empty">Aucune réunion.</div>}
      <div className="stack" style={{ gap: 8 }}>
        {reunions.map((r) => {
          const presents = r.participants.filter((p) => p.presence === 'present').length;
          const absents = r.participants.filter((p) => p.presence === 'absent').length;
          return (
            <button key={r.id} type="button" className="card tap row" style={{ width: '100%', textAlign: 'left', padding: 14, justifyContent: 'space-between' }}
              onClick={() => aller('chantier', id, 'reunion', r.id!)}>
              <span style={{ minWidth: 0 }}>
                <span className="mono ink2" style={{ display: 'block' }}>N°{r.numero} · {fmtDate(r.date)} · {r.heure}</span>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>{TYPE_REUNION[r.type]}</span>
                <span className="ink2" style={{ display: 'block' }}>
                  {presents} présent{presents > 1 ? 's' : ''}{absents ? ` · ${absents} absent${absents > 1 ? 's' : ''}` : ''} · {r.observations.length} observation{r.observations.length > 1 ? 's' : ''}
                </span>
              </span>
              <span className="row" style={{ gap: 4, flex: '0 0 auto' }}>
                <Pastille ton={r.cloturee ? 'n' : 'b'}>{r.cloturee ? 'Clôturée' : 'En cours'}</Pastille>
                <ChevronRight size={20} aria-hidden className="ink2" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
