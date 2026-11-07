// Remise d'un fichier à l'utilisateur sur iPhone : feuille de partage iOS (Enregistrer dans Fichiers, Mail, AirDrop…),
// sinon téléchargement classique. Doit être appelé dans un geste utilisateur (toucher), d'où l'étape « Fichier prêt ».

export interface FichierPret { nom: string; blob: Blob }

export const TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  txt: 'text/plain;charset=utf-8',
} as const;

export async function partager(fichiers: FichierPret[], titre?: string): Promise<'partage' | 'telecharge' | 'annule'> {
  const files = fichiers.map((f) => new File([f.blob], f.nom, { type: f.blob.type }));
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: titre });
      return 'partage';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'annule';
      // autre échec : repli sur le téléchargement
    }
  }
  for (const f of fichiers) {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return 'telecharge';
}

export const taille = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
