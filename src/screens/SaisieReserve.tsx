import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Camera, Images, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { Gravite, Origine, Reserve } from '../domain/types';
import { ORIGINE, refReserve } from '../domain/statuts';
import { ajouterJours, aujourdHui, fmtDate, fmtHeure } from '../domain/dates';
import { Segment, Sheet, toast } from '../components/ui';
import { EntreesPhotos, Vignette } from '../components/Photos';
import { BoutonDictee } from '../components/Dictee';
import { enregistrerPhotos } from '../services/photos';
import { creerReserve, lireMemoire, modifier, supprimer } from '../services/reserves';
import { retour } from '../router';

export interface Preremplissage { lotCode?: string; description?: string; origine?: Origine; pointId?: string }

const DELAIS = [8, 15, 30];
const AUTRE = '__autre__';

/**
 * Saisie rapide d'une réserve (objectif 30 s) : valeurs par défaut pré-sélectionnées, dernière saisie mémorisée.
 * `reserve` fourni = modification.
 */
export function SaisieReserve({ chantierId, reserve, pre, onClose, onCree }: {
  chantierId: number; reserve?: Reserve; pre?: Preremplissage; onClose: () => void; onCree?: (r: Reserve) => void;
}) {
  const ctx = useLive(`saisie-ctx:${chantierId}`, async () => {
    const [ch, lots, inter, reserves, memoire] = await Promise.all([
      db.chantiers.get(chantierId),
      db.lots.where('chantierId').equals(chantierId).sortBy('ordre'),
      db.intervenants.where('chantierId').equals(chantierId).toArray(),
      db.reserves.where('chantierId').equals(chantierId).toArray(),
      lireMemoire(chantierId),
    ]);
    const localisations = [...new Set(reserves.map((r) => r.localisation).filter(Boolean))].sort();
    return { ch: ch!, lots, inter, localisations, memoire };
  }, [chantierId]);

  const [v, setV] = useState<Partial<Reserve> | null>(reserve ?? null);
  const [delai, setDelai] = useState<number | 'date'>(reserve ? 'date' : 15);
  const [autreEntreprise, setAutreEntreprise] = useState(false);
  const [photosEnCours, setPhotosEnCours] = useState(false);
  const nouvellesPhotos = useRef<number[]>([]); // supprimées si on ferme sans enregistrer
  const enregistre = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const phototheque = useRef<HTMLInputElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);

  const entreprisesDuLot = (lot: string) => {
    if (!ctx) return [];
    const liste = ctx.inter.filter((i) => i.lotCode === lot && (i.role === 'titulaire' || i.role === 'sous_traitant'))
      .sort((a, b) => (a.role === 'titulaire' ? -1 : 0) - (b.role === 'titulaire' ? -1 : 0));
    return [...new Set(liste.map((i) => i.raisonSociale))];
  };
  const entrepriseParDefaut = (lot: string) => ctx?.memoire.entreprises[lot] ?? entreprisesDuLot(lot)[0] ?? '';

  // Initialisation (création) dès que le contexte est chargé
  useEffect(() => {
    if (!ctx || v) return;
    const lot = pre?.lotCode ?? (ctx.lots.some((l) => l.code === ctx.memoire.lot) ? ctx.memoire.lot! : ctx.lots[0]?.code ?? '');
    setV({
      chantierId, lotCode: lot, entreprise: entrepriseParDefaut(lot), localisation: ctx.memoire.localisation ?? '',
      description: pre?.description ?? '', gravite: 'majeure', echeance: ajouterJours(aujourdHui(), 15),
      origine: pre?.origine ?? 'visite', pointId: pre?.pointId, photoIds: [],
    });
  }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Photos prises mais réserve non enregistrée : nettoyage à la fermeture
  useEffect(() => () => {
    if (!enregistre.current && nouvellesPhotos.current.length) void db.photos.bulkDelete(nouvellesPhotos.current);
  }, []);

  if (!ctx || !v) return <Sheet titre={reserve ? 'Modifier la réserve' : 'Nouvelle réserve'} onClose={onClose}><div /></Sheet>;
  const set = <K extends keyof Reserve>(k: K, val: Reserve[K]) => setV((o) => ({ ...o!, [k]: val }));
  const choixEntreprises = entreprisesDuLot(v.lotCode!);
  if (v.entreprise && !choixEntreprises.includes(v.entreprise)) choixEntreprises.push(v.entreprise);

  const ajouterPhotos = async (fichiers: File[]) => {
    setPhotosEnCours(true);
    try {
      const ids = await enregistrerPhotos(chantierId, fichiers);
      nouvellesPhotos.current.push(...ids);
      setV((o) => ({ ...o!, photoIds: [...(o!.photoIds ?? []), ...ids] }));
    } catch (e) {
      toast(`Photo non enregistrée : ${(e as Error).message}`);
    } finally {
      setPhotosEnCours(false);
    }
  };
  const retirerPhoto = (id: number) => {
    setV((o) => ({ ...o!, photoIds: o!.photoIds!.filter((x) => x !== id) }));
    if (nouvellesPhotos.current.includes(id)) void db.photos.delete(id);
  };

  const choisirDelai = (d: number) => { setDelai(d); set('echeance', ajouterJours(aujourdHui(), d)); };

  const enregistrer = async () => {
    if (!v.description?.trim()) { toast('Description obligatoire'); description.current?.focus(); return; }
    if (photosEnCours) { toast('Photo en cours de traitement…'); return; }
    const champs = {
      lotCode: v.lotCode!, entreprise: (v.entreprise ?? '').trim(), localisation: (v.localisation ?? '').trim(),
      description: v.description.trim(), gravite: v.gravite!, echeance: v.echeance || undefined, origine: v.origine!, photoIds: v.photoIds ?? [],
    };
    try {
      if (reserve) {
        const retirees = reserve.photoIds.filter((id) => !champs.photoIds.includes(id));
        await modifier(reserve.id!, champs);
        if (retirees.length) await db.photos.bulkDelete(retirees);
        enregistre.current = true;
        toast('Réserve modifiée');
        onClose();
      } else {
        const r = await creerReserve({ chantierId, pointId: v.pointId, ...champs });
        enregistre.current = true;
        toast(`Réserve ${refReserve(r.numero)} enregistrée`);
        onClose();
        onCree?.(r);
      }
    } catch (e) {
      toast(`Enregistrement impossible : ${(e as Error).message}`);
    }
  };

  const supprimerReserve = async () => {
    if (!reserve || !confirm(`Supprimer la réserve ${refReserve(reserve.numero)} et ses photos ?`)) return;
    await supprimer(reserve);
    enregistre.current = true;
    toast('Réserve supprimée');
    onClose();
    retour('chantier', chantierId, 'reserves');
  };

  const now = new Date().toISOString();
  const sous = reserve
    ? `${refReserve(reserve.numero)}`
    : `${refReserve((ctx.ch.compteurReserve ?? 0) + 1)} · ${fmtDate(now.slice(0, 10)).slice(0, 5)} ${fmtHeure(now)}`;

  return (
    <Sheet titre={reserve ? 'Modifier la réserve' : 'Nouvelle réserve'} sousTitre={sous} onClose={onClose}
      pied={
        <div className="row">
          {reserve && <button type="button" className="btn danger tap" aria-label="Supprimer la réserve" onClick={supprimerReserve}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>{reserve ? 'Enregistrer' : 'Enregistrer la réserve'}</button>
        </div>
      }>
      {/* Photos en premier */}
      <div className="saisie-photos">
        {(v.photoIds ?? []).map((id, i) => (
          <div key={id} className="saisie-photo">
            <Vignette id={id} taille={104} label={`Photo ${i + 1}`} />
            <button type="button" className="saisie-photo-x tap" aria-label={`Retirer la photo ${i + 1}`} onClick={() => retirerPhoto(id)}>×</button>
          </div>
        ))}
      </div>
      <EntreesPhotos camera={input} phototheque={phototheque} onAjout={(f) => void ajouterPhotos(f)} />
      <div className="saisie-photo-actions" style={{ marginTop: v.photoIds?.length ? 8 : 0 }}>
        <button type="button" className="saisie-photo-add tap" style={{ flex: '2 1 0' }} onClick={() => input.current?.click()} disabled={photosEnCours}>
          <span className="saisie-photo-ico">{photosEnCours ? <span className="spinner" aria-hidden /> : <Camera size={24} strokeWidth={2.2} aria-hidden />}</span>
          {v.photoIds?.length ? 'Autre photo' : 'Prendre une photo'}
        </button>
        <button type="button" className="saisie-photo-add sec tap" style={{ flex: '1 1 0' }} onClick={() => phototheque.current?.click()} disabled={photosEnCours}>
          <span className="saisie-photo-ico sec"><Images size={24} strokeWidth={2.2} aria-hidden /></span>
          Photothèque
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="frow">
          <span className="rl">Lot</span>
          {ctx.lots.length <= 5 ? (
            <div className="grow">
              <Segment<string> pill label="Lot" valeur={v.lotCode}
                onChange={(l) => { setV((o) => ({ ...o!, lotCode: l, entreprise: entrepriseParDefaut(l) })); setAutreEntreprise(false); }}
                options={ctx.lots.map((l) => ({ v: l.code, l: <span className="mono">{l.code}</span>, aria: `Lot ${l.code}` }))} />
            </div>
          ) : (
            <select aria-label="Lot" value={v.lotCode} onChange={(e) => { const l = e.target.value; setV((o) => ({ ...o!, lotCode: l, entreprise: entrepriseParDefaut(l) })); }}>
              {ctx.lots.map((l) => <option key={l.code} value={l.code}>{l.code} – {l.intitule}</option>)}
            </select>
          )}
        </div>
        <div className="frow">
          <label className="rl" htmlFor="sr-ent">Entreprise</label>
          {autreEntreprise ? (
            <input id="sr-ent" value={v.entreprise ?? ''} placeholder="Raison sociale" autoFocus onChange={(e) => set('entreprise', e.target.value)} />
          ) : (
            <select id="sr-ent" value={v.entreprise ?? ''} onChange={(e) => {
              if (e.target.value === AUTRE) { setAutreEntreprise(true); set('entreprise', ''); } else set('entreprise', e.target.value);
            }}>
              {choixEntreprises.length === 0 && <option value="">—</option>}
              {choixEntreprises.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={AUTRE}>Autre entreprise…</option>
            </select>
          )}
        </div>
        <div className="frow">
          <label className="rl" htmlFor="sr-loc">Localisation</label>
          <input id="sr-loc" list="sr-locs" value={v.localisation ?? ''} placeholder="ex. R+1 · bureau 104" onChange={(e) => set('localisation', e.target.value)}
            onFocus={(e) => e.target.select()} />
          <datalist id="sr-locs">{ctx.localisations.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
      </div>

      <div className="saisie-desc" style={{ marginTop: 12 }}>
        <label htmlFor="sr-desc" className="saisie-desc-lbl">Description</label>
        <textarea id="sr-desc" ref={description} className="textarea" value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        <BoutonDictee cible={description} onTexte={(t) => setV((o) => ({ ...o!, description: o!.description ? `${o!.description.replace(/\s+$/, '')} ${t}` : t.charAt(0).toUpperCase() + t.slice(1) }))} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>Gravité</div>
        <Segment<Gravite> pill label="Gravité" valeur={v.gravite} onChange={(g) => set('gravite', g)}
          options={[{ v: 'mineure', l: 'Mineure' }, { v: 'majeure', l: 'Majeure' }, { v: 'bloquante', l: <span className="c-r">Bloquante</span>, aria: 'Bloquante' }]} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="row lbl" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span>Échéance</span>
          <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(v.echeance)}</span>
        </div>
        <div className="seg pill" role="group" aria-label="Échéance">
          {DELAIS.map((d) => (
            <button key={d} type="button" className="tap" aria-pressed={delai === d} onClick={() => choisirDelai(d)}>+{d} j</button>
          ))}
          <label className={`seg-date tap${delai === 'date' ? ' on' : ''}`} style={{ flex: '0 0 56px' }}>
            <CalendarDays size={20} strokeWidth={2} aria-hidden />
            <span className="sr-only">Choisir une date</span>
            <input type="date" value={v.echeance ?? ''} onChange={(e) => { setDelai('date'); set('echeance', e.target.value); }} />
          </label>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>Origine</div>
        <Segment<Origine> pill label="Origine" valeur={v.origine} onChange={(o) => set('origine', o)}
          options={(Object.keys(ORIGINE) as Origine[]).map((o) => ({ v: o, l: ORIGINE[o] }))} />
      </div>
    </Sheet>
  );
}
