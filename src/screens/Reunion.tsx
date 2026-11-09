import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, Gavel, Pencil, Plus, Share2, Trash2, UserPlus, Users } from 'lucide-react';
import { db, getReglage } from '../db/schema';
import { useLive } from '../db/live';
import type { Observation, Participant, Presence, Reunion as TReunion, TypeReunion } from '../domain/types';
import { CLE_ENTITE_MOE, PRESENCE, PROFIL_DEFAUT, RESPONSABLES, TYPE_REUNION, changementsDepuis, compteRendu, nouvelId, participantEntiteMoe, pointsASuivre, type Profil } from '../domain/reunion';
import { ETAT_POINT, STATUT_RESERVE, refReserve, statutAffiche, bloquantNonValide } from '../domain/statuts';
import { ajouterJours, aujourdHui, fmtCourt, fmtDate } from '../domain/dates';
import { euros } from '../domain/penalites';
import { CodeLot, Header, Pastille, Segment, Sheet, toast } from '../components/ui';
import { BoutonDictee } from '../components/Dictee';
import { chargerChantier, horodatage, nomFichier } from '../services/exports/donnees';
import { partager, TYPES } from '../services/exports/partage';
import { aller, retour } from '../router';
import { SaisieReserve } from './SaisieReserve';
import { SaisiePenalite } from './SaisiePenalite';
import { enregistrerProfil, lireProfil } from '../services/profil';

type Etape = 'presences' | 'deroule' | 'cr';
const etapes = new Map<number, Etape>();
const lotsChoisis = new Map<number, string>();
const GENERAL = '';

export function Reunion({ chantierId, rid }: { chantierId: number; rid: number }) {
  const data = useLive(`reunion:${rid}`, async () => {
    const r = await db.reunions.get(rid);
    if (!r || r.chantierId !== chantierId) return null;
    const [d, precedente] = await Promise.all([
      chargerChantier(chantierId),
      db.reunions.where('chantierId').equals(chantierId).filter((x) => x.numero < r.numero).reverse().sortBy('numero').then((xs) => xs[0]),
    ]);
    return { r, d, precedente };
  }, [chantierId, rid]);
  const [etape, setEtapeEtat] = useState<Etape>(etapes.get(rid) ?? 'presences');
  const setEtape = (e: Etape) => { etapes.set(rid, e); setEtapeEtat(e); window.scrollTo(0, 0); };
  const [infos, setInfos] = useState(false);
  const retourListe = () => retour('chantier', chantierId, 'reunions');
  // Réunions créées avant l'ajout de la ligne « Maîtrise d'œuvre » : ajout (non pointée) sous le représentant du MOE
  useEffect(() => {
    const r = data?.r;
    if (!r || r.cloturee || r.participants.some((p) => p.cle === CLE_ENTITE_MOE)) return;
    void getReglage<Profil>('profil', PROFIL_DEFAUT).then((profil) => {
      const i = Math.max(0, r.participants.findIndex((p) => p.cle === 'moe')) + 1;
      const participants = [...r.participants];
      participants.splice(i, 0, participantEntiteMoe(profil));
      return db.reunions.update(rid, { participants });
    });
  }, [data?.r, rid]);

  if (data === undefined) return <main className="screen" />;
  if (data === null) return <main className="screen"><Header title="Réunion introuvable" onBack={retourListe} /></main>;
  const { r, d, precedente } = data;
  const maj = (patch: Partial<TReunion>) => db.reunions.update(rid, patch);
  const pointes = r.participants.filter((p) => p.presence).length;

  return (
    <main className="screen">
      <Header sub={`${fmtDate(r.date)} · ${r.heure}${r.lieu ? ` · ${r.lieu}` : ''}`} title={`${TYPE_REUNION[r.type]} n°${r.numero}`}
        onBack={retourListe} backLabel="Retour aux réunions"
        right={<button type="button" className="icon-btn tap" aria-label="Informations de la réunion" onClick={() => setInfos(true)}><Pencil size={22} aria-hidden /></button>} />
      {r.cloturee && <div className="pad" style={{ marginTop: 8 }}><Pastille ton="n">Réunion clôturée{r.clotureLe ? ` le ${fmtDate(r.clotureLe.slice(0, 10))}` : ''}</Pastille></div>}

      <div className="pad" style={{ marginTop: 12 }}>
        <div className="seg pill" role="group" aria-label="Étapes de la réunion">
          <button type="button" className="tap" aria-pressed={etape === 'presences'} aria-label={`Appel : ${pointes} pointés sur ${r.participants.length}`} onClick={() => setEtape('presences')}>
            Appel <span className="mono" style={{ marginLeft: 4 }}>{pointes}/{r.participants.length}</span>
          </button>
          <button type="button" className="tap" aria-pressed={etape === 'deroule'} onClick={() => setEtape('deroule')}>Déroulé</button>
          <button type="button" className="tap" aria-pressed={etape === 'cr'} aria-label="Compte rendu" onClick={() => setEtape('cr')}>CR</button>
        </div>
      </div>

      {etape === 'presences' && <Presences r={r} d={d} maj={maj} />}
      {etape === 'deroule' && <Deroule r={r} d={d} maj={maj} rid={rid} />}
      {etape === 'cr' && <CompteRendu r={r} d={d} precedente={precedente} maj={maj} />}

      {infos && <InfosReunion r={r} onClose={() => setInfos(false)} maj={maj} onSupprimer={async () => {
        if (!confirm(`Supprimer la réunion n°${r.numero} ? Ses présences et observations seront perdues.`)) return;
        await db.reunions.delete(rid); setInfos(false); retourListe();
      }} />}
    </main>
  );
}

