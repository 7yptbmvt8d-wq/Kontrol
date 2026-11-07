import { useEffect, useRef, useState } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { nouvelleVersionDisponible, rafraichir } from '../pwa/miseAJour';
import { surNouvelleVersion } from '../pwa/sw';

const SEUIL = 80; // px de glissé du doigt pour déclencher

/**
 * Tirer pour actualiser : glisser vers le bas quand l'écran est tout en haut.
 * Inactif quand un panneau ou la visionneuse est ouvert.
 */
export function TirerPourActualiser() {
  const [dy, setDy] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const dyRef = useRef(0);

  useEffect(() => {
    const debut = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector('.sheet, .viewer') || e.touches.length > 1) { depart.current = null; return; }
      depart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const mouvement = (e: TouchEvent) => {
      if (!depart.current) return;
      const d = e.touches[0].clientY - depart.current.y;
      const dx = Math.abs(e.touches[0].clientX - depart.current.x);
      if (window.scrollY > 0 || d <= 0 || dx > d) { if (dyRef.current) { dyRef.current = 0; setDy(0); } return; }
      dyRef.current = d;
      setDy(d);
    };
    const fin = () => {
      const d = dyRef.current;
      depart.current = null;
      dyRef.current = 0;
      if (d >= SEUIL) { setEnCours(true); setDy(SEUIL); void rafraichir(); }
      else setDy(0);
    };
    document.addEventListener('touchstart', debut, { passive: true });
    document.addEventListener('touchmove', mouvement, { passive: true });
    document.addEventListener('touchend', fin, { passive: true });
    document.addEventListener('touchcancel', fin, { passive: true });
    return () => {
      document.removeEventListener('touchstart', debut);
      document.removeEventListener('touchmove', mouvement);
      document.removeEventListener('touchend', fin);
      document.removeEventListener('touchcancel', fin);
    };
  }, []);

  if (!dy && !enCours) return null;
  const pret = dy >= SEUIL || enCours;
  const decalage = Math.min(dy, SEUIL * 1.5) * 0.6;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${decalage}px)` }} role="status" aria-live="polite">
      <span className="ptr-ico" style={{ transform: enCours ? undefined : `rotate(${Math.min(dy / SEUIL, 1) * 180}deg)` }}>
        {enCours ? <RefreshCw size={20} strokeWidth={2.4} className="ptr-tourne" aria-hidden /> : <ArrowDown size={20} strokeWidth={2.4} aria-hidden />}
      </span>
      {enCours ? 'Actualisation…' : pret ? 'Relâcher pour actualiser' : 'Tirer pour actualiser'}
    </div>
  );
}

/** Bandeau affiché quand une nouvelle version est en ligne (vérifié à l'ouverture et au retour dans l'app). */
export function BandeauMiseAJour() {
  const [dispo, setDispo] = useState(false);
  useEffect(() => {
    let dernier = 0;
    const verifier = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - dernier < 60_000) return;
      dernier = Date.now();
      if (await nouvelleVersionDisponible()) setDispo(true);
    };
    void verifier();
    const desabonner = surNouvelleVersion(() => setDispo(true)); // nouvelle version déjà téléchargée par le service worker
    document.addEventListener('visibilitychange', verifier);
    const minuterie = window.setInterval(verifier, 15 * 60_000);
    return () => { desabonner(); document.removeEventListener('visibilitychange', verifier); window.clearInterval(minuterie); };
  }, []);
  if (!dispo) return null;
  return (
    <div className="maj" role="status">
      <span>Nouvelle version disponible</span>
      <button type="button" className="btn tap" style={{ height: 48, fontSize: 17 }} onClick={() => void rafraichir()}>
        <RefreshCw size={20} strokeWidth={2.4} aria-hidden />Mettre à jour
      </button>
    </div>
  );
}
