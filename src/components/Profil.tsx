import type { Profil } from '../domain/reunion';

/** Champs du profil : vous (représentant du MOE) et la maîtrise d'œuvre (Réglages › Vous et appel des réunions). */
export function ChampsProfil({ v, set }: { v: Profil; set: (k: keyof Profil, val: string) => void }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <div className="lbl">Vous</div>
        <div className="frow"><label className="rl" htmlFor="pf-nom">Nom</label>
          <input id="pf-nom" value={v.nom} placeholder="ex. M. Dupont" autoComplete="name" onChange={(e) => set('nom', e.target.value)} /></div>
        <div className="frow" style={{ borderBottom: 0 }}><label className="rl" htmlFor="pf-fct">Fonction</label>
          <input id="pf-fct" value={v.fonction} placeholder="Représentant du MOE" onChange={(e) => set('fonction', e.target.value)} /></div>
      </div>
      <div>
        <div className="lbl">Maîtrise d’œuvre</div>
        <div className="frow"><label className="rl" htmlFor="pf-org">Organisme</label>
          <input id="pf-org" value={v.organisme} placeholder="ex. SID – USID de Corse" onChange={(e) => set('organisme', e.target.value)} /></div>
        <div className="frow"><label className="rl" htmlFor="pf-mnom">Nom</label>
          <input id="pf-mnom" value={v.moeNom ?? ''} placeholder="représentant (facultatif)" onChange={(e) => set('moeNom', e.target.value)} /></div>
        <div className="frow" style={{ borderBottom: 0 }}><label className="rl" htmlFor="pf-mfct">Fonction</label>
          <input id="pf-mfct" value={v.moeFonction ?? ''} placeholder="ex. Chef de BMO (facultatif)" onChange={(e) => set('moeFonction', e.target.value)} /></div>
      </div>
    </div>
  );
}