type Maj = (patch: Partial<TReunion>) => Promise<unknown>;
type D = Awaited<ReturnType<typeof chargerChantier>>;

// ---------------------------------------------------------------- Présences
function Presences({ r, d, maj }: { r: TReunion; d: D; maj: Maj }) {
  const [fiche, setFiche] = useState<{ p?: Participant } | null>(null); // ajout (p absent) ou modification
  const [ficheMoe, setFicheMoe] = useState(false);
  const [penalite, setPenalite] = useState<Participant | null>(null);
  const pointer = (cle: string, presence: Presence) =>
    maj({ participants: r.participants.map((p) => (p.cle === cle ? { ...p, presence: p.presence === presence ? undefined : presence } : p)) });
  const groupes: [string, Participant[]][] = [
    ['', r.participants.filter((p) => !p.lotCode)],
    ...d.lots.map((l) => [l.code, r.participants.filter((p) => p.lotCode === l.code)] as [string, Participant[]]),
  ];
  const absenceDejaAppliquee = (p: Participant) =>
    d.appliquees.some((x) => x.lotCode === p.lotCode && x.date === r.date && /absen/i.test(x.motif));
  const article = (lot?: string) => d.penalites.find((b) => /absen/i.test(b.motif) && (!b.lotCode || b.lotCode === lot));

  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sec tap" style={{ flex: '1 1 auto', height: 48, fontSize: 16 }}
          onClick={() => maj({ participants: r.participants.map((p) => (p.presence || p.cle === CLE_ENTITE_MOE ? p : { ...p, presence: 'present' })) })}>
          <Check size={20} aria-hidden />Autres présents
        </button>
        <button type="button" className="btn sec tap" style={{ flex: '1 1 auto', height: 48, fontSize: 16 }} onClick={() => setFiche({})}>
          <UserPlus size={20} aria-hidden />Participant
        </button>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {groupes.filter(([, ps]) => ps.length).map(([code, ps]) => (
          <section key={code || 'gen'} className="card flush" aria-label={code ? `Lot ${code}` : 'Participants'}>
            <div className="grp-head">
              <div className="row" style={{ alignItems: 'baseline' }}>
                {code ? <CodeLot code={code} /> : <Users size={18} aria-hidden />}
                <span className="sec-title">{code ? d.lots.find((l) => l.code === code)?.intitule || code : 'Maîtrise d’œuvre et partenaires'}</span>
              </div>
            </div>
            {ps.map((p) => {
              const art = p.lotCode ? article(p.lotCode) : undefined;
              return (
                <div key={p.cle} style={{ borderTop: '1px solid var(--line)', padding: '8px 10px 8px 14px' }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    {p.cle === 'moe' || p.cle === CLE_ENTITE_MOE ? (
                      // Représentant du MOE et MOE : profil de l'utilisateur (aussi dans Réglages › Vous)
                      <button type="button" className="tap participant" aria-label={`Modifier ${p.nom}`} onClick={() => setFicheMoe(true)}>
                        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{p.nom}<Pencil size={16} strokeWidth={2.2} color="var(--accent)" aria-hidden style={{ marginLeft: 6, verticalAlign: '-2px' }} /></span>
                        <span className="ink2">{p.role || (p.cle === 'moe' ? 'Toucher pour saisir vos nom et fonction' : '')}</span>
                      </button>
                    ) : (
                      <button type="button" className="tap participant" aria-label={`Modifier ${p.nom}`} onClick={() => setFiche({ p })}>
                        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{p.nom}<Pencil size={16} strokeWidth={2.2} color="var(--accent)" aria-hidden style={{ marginLeft: 6, verticalAlign: '-2px' }} /></span>
                        {p.role && <span className="ink2">{p.role}</span>}
                      </button>
                    )}
                    <div className="presences" role="group" aria-label={`Présence de ${p.nom}`}>
                      {(['present', 'excuse', 'absent'] as Presence[]).map((v) => (
                        <button key={v} type="button" className={`tap${p.presence === v ? ` t-${v === 'present' ? 'g' : v === 'excuse' ? 'o' : 'r'}` : ''}`}
                          aria-pressed={p.presence === v} aria-label={PRESENCE[v]} onClick={() => pointer(p.cle, v)}>
                          {v === 'present' ? 'P' : v === 'excuse' ? 'E' : 'A'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {p.presence === 'absent' && p.lotCode && p.role === 'Titulaire' && (
                    absenceDejaAppliquee(p)
                      ? <div className="c-r" style={{ fontWeight: 600, marginTop: 4 }}>Pénalité d’absence appliquée</div>
                      : <button type="button" className="btn danger tap" style={{ height: 48, fontSize: 16, marginTop: 6, width: '100%' }} onClick={() => setPenalite(p)}>
                          <Gavel size={20} aria-hidden />Appliquer la pénalité d’absence{art ? ` (${art.montantOuTaux.split(' par ')[0]})` : ''}
                        </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="ink2" style={{ marginTop: 8 }}>P = présent · E = excusé · A = absent. Toucher à nouveau pour effacer.</div>
      <div style={{ height: 24 }} />
      {ficheMoe && <FicheMoe cloturee={!!r.cloturee} onClose={() => setFicheMoe(false)} />}
      {fiche && <FicheParticipant p={fiche.p} lots={d.lots.map((l) => l.code)} onClose={() => setFiche(null)}
        onEnregistrer={(x) => maj({ participants: fiche.p ? r.participants.map((y) => (y.cle === x.cle ? x : y)) : [...r.participants, x] })}
        onRetirer={fiche.p && (() => maj({ participants: r.participants.filter((y) => y.cle !== fiche.p!.cle) }))} />}
      {penalite && (
        <SaisiePenalite chantierId={r.chantierId} lots={d.lots} bareme={d.penalites} intervenants={d.intervenants}
          depuis={article(penalite.lotCode)} lotParDefaut={penalite.lotCode} datePre={r.date}
          notePre={`Absence non excusée à la ${TYPE_REUNION[r.type].toLowerCase()} n°${r.numero} du ${fmtDate(r.date)}`}
          onClose={() => setPenalite(null)} />
      )}
    </div>
  );
}

/** Représentant du MOE (vous) et organisme MOE : profil enregistré pour toutes les réunions en cours et Réglages › Vous. */
function FicheMoe({ cloturee, onClose }: { cloturee: boolean; onClose: () => void }) {
  const [v, setV] = useState<Profil | null>(null);
  useEffect(() => { void lireProfil().then(setV); }, []);
  if (!v) return null;
  const set = (k: keyof Profil, val: string) => setV((o) => ({ ...o!, [k]: val }));
  return (
    <Sheet titre="Maîtrise d’œuvre" sousTitre="Vous et l’organisme MOE" onClose={onClose} auto
      pied={<button type="button" className="btn block tap" onClick={async () => {
        await enregistrerProfil(v);
        toast('Enregistré');
        onClose();
      }}>Enregistrer</button>}>
      <div>
        <div className="frow"><label className="rl" htmlFor="fm-nom">Votre nom</label>
          <input id="fm-nom" value={v.nom} placeholder="ex. M. Dupont" autoComplete="name" onChange={(e) => set('nom', e.target.value)} /></div>
        <div className="frow"><label className="rl" htmlFor="fm-fct">Fonction</label>
          <input id="fm-fct" value={v.fonction} placeholder="Représentant du MOE" onChange={(e) => set('fonction', e.target.value)} /></div>
        <div className="frow" style={{ borderBottom: 0 }}><label className="rl" htmlFor="fm-org">Organisme MOE</label>
          <input id="fm-org" value={v.organisme} placeholder="ex. SID – USID de Corse" onChange={(e) => set('organisme', e.target.value)} /></div>
      </div>
      <div className="ink2" style={{ marginTop: 10 }}>
        Repris dans toutes les réunions non clôturées et dans Réglages › Vous.{cloturee ? ' Cette réunion est clôturée : rouvrez-la pour y reporter la modification.' : ''}
      </div>
    </Sheet>
  );
}

const ROLES = ['MOA', 'Contrôleur technique', 'CSPS'];

/** Ajout ou modification d'un participant de la liste d'appel (nom, rôle, lot) ; retrait de la réunion. */
function FicheParticipant({ p, lots, onClose, onEnregistrer, onRetirer }: {
  p?: Participant; lots: string[]; onClose: () => void; onEnregistrer: (p: Participant) => void; onRetirer?: () => void;
}) {
  const [nom, setNom] = useState(p?.nom ?? '');
  const [role, setRole] = useState(p ? (ROLES.includes(p.role) ? p.role : 'Autre') : 'MOA');
  const [autre, setAutre] = useState(p && !ROLES.includes(p.role) ? p.role : '');
  const [lot, setLot] = useState(p?.lotCode ?? '');
  const enregistrer = () => {
    if (!nom.trim()) { toast('Nom obligatoire'); return; }
    const r = role === 'Autre' ? autre.trim() || 'Autre' : role;
    onEnregistrer(p ? { ...p, nom: nom.trim(), role: r, lotCode: lot || undefined } : { cle: nouvelId(), nom: nom.trim(), role: r, lotCode: lot || undefined, presence: 'present' });
    onClose();
  };
  return (
    <Sheet titre={p ? 'Participant' : 'Ajouter un participant'} onClose={onClose} auto
      pied={
        <div className="row">
          {onRetirer && <button type="button" className="btn danger tap" aria-label="Retirer de la liste d’appel" onClick={() => {
            if (!confirm(`Retirer « ${p!.nom} » de la liste d’appel de cette réunion ?`)) return;
            void onRetirer(); onClose();
          }}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>{p ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="ap-nom">Nom</label>
          <input id="ap-nom" className="input" value={nom} placeholder="ex. M. Rossi (BA 126)" onChange={(e) => setNom(e.target.value)} />
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Rôle</div>
          <Segment<string> label="Rôle" valeur={role} onChange={setRole}
            options={[...ROLES, 'Autre'].map((x) => ({ v: x, l: x === 'Contrôleur technique' ? 'CT' : x, aria: x }))} />
          {role === 'Autre' && (
            <input className="input" style={{ marginTop: 8 }} aria-label="Fonction ou organisme" value={autre}
              placeholder="ex. Titulaire, BET structure, SDIS…" onChange={(e) => setAutre(e.target.value)} />
          )}
        </div>
        {lots.length > 0 && (
          <div className="frow">
            <label className="rl" htmlFor="ap-lot">Lot</label>
            <select id="ap-lot" value={lot} onChange={(e) => setLot(e.target.value)}>
              <option value="">Aucun</option>
              {lots.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
        {p?.intervenantId !== undefined && <div className="ink2">Modification valable pour cette réunion. Pour la garder aux suivantes, modifiez la fiche dans l’onglet Intervenants.</div>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Déroulé
function Deroule({ r, d, maj, rid }: { r: TReunion; d: D; maj: Maj; rid: number }) {
  const [lot, setLotEtat] = useState(lotsChoisis.get(rid) ?? GENERAL);
  const setLot = (l: string) => { lotsChoisis.set(rid, l); setLotEtat(l); };
  const [obs, setObs] = useState<Observation | 'nouvelle' | null>(null);
  const [reserve, setReserve] = useState(false);
  const [penalite, setPenalite] = useState(false);
  const today = aujourdHui();
  const observations = r.observations.filter((o) => (o.lotCode ?? GENERAL) === lot);
  const reserves = d.reserves.filter((x) => x.lotCode === lot && x.statut !== 'leve')
    .sort((a, b) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999'));
  const { prioritaires: points, autresBloquants } = lot ? pointsASuivre(d.points.filter((p) => p.lot === lot), d.ch, d.lots, today, d.jalons) : { prioritaires: [], autresBloquants: [] };
  const [voirBloquants, setVoirBloquants] = useState(false);
  const pens = d.appliquees.filter((p) => p.lotCode === lot);
  const aTraiter = (code: string) => r.observations.filter((o) => (o.lotCode ?? GENERAL) === code && !o.faite).length
    + (code ? d.reserves.filter((x) => x.lotCode === code && x.statut !== 'leve').length : 0);

  const enregistrerObs = (o: Observation) => {
    const existe = r.observations.some((x) => x.id === o.id);
    return maj({ observations: existe ? r.observations.map((x) => (x.id === o.id ? o : x)) : [...r.observations, o] });
  };

  return (
    <div>
      <div className="fchips" role="group" aria-label="Sujet">
        {[GENERAL, ...d.lots.map((l) => l.code)].map((code) => (
          <button key={code || 'gen'} type="button" className="fchip tap" aria-pressed={lot === code} onClick={() => setLot(code)}>
            <span className={code ? 'mono' : undefined}>{code || 'Généralités'}</span>
            {aTraiter(code) > 0 && <span className="mono" style={{ opacity: 0.8 }}>{aTraiter(code)}</span>}
          </button>
        ))}
      </div>

      <div className="pad" style={{ marginTop: 12 }}>
        {lot && (
          <div className="ink2" style={{ marginBottom: 10 }}>
            Marché {d.lots.find((l) => l.code === lot)?.numeroMarche || 'n° non renseigné'} · {d.intervenants.find((i) => i.lotCode === lot && i.role === 'titulaire')?.raisonSociale ?? '—'}
          </div>
        )}

        <h2 className="sec-title" style={{ marginBottom: 8 }}>Observations et décisions</h2>
        {observations.length === 0 && <div className="card empty" style={{ padding: 16 }}>Aucune observation.</div>}
        <div className="stack" style={{ gap: 8 }}>
          {observations.map((o) => (
            <div key={o.id} className="card row" style={{ padding: '6px 6px 6px 14px', gap: 8, opacity: o.faite ? 0.7 : 1 }}>
              <button type="button" className="tap" style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left', border: 0, background: 'transparent', padding: '6px 0', minHeight: 48 }}
                onClick={() => setObs(o)}>
                <div style={{ fontWeight: 600, textDecoration: o.faite ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>{o.texte}</div>
                <div className="ink2">
                  {o.responsable}{o.echeance ? <> · <span className="mono" style={{ color: !o.faite && o.echeance < today ? 'var(--r)' : undefined }}>{fmtDate(o.echeance)}</span></> : ''}
                  {o.reprise ? ` · reprise CR n°${o.reprise}` : ''}
                </div>
              </button>
              <button type="button" className={`icon-btn round tap${o.faite ? ' t-g' : ''}`} aria-pressed={o.faite} aria-label={o.faite ? 'Marquer non soldée' : 'Marquer soldée'}
                onClick={() => enregistrerObs({ ...o, faite: !o.faite })}><Check size={22} strokeWidth={2.6} aria-hidden /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn sec-acc block tap" style={{ marginTop: 8 }} onClick={() => setObs('nouvelle')}>
          <Plus size={22} strokeWidth={2.4} aria-hidden />Ajouter une observation
        </button>

        {lot && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', margin: '20px 0 8px' }}>
              <h2 className="sec-title">Réserves non levées <span className="mono ink2">{reserves.length}</span></h2>
              <button type="button" className="btn sec tap" style={{ height: 44, fontSize: 16, padding: '0 12px' }} onClick={() => setReserve(true)}>
                <Plus size={18} aria-hidden />Réserve
              </button>
            </div>
            {reserves.length === 0 ? <div className="card empty" style={{ padding: 16 }}>Aucune.</div> : (
              <div className="card flush">
                {reserves.map((x, i) => {
                  const st = STATUT_RESERVE[statutAffiche(x, today)];
                  return (
                    <button key={x.id} type="button" className="tap" onClick={() => aller('chantier', r.chantierId, 'reserve', x.id!)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '10px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="mono ink2">{refReserve(x.numero)} · {fmtCourt(x.echeance)}</span>
                        <Pastille ton={st.ton}>{st.libelle}</Pastille>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{x.description}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <h2 className="sec-title" style={{ margin: '20px 0 2px' }}>Points à suivre <span className="mono ink2">{points.length}</span></h2>
            <div className="ink2" style={{ marginBottom: 8 }}>Non conformes, en retard, en cours, échéance à 15 jours.</div>
            {points.length === 0 ? <div className="card empty" style={{ padding: 16 }}>Aucun.</div> : (
              <ListePoints points={points} chantierId={r.chantierId} />
            )}
            {autresBloquants.length > 0 && (
              <>
                <button type="button" className="btn sec block tap" style={{ marginTop: 8, height: 48, fontSize: 16 }} aria-expanded={voirBloquants} onClick={() => setVoirBloquants((x) => !x)}>
                  {voirBloquants ? 'Masquer' : 'Voir'} les {autresBloquants.length} autres points bloquants à faire
                </button>
                {voirBloquants && <div style={{ marginTop: 8 }}><ListePoints points={autresBloquants} chantierId={r.chantierId} /></div>}
              </>
            )}

            <div className="row" style={{ justifyContent: 'space-between', margin: '20px 0 8px' }}>
              <h2 className="sec-title">Pénalités <span className="mono ink2">{pens.length ? euros(pens.reduce((t, p) => t + p.montant, 0)) : ''}</span></h2>
              <button type="button" className="btn sec tap" style={{ height: 44, fontSize: 16, padding: '0 12px' }} onClick={() => setPenalite(true)}>
                <Gavel size={18} aria-hidden />Appliquer
              </button>
            </div>
          </>
        )}
        <div style={{ height: 24 }} />
      </div>

      {obs && <SaisieObservation obs={obs === 'nouvelle' ? undefined : obs} lotCode={lot || undefined}
        onClose={() => setObs(null)} onEnregistrer={enregistrerObs}
        onSupprimer={(o) => maj({ observations: r.observations.filter((x) => x.id !== o.id) })} />}
      {reserve && <SaisieReserve chantierId={r.chantierId} pre={{ lotCode: lot, origine: 'cr' }} onClose={() => setReserve(false)} />}
      {penalite && <SaisiePenalite chantierId={r.chantierId} lots={d.lots} bareme={d.penalites} intervenants={d.intervenants}
        lotParDefaut={lot} datePre={r.date} notePre={`${TYPE_REUNION[r.type]} n°${r.numero} du ${fmtDate(r.date)}`} onClose={() => setPenalite(false)} />}
    </div>
  );
}

const DELAIS = [8, 15, 30];

function SaisieObservation({ obs, lotCode, onClose, onEnregistrer, onSupprimer }: {
  obs?: Observation; lotCode?: string; onClose: () => void; onEnregistrer: (o: Observation) => Promise<unknown>; onSupprimer: (o: Observation) => Promise<unknown>;
}) {
  const [texte, setTexte] = useState(obs?.texte ?? '');
  const [responsable, setResponsable] = useState(obs?.responsable ?? (lotCode ? 'Entreprise' : 'MOE'));
  const [echeance, setEcheance] = useState(obs?.echeance ?? '');
  const zone = useRef<HTMLTextAreaElement>(null);
  const valider = async () => {
    if (!texte.trim()) { toast('Texte obligatoire'); zone.current?.focus(); return; }
    await onEnregistrer({ id: obs?.id ?? nouvelId(), lotCode: obs ? obs.lotCode : lotCode, texte: texte.trim(), responsable, echeance: echeance || undefined, faite: obs?.faite ?? false, reprise: obs?.reprise });
    onClose();
  };
  return (
    <Sheet titre={obs ? 'Observation' : 'Nouvelle observation'} sousTitre={lotCode ? `Lot ${lotCode}` : 'Généralités'} onClose={onClose}
      pied={
        <div className="row">
          {obs && <button type="button" className="btn danger tap" aria-label="Supprimer l’observation" onClick={async () => { if (confirm('Supprimer cette observation ?')) { await onSupprimer(obs); onClose(); } }}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={valider}>Enregistrer</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <div className="saisie-desc">
          <label htmlFor="ob-txt" className="saisie-desc-lbl">Observation, décision ou action</label>
          <textarea id="ob-txt" ref={zone} className="textarea" value={texte} onChange={(e) => setTexte(e.target.value)} style={{ minHeight: 120 }} />
          <BoutonDictee cible={zone} onTexte={(t) => setTexte((x) => (x ? `${x.replace(/\s+$/, '')} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Responsable</div>
          <div className="fchips" style={{ padding: 0, flexWrap: 'wrap' }}>
            {RESPONSABLES.map((x) => (
              <button key={x} type="button" className="fchip tap" aria-pressed={responsable === x} onClick={() => setResponsable(x)}>{x === 'Contrôleur technique' ? 'CT' : x}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="row lbl" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span>Échéance</span><span className="mono" style={{ color: 'var(--ink)' }}>{echeance ? fmtDate(echeance) : 'aucune'}</span>
          </div>
          <div className="seg pill" role="group" aria-label="Échéance">
            <button type="button" className="tap" aria-pressed={!echeance} onClick={() => setEcheance('')}>Aucune</button>
            {DELAIS.map((n) => {
              const v = ajouterJours(aujourdHui(), n);
              return <button key={n} type="button" className="tap" aria-pressed={echeance === v} onClick={() => setEcheance(v)}>+{n} j</button>;
            })}
          </div>
          <input type="date" className="input mono" aria-label="Autre date d’échéance" style={{ marginTop: 8 }} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Compte rendu
function CompteRendu({ r, d, precedente, maj }: { r: TReunion; d: D; precedente?: TReunion; maj: Maj }) {
  const texte = compteRendu(r, d, precedente);
  const [apercu, setApercu] = useState(false);
  const c = precedente ? changementsDepuis(precedente.creeLe, d) : undefined;
  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); toast('Copié : collez-le dans Claude pour rédiger le CR'); }
    catch { toast('Copie refusée : utilisez « Partager »'); }
  };
  const resume = c ? [
    [c.reservesLevees.length, 'réserve(s) levée(s)'], [c.leveesSignalees.length, 'levée(s) à vérifier'], [c.reservesCreees.length, 'nouvelle(s) réserve(s)'],
    [c.reservesRelancees.length, 'relance(s)'], [c.pointsValides.length, 'point(s) validé(s)'], [c.pointsNonConformes.length, 'non-conformité(s)'],
    [c.penalites.length, 'pénalité(s)'], [c.jalonsFaits.length, 'jalon(s) réalisé(s)'],
  ].filter(([n]) => (n as number) > 0) : [];

  return (
    <div className="pad" style={{ marginTop: 12 }}>
      {precedente && (
        <section className="card" style={{ padding: 14, marginBottom: 12 }} aria-label="Depuis la réunion précédente">
          <div className="sec-title">Depuis la réunion n°{precedente.numero} du {fmtDate(precedente.date)}</div>
          {resume.length === 0 ? <div className="ink2" style={{ marginTop: 4 }}>Aucun changement enregistré.</div> : (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {resume.map(([n, lib]) => <span key={lib as string} className="chip t-b"><span className="mono">{n as number}</span> {lib as string}</span>)}
            </div>
          )}
        </section>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn block tap" style={{ flex: '1 1 auto' }} onClick={copier}><ClipboardCopy size={20} aria-hidden />Copier pour Claude</button>
        <button type="button" className="btn sec tap" style={{ flex: '0 0 56px', height: 56, padding: 0 }} aria-label="Partager le compte rendu"
          onClick={() => partager([{ nom: `${nomFichier('CR', `n${r.numero}`, d.ch.site.split(/[-·(]/)[0] || d.ch.nom, horodatage())}.txt`, blob: new Blob([texte], { type: TYPES.txt }) }])}>
          <Share2 size={20} aria-hidden />
        </button>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="cr-proch">Prochaine réunion</label>
        <div className="row">
          <input id="cr-proch" type="date" className="input mono" style={{ flex: '1 1 auto', minWidth: 0 }} value={r.prochaine ?? ''} onChange={(e) => maj({ prochaine: e.target.value || undefined })} />
          <button type="button" className="btn sec tap" style={{ height: 48, fontSize: 16, padding: '0 12px', whiteSpace: 'nowrap', flex: '0 0 auto' }} onClick={() => maj({ prochaine: ajouterJours(r.date, 7) })}>+7 j</button>
          <button type="button" className="btn sec tap" style={{ height: 48, fontSize: 16, padding: '0 12px', whiteSpace: 'nowrap', flex: '0 0 auto' }} onClick={() => maj({ prochaine: ajouterJours(r.date, 14) })}>+14 j</button>
        </div>
      </div>

      <button type="button" className="row tap" aria-expanded={apercu} onClick={() => setApercu((x) => !x)}
        style={{ width: '100%', justifyContent: 'space-between', border: 0, background: 'transparent', padding: 0, margin: '12px 0 4px', minHeight: 48 }}>
        <span className="sec-title">Aperçu du compte rendu</span><span className="ink2">{apercu ? 'Masquer' : 'Afficher'}</span>
      </button>
      {apercu && <pre className="card cr-texte">{texte}</pre>}

      <button type="button" className={`btn block tap${r.cloturee ? ' sec' : ' ok'}`} style={{ marginTop: 12 }}
        onClick={() => maj(r.cloturee ? { cloturee: false, clotureLe: undefined } : { cloturee: true, clotureLe: new Date().toISOString() })}>
        {r.cloturee ? 'Rouvrir la réunion' : <><Check size={22} strokeWidth={2.6} aria-hidden />Clôturer la réunion</>}
      </button>
      <div className="ink2" style={{ marginTop: 6 }}>Les actions non soldées seront reprises automatiquement à la réunion suivante.</div>
      <div style={{ height: 24 }} />
    </div>
  );
}

function InfosReunion({ r, onClose, maj, onSupprimer }: { r: TReunion; onClose: () => void; maj: Maj; onSupprimer: () => void }) {
  const [v, setV] = useState({ type: r.type, date: r.date, heure: r.heure, lieu: r.lieu });
  return (
    <Sheet titre={`Réunion n°${r.numero}`} onClose={onClose} auto
      pied={
        <div className="row">
          <button type="button" className="btn danger tap" aria-label="Supprimer la réunion" onClick={onSupprimer}><Trash2 size={22} aria-hidden /></button>
          <button type="button" className="btn block tap" onClick={async () => { await maj(v); onClose(); }}>Enregistrer</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <Segment<TypeReunion> label="Type de réunion" valeur={v.type} onChange={(type) => setV((o) => ({ ...o, type }))}
          options={[{ v: 'chantier', l: 'Chantier' }, { v: 'preparation', l: 'Prépa.' }, { v: 'opr', l: 'OPR' }, { v: 'autre', l: 'Autre' }]} />
        <div>
          <div className="frow"><label className="rl" htmlFor="ir-date">Date</label>
            <input id="ir-date" type="date" className="mono" value={v.date} onChange={(e) => setV((o) => ({ ...o, date: e.target.value }))} /></div>
          <div className="frow"><label className="rl" htmlFor="ir-h">Heure</label>
            <input id="ir-h" type="time" className="mono" value={v.heure} onChange={(e) => setV((o) => ({ ...o, heure: e.target.value }))} /></div>
          <div className="frow" style={{ borderBottom: 0 }}><label className="rl" htmlFor="ir-lieu">Lieu</label>
            <input id="ir-lieu" value={v.lieu} placeholder="ex. base vie, bât. 342" onChange={(e) => setV((o) => ({ ...o, lieu: e.target.value }))} /></div>
        </div>
      </div>
    </Sheet>
  );
}

function ListePoints({ points, chantierId }: { points: import('../domain/types').PointControle[]; chantierId: number }) {
  return (
    <div className="card flush">
      {points.map((p, i) => {
        const e = ETAT_POINT[p.etat];
        const blo = bloquantNonValide(p);
        return (
          <button key={p.uid} type="button" className={`tap${blo ? ' alert' : ''}`} onClick={() => aller('chantier', chantierId, 'point', p.uid!)}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: blo ? undefined : 'transparent', padding: '10px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="mono ink2 ellipsis">{p.articleCctp || p.id}</span>
              <Pastille ton={e.ton}>{e.libelle}</Pastille>
            </div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{p.intitule}</div>
          </button>
        );
      })}
    </div>
  );
}
