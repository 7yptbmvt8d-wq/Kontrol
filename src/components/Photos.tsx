import { useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, Trash2, X } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import { fmtCourt, fmtHeure } from '../domain/dates';
import { toast } from './ui';

/** URL d'objet d'une photo (vignette ou pleine taille), révoquée au démontage. */
function usePhotoUrl(id: number, pleine = false): string | null | undefined {
  const photo = useLive(`photo:${id}:${pleine ? 'p' : 'v'}`, () => db.photos.get(id).then((p) => p ?? null), [id]);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (photo === undefined) return;
    if (photo === null) { setUrl(null); return; }
    const u = URL.createObjectURL(pleine ? photo.blob : photo.vignette);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo, pleine]);
  return url;
}

export function Vignette({ id, taille = 72, onClick, label }: { id: number; taille?: number; onClick?: () => void; label: string }) {
  const url = usePhotoUrl(id);
  const style = { width: taille, height: taille, flex: `0 0 ${taille}px` };
  const contenu = url ? <img src={url} alt="" className="photo-img" /> : url === null ? <ImageOff size={22} aria-hidden /> : null;
  return onClick ? (
    <button type="button" className="photo-tile tap" style={style} onClick={onClick} aria-label={label}>{contenu}</button>
  ) : (
    <div className="photo-tile" style={style} role="img" aria-label={label}>{contenu}</div>
  );
}

/**
 * Bandeau de photos + tuile d'ajout (appareil photo direct).
 * `onAjout` reçoit les fichiers bruts ; la compression est faite par l'appelant via enregistrerPhotos.
 */
export function BandeauPhotos({ ids, onAjout, onSupprimer, enCours }: {
  ids: number[]; onAjout: (f: File[]) => void; onSupprimer: (id: number) => void; enCours?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [vue, setVue] = useState<number | null>(null);
  return (
    <div className="photo-strip">
      {ids.map((id, i) => <Vignette key={id} id={id} label={`Photo ${i + 1}, agrandir`} onClick={() => setVue(id)} />)}
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onAjout(f); }} />
      <button type="button" className="photo-add tap" aria-label="Prendre une photo" onClick={() => input.current?.click()} disabled={enCours}>
        {enCours ? <span className="spinner" aria-hidden /> : <Camera size={26} strokeWidth={2.2} aria-hidden />}
      </button>
      {vue !== null && <Visionneuse id={vue} onClose={() => setVue(null)} onSupprimer={() => { onSupprimer(vue); setVue(null); }} />}
    </div>
  );
}

export function Visionneuse({ id, onClose, onSupprimer }: { id: number; onClose: () => void; onSupprimer?: () => void }) {
  const url = usePhotoUrl(id, true);
  const photo = useLive(`photo-meta:${id}`, () => db.photos.get(id).then((p) => (p ? { prisLe: p.prisLe } : null)), [id]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="viewer-bar">
        <button type="button" className="icon-btn round tap" aria-label="Fermer la photo" onClick={onClose}><X size={22} strokeWidth={2.4} aria-hidden /></button>
        {photo && <span className="mono viewer-date">{fmtCourt(photo.prisLe.slice(0, 10))} · {fmtHeure(photo.prisLe)}</span>}
        {onSupprimer ? (
          <button type="button" className="icon-btn round tap" aria-label="Supprimer la photo"
            onClick={() => { if (confirm('Supprimer cette photo ?')) { onSupprimer(); toast('Photo supprimée'); } }}>
            <Trash2 size={22} strokeWidth={2.2} aria-hidden />
          </button>
        ) : <span style={{ width: 48 }} />}
      </div>
      <div className="viewer-img" onClick={onClose}>{url && <img src={url} alt="" />}</div>
    </div>
  );
}
