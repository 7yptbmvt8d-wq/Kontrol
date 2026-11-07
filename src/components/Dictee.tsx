import { useEffect, useRef, useState, type RefObject } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from './ui';

// Web Speech API (préfixée sur Safari). Typage minimal : non présente dans lib.dom.
interface Reco {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecoCtor = new () => Reco;
const Ctor: RecoCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecoCtor; webkitSpeechRecognition?: RecoCtor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: RecoCtor }).webkitSpeechRecognition;

export const dicteeDisponible = !!Ctor;

/**
 * Bouton micro 48 px : dicte et ajoute le texte au champ. Si la reconnaissance vocale du navigateur
 * n'est pas disponible, met le champ en saisie : la dictée du clavier iOS (micro) prend le relais.
 */
export function BoutonDictee({ onTexte, cible }: { onTexte: (t: string) => void; cible: RefObject<HTMLTextAreaElement | null> }) {
  const [actif, setActif] = useState(false);
  const reco = useRef<Reco | null>(null);
  useEffect(() => () => reco.current?.stop(), []);

  const demarrer = () => {
    if (!Ctor) { cible.current?.focus(); toast('Utilisez le micro du clavier pour dicter'); return; }
    if (actif) { reco.current?.stop(); return; }
    const r = new Ctor();
    r.lang = 'fr-FR';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) onTexte(t.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Dictée indisponible : utilisez le micro du clavier');
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') cible.current?.focus();
    };
    r.onend = () => setActif(false);
    reco.current = r;
    try { r.start(); setActif(true); } catch { cible.current?.focus(); }
  };

  return (
    <button type="button" className={`dictee tap${actif ? ' actif' : ''}`} aria-label={actif ? 'Arrêter la dictée' : 'Dicter la description'}
      aria-pressed={actif} onClick={demarrer}>
      {actif ? <Square size={20} strokeWidth={2.4} aria-hidden /> : <Mic size={24} strokeWidth={2.2} aria-hidden />}
    </button>
  );
}
