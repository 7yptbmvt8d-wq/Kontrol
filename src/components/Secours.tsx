import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { ClipboardCopy, House, RefreshCw, TriangleAlert } from 'lucide-react';
import { rafraichir } from '../pwa/miseAJour';

interface Props { children: ReactNode; route?: string }
interface Etat { erreur: Error | null; pile: string }

/**
 * Filet de sécurité : une erreur d'affichage n'aboutit plus à un écran blanc. Les données (IndexedDB) ne sont pas touchées.
 * Changer d'écran (route) relance l'affichage normal.
 */
export class Secours extends Component<Props, Etat> {
  state: Etat = { erreur: null, pile: '' };

  static getDerivedStateFromError(erreur: Error): Partial<Etat> {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    this.setState({ pile: info.componentStack ?? '' });
    console.error(erreur);
  }

  componentDidUpdate(prec: Props) {
    if (prec.route !== this.props.route && this.state.erreur) this.setState({ erreur: null, pile: '' });
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return <EcranSecours erreur={this.state.erreur} pile={this.state.pile} reprendre={() => this.setState({ erreur: null, pile: '' })} />;
  }
}

function EcranSecours({ erreur, pile, reprendre }: { erreur: Error; pile: string; reprendre: () => void }) {
  const [copie, setCopie] = useState(false);
  const detail = [
    `Kontrol ${__APP_VERSION__} · build ${__APP_BUILD__}`,
    `Écran : ${location.hash || '#/'}`,
    `${erreur.name} : ${erreur.message}`,
    (erreur.stack ?? '').split('\n').slice(0, 6).join('\n'),
    pile.trim().split('\n').slice(0, 6).join('\n'),
  ].filter(Boolean).join('\n');

  return (
    <main className="screen pad stack" role="alert" style={{ gap: 14, paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}>
      <TriangleAlert size={48} strokeWidth={2} color="var(--o)" aria-hidden />
      <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 700, lineHeight: 1.2 }}>Une erreur est survenue</h1>
      <div>Vos données sont intactes sur ce téléphone. Rechargez l’app ; si l’erreur revient, copiez le détail et envoyez-le à Claude.</div>
      <button type="button" className="btn block tap" onClick={() => void rafraichir()}>
        <RefreshCw size={22} strokeWidth={2.2} aria-hidden />Recharger
      </button>
      <button type="button" className="btn sec block tap" onClick={() => { location.hash = '#/'; reprendre(); }}>
        <House size={22} strokeWidth={2.2} aria-hidden />Retour à l’accueil
      </button>
      <button type="button" className="btn sec block tap" onClick={async () => {
        try { await navigator.clipboard.writeText(detail); setCopie(true); } catch { setCopie(false); }
      }}>
        <ClipboardCopy size={22} strokeWidth={2.2} aria-hidden />{copie ? 'Détail copié' : 'Copier le détail'}
      </button>
      <pre className="prompt ink2" style={{ color: 'var(--ink2)' }}>{detail}</pre>
    </main>
  );
}
