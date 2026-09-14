/**
 * Le contexte audio, unique pour toute l'application.
 *
 * Un navigateur n'en accorde qu'une poignée par onglet, et un `AudioBuffer` appartient au
 * contexte qui l'a créé. Comme la bande-son voyage ici du synthétiseur d'alphaTab à
 * l'aperçu puis à l'enregistreur, il est plus simple qu'ils partagent tous le même — et
 * ça évite le bug classique où l'export est muet parce qu'il a ouvert son propre contexte
 * et que le navigateur l'a laissé suspendu.
 */

let contexte: AudioContext | null = null

export function contexteAudio(): AudioContext {
  if (!contexte) contexte = new AudioContext()
  return contexte
}

/**
 * Un contexte audio démarre suspendu tant que l'utilisateur n'a rien touché : c'est la
 * règle qui empêche les pages de se mettre à jouer toutes seules. À appeler depuis le
 * gestionnaire du clic qui lance la lecture ou l'export, pas avant.
 */
export async function reveillerAudio(): Promise<AudioContext> {
  const ctx = contexteAudio()
  if (ctx.state === 'suspended') await ctx.resume()
  return ctx
}

/**
 * De combien le son programmé est en retard sur le son entendu.
 *
 * Un contexte audio ne joue pas ce qu'on lui donne à l'instant où on le lui donne : il le
 * rend dans un tampon, que le système passe ensuite à la carte son. Entre les deux il s'écoule
 * un délai que le navigateur sait chiffrer — mesuré ici sous Chrome/Windows, dix millisecondes
 * de traitement et quarante de sortie, soit cinquante-trois en tout, vérifiées en comparant
 * l'horloge de rendu à celle de `getOutputTimestamp`.
 *
 * C'est peu et c'est beaucoup : cinquante millisecondes ne s'entendent pas sur une note tenue,
 * mais se voient sur une attaque, et une image qui devance le son de cette durée donne
 * l'impression tenace que le curseur est en avance. Il faut donc retarder l'image d'autant,
 * et pour cela commencer par le savoir.
 */
export function latenceSortieMs(ctx: AudioContext): number {
  const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0
  // `outputLatency` n'est pas partout, et vaut zéro tant que la sortie n'a rien joué.
  const sortie = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0
  // Un plafond, parce qu'un pilote qui annoncerait une demi-seconde ferait pire que mieux.
  return Math.min(250, (base + sortie) * 1000)
}

/** Transforme des échantillons entrelacés (gauche, droite, gauche…) en AudioBuffer. */
export function bufferDepuisEntrelace(
  blocs: Float32Array[],
  canaux: number,
  frequence: number,
): AudioBuffer {
  const total = blocs.reduce((somme, bloc) => somme + bloc.length, 0)
  const images = Math.max(1, Math.floor(total / canaux))
  const ctx = contexteAudio()
  const buffer = ctx.createBuffer(canaux, images, frequence)
  const pistes = Array.from({ length: canaux }, (_, c) => buffer.getChannelData(c))

  let image = 0
  for (const bloc of blocs) {
    for (let i = 0; i + canaux <= bloc.length; i += canaux) {
      if (image >= images) break
      for (let c = 0; c < canaux; c++) pistes[c][image] = bloc[i + c]
      image++
    }
  }
  return buffer
}

export async function decoderFichierAudio(octets: ArrayBuffer): Promise<AudioBuffer> {
  // `decodeAudioData` consomme le tampon qu'on lui donne : on lui en confie une copie,
  // sinon relancer un export après le premier trouverait un tampon vide.
  return contexteAudio().decodeAudioData(octets.slice(0))
}

/**
 * La même bande-son, amputée de son début.
 *
 * Un fichier Guitar Pro commence là où le morceau commence, pas là où l'instrument entre :
 * une basse qui attend deux mesures donne une vidéo qui s'ouvre sur deux mesures muettes.
 * Rien n'est faux là-dedans — c'est ce que dit le fichier — mais on filme rarement le silence
 * de quelqu'un d'autre.
 */
export function depuis(buffer: AudioBuffer, msDebut: number): AudioBuffer {
  const images = Math.round((msDebut / 1000) * buffer.sampleRate)
  if (images <= 0) return buffer
  const restant = Math.max(1, buffer.length - images)
  const ctx = contexteAudio()
  const sortie = ctx.createBuffer(buffer.numberOfChannels, restant, buffer.sampleRate)
  for (let canal = 0; canal < buffer.numberOfChannels; canal++) {
    // La copie part de l'image demandée : `copyFromChannel` sait le faire sans tampon
    // intermédiaire, ce qui évite d'allouer deux fois trois minutes de son.
    buffer.copyFromChannel(sortie.getChannelData(canal), canal, images)
  }
  return sortie
}

/**
 * Une copie de la bande-son précédée de silence.
 *
 * Le décompte du début de la vidéo décale toute la musique d'autant. Plutôt que d'apprendre
 * ce décalage à l'aperçu, à l'enregistreur et au curseur — trois endroits, trois occasions
 * de se tromper d'un signe — on le grave une bonne fois dans la bande elle-même.
 */
export function avecDecompteAvant(
  buffer: AudioBuffer,
  decompteMs: number,
  /** Marquer chaque seconde d'un clic. Sans lui le décompte ne sert qu'à qui regarde. */
  clics = false,
): AudioBuffer {
  const images = Math.round((decompteMs / 1000) * buffer.sampleRate)
  if (images <= 0) return buffer
  const ctx = contexteAudio()
  const sortie = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length + images,
    buffer.sampleRate,
  )
  for (let canal = 0; canal < buffer.numberOfChannels; canal++) {
    sortie.getChannelData(canal).set(buffer.getChannelData(canal), images)
  }
  if (clics) poserLesClics(sortie, decompteMs)
  return sortie
}

/**
 * Un clic par seconde de décompte, le dernier plus aigu.
 *
 * Le décompte comptait en silence : on voyait le chiffre décroître, et c'était tout. Utile
 * pour qui regarde l'écran, inutile pour qui pose ses doigts sur le manche — c'est-à-dire
 * pour l'usage même auquel il est destiné. Les clics tombent sur la seconde, comme le chiffre
 * affiché, et non sur le temps de la partition : les deux doivent dire la même chose, et
 * c'est la seconde qu'on voit.
 *
 * Une sinusoïde brève dont l'enveloppe s'éteint — assez sèche pour se placer sans traîner,
 * assez douce pour ne pas claquer dans un montage.
 */
function poserLesClics(sortie: AudioBuffer, decompteMs: number): void {
  const frequence = sortie.sampleRate
  const longueur = Math.round(0.035 * frequence)
  const pistes = Array.from({ length: sortie.numberOfChannels }, (_, c) => sortie.getChannelData(c))

  for (let seconde = 0; seconde * 1000 < decompteMs; seconde++) {
    const debut = Math.round(seconde * frequence)
    // Le dernier annonce le départ : plus haut, on l'entend venir sans avoir à compter.
    const hauteur = (seconde + 1) * 1000 >= decompteMs ? 1760 : 880
    for (let i = 0; i < longueur && debut + i < sortie.length; i++) {
      const t = i / frequence
      const valeur = Math.sin(2 * Math.PI * hauteur * t) * Math.exp(-t * 70) * 0.35
      for (const piste of pistes) piste[debut + i] = valeur
    }
  }
}
