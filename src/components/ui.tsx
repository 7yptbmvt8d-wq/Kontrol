import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, X, TriangleAlert } from 'lucide-react';
import type { Ton } from '../domain/statuts';

export function Header({ sub, title, onBack, backLabel = 'Retour', right }: {
  sub?: ReactNode; title?: ReactNode; onBack?: () => void; backLabel?: string; right?: ReactNode;
}) {
  return (
    <header className="hdr">
      {onBack && (
        <button type="button" className="icon-btn tap" aria-label={backLabel} onClick={onBack}>
          <ChevronLeft size={28} strokeWidth={2.2} aria-hidden />
        </button>
      )}
      <div className="hdr-txt" style={onBack ? undefined : { paddingLeft: 10 }}>
        {sub && <div className="hdr-sub">{sub}</div>}
        {title && <h1 className="hdr-title">{title}</h1>}
      </div>
      {right}
    </header>
  );
}

export function Pastille({ ton, children, dot = true }: { ton: Ton; children: ReactNode; dot?: boolean }) {
  return <span className={`st t-${ton}${dot ? '' : ' no-dot'}`}>{children}</span>;
}

export function BadgeBloquant() {
  return (
    <span className="st t-r no-dot" style={{ fontWeight: 700 }}>
      <TriangleAlert size={16} strokeWidth={2.4} aria-hidden />Bloquant
    </span>
  );
}

/** Code lot (= marché), en mono accent. */
export function CodeLot({ code }: { code: string }) {
  return <span className="lot-code">{code}</span>;
}

/**
 * Panneau du bas.
 * - Suit le clavier iOS (visualViewport) : le pied (« Enregistrer ») reste visible au-dessus du clavier.
 * - Protège la saisie : si un champ a été modifié, fermer par la zone sombre, × ou Échap demande confirmation.
 *   (Les formulaires qui enregistrent appellent onClose directement, sans confirmation.)
 */
export function Sheet({ titre, sousTitre, onClose, children, pied, auto }: {
  titre: string; sousTitre?: ReactNode; onClose: () => void; children: ReactNode; pied?: ReactNode; auto?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const modifie = useRef(false);
  const fermerDemande = useRef(() => {});
  fermerDemande.current = () => {
    if (modifie.current && !confirm('Abandonner la saisie ? Les informations non enregistrées seront perdues.')) return;
    onClose();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const precedent = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fermerDemande.current(); };
    window.addEventListener('keydown', esc);
    // Toute saisie dans le panneau (texte, date, liste, photo) le marque comme modifié
    const marquer = () => { modifie.current = true; };
    el?.addEventListener('input', marquer);
    el?.addEventListener('change', marquer);
    // Clavier iOS : le panneau remonte au-dessus du clavier
    const vv = window.visualViewport;
    const suivre = () => {
      if (!vv || !el) return;
      const clavier = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.bottom = clavier > 60 ? `${clavier}px` : '';
      el.style.maxHeight = clavier > 60 ? `${vv.height - 24}px` : '';
      el.classList.toggle('clavier', clavier > 60);
    };
    vv?.addEventListener('resize', suivre);
    vv?.addEventListener('scroll', suivre);
    suivre();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
      el?.removeEventListener('input', marquer);
      el?.removeEventListener('change', marquer);
      vv?.removeEventListener('resize', suivre);
      vv?.removeEventListener('scroll', suivre);
      precedent?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <>
      <div className="scrim" onClick={() => fermerDemande.current()} aria-hidden />
      <section ref={ref} tabIndex={-1} className={`sheet${auto ? ' auto' : ''}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="sheet-grip" aria-hidden />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="sheet-title">{titre}</h2>
            {sousTitre && <div className="mono ink2 ellipsis">{sousTitre}</div>}
          </div>
          <button type="button" className="icon-btn round tap" aria-label="Fermer" onClick={() => fermerDemande.current()}>
            <X size={20} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {pied && <div className="sheet-foot">{pied}</div>}
      </section>
    </>
  );
}

export function Segment<T extends string>({ options, valeur, onChange, label, pill }: {
  options: { v: T; l: ReactNode; aria?: string }[]; valeur: T | undefined; onChange: (v: T) => void; label: string; pill?: boolean;
}) {
  return (
    <div className={`seg${pill ? ' pill' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className="tap" aria-pressed={valeur === o.v} aria-label={o.aria} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

let notifier: ((m: string) => void) | null = null;
export const toast = (m: string) => notifier?.(m);

/** Zone de notification toujours présente (annoncée par VoiceOver). */
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: number | undefined;
    notifier = (m) => { setMsg(m); window.clearTimeout(t); t = window.setTimeout(() => setMsg(null), 2000); };
    return () => { notifier = null; window.clearTimeout(t); };
  }, []);
  return (
    <div role="status" aria-live="polite" className={msg ? 'toast' : 'sr-only'} onClick={() => setMsg(null)}>
      {msg}
    </div>
  );
}
