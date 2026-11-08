// À l'ouverture de l'app installée (écran d'accueil iOS), la hauteur de l'écran se stabilise après quelques
// centaines de millisecondes : les éléments fixés en bas (« Nouveau chantier », bouton +) glissaient vers le bas.
// Ils restent masqués (classe `demarrage` sur <html>) jusqu'à ce que la hauteur ne bouge plus, puis apparaissent en fondu.
const racine = document.documentElement;
const installee = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

if (installee) {
  racine.classList.add('demarrage');
  const debut = performance.now();
  const hauteur = () => `${window.innerHeight}|${window.visualViewport?.height ?? 0}|${window.visualViewport?.offsetTop ?? 0}`;
  let derniere = hauteur();
  let stableDepuis = debut;
  const verifier = (t: number) => {
    const h = hauteur();
    if (h !== derniere) { derniere = h; stableDepuis = t; }
    // Au moins 400 ms (animation d'ouverture d'iOS), hauteur inchangée depuis 250 ms, au plus 1,5 s
    if ((t - debut > 400 && t - stableDepuis > 250) || t - debut > 1500) racine.classList.remove('demarrage');
    else requestAnimationFrame(verifier);
  };
  requestAnimationFrame(verifier);
}
