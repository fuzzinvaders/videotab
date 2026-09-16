export interface SafeUser {
  id: string
  username: string
  admin: boolean
  createdAt: string
}

export interface Invite {
  code: string
  createdAt: string
  expiresAt: string
}

/** Deux mondes qui ne se ressemblent pas. Une tablature Guitar Pro sait où sont ses notes
 *  et à quel moment elles sonnent ; un PDF n'est qu'une image, et tout son minutage doit
 *  lui être apporté de l'extérieur. Presque tout l'atelier découle de cette différence. */
export type TypeMorceau = 'gp' | 'pdf'

/**
 * Comment la partition traverse l'image.
 *
 * Les deux premières donnent la même bande horizontale et ne diffèrent que par ce qui bouge.
 * En « defilement », c'est la tablature : elle glisse sous une tête de lecture fixe, et le
 * regard n'a plus qu'à attendre que la musique arrive. En « mesures », c'est le curseur : la
 * tablature reste immobile le temps de quelques mesures, puis la page tourne. La première se
 * regarde, la seconde se lit — sur une tablature serrée, un chiffre qui glisse se suit mais
 * ne se déchiffre pas.
 */
export type Disposition = 'page' | 'defilement' | 'mesures'

/**
 * Comment la bande est habillée.
 *
 * « verre » est celui qui a été dessiné pour l'incrustation : coins arrondis, filet blanc à
 * peine visible, reflet en haut et **ombre portée**. C'est l'ombre qui fait le travail — elle
 * décolle la bande de la vidéo au lieu de la poser dessus — et c'est elle qui coûte quelque
 * chose : il faut de la place autour de la bande pour qu'elle tombe quelque part, donc
 * l'image grandit un peu, et il faut que le fond laisse passer l'image de dessous pour qu'on
 * la voie.
 *
 * « accent » est l'inverse : coins carrés, aucun relief, un seul trait de couleur en bas. Le
 * seul habillage qui tienne sur un fond opaque, donc le seul qui garde le mp4 et l'export
 * rapide.
 */
export type Cadre = 'aucun' | 'carte' | 'verre' | 'lueur' | 'accent' | 'vignette' | 'bandes'

/**
 * Ce que le curseur montre.
 *
 * Les deux disent la même chose de deux façons, et sur une tablature serrée ils se gênent :
 * le trait tombe au milieu du temps qu'on vient de surligner. D'où le choix — le trait seul
 * pour suivre l'instant exact, le surlignage seul pour lire le temps en cours comme sur une
 * partition annotée, les deux quand la vidéo est regardée de loin.
 */
export type StyleCurseur = 'trait' | 'surlignage' | 'les-deux'

/**
 * Ce qu'il y a derrière la partition quand la vidéo doit être incrustée ailleurs.
 *
 * « noir » est un noir plein, pris hors du thème. Un thème choisit ses couleurs pour la
 * tablature — les cordes, les chiffres, le curseur — et son fond n'en est qu'une conséquence ;
 * or c'est souvent le noir qu'on veut derrière, quel que soit le reste. Les deux réglages sont
 * donc séparés : la palette d'un côté, ce qu'il y a derrière de l'autre.
 *
 * « degrade » est le même voile, mais effacé vers le haut et vers le bas : la bande n'a plus
 * d'arête du tout, elle se pose sur l'image sans frontière. C'est l'habillage des bandeaux de
 * télévision, et celui qui se remarque le moins.
 *
 * « voile » est le fond noir translucide : la reprise se voit à travers, mais assombrie, et
 * les chiffres de la tablature s'en détachent sans qu'on ait à effacer l'image. C'est le
 * compromis qu'on cherche quand le fond du thème cache trop et que la transparence pure ne
 * donne pas assez de contraste. Comme « transparent », il demande un canal alpha, donc un
 * WebM — et donc l'encodage lent.
 */
export type FondVideo = 'theme' | 'noir' | 'degrade' | 'chroma' | 'transparent' | 'voile'

/**
 * Ce que l'image exportée contient.
 *
 * « image » garde le format annoncé — du 1080p où la bande flotte au milieu. « bande » réduit
 * la hauteur de la vidéo à celle de la bande : le fichier ne contient plus que la tablature,
 * il pèse ce qu'il montre, et il se pose au montage sans avoir à deviner où est le vide.
 */
export type Cadrage = 'image' | 'bande'

/**
 * Le conteneur du fichier produit.
 *
 * Cette vidéo-là ne finit pas dans un navigateur : elle finit dans un logiciel de montage,
 * posée par-dessus une reprise. Or Resolve et Premiere ne lisent pas le WebM, ou le lisent
 * mal — le fichier arrivait au bout de la chaîne pour s'y faire refuser. Le mp4 est donc le
 * défaut, et le WebM reste pour le web, où il est plus léger à qualité égale.
 */
export type FormatVideo = 'mp4' | 'webm'

/**
 * Combien de détail on paie.
 *
 * Une tablature, c'est du trait sur un fond uni : elle se comprime bien, et il n'y a aucune
 * raison de lui donner le débit d'une prise de vue. Le réglage existe parce que le bon
 * compromis dépend de la place que la bande occupera à l'écran — un bandeau dans un coin
 * n'a pas besoin de la même finesse qu'une tablature plein cadre.
 */
export type QualiteVideo = 'legere' | 'standard' | 'nette'

export interface ReglagesVideo {
  largeur: number
  hauteur: number
  fps: number
  /**
   * « page » : la partition défile verticalement, le curseur parcourt chaque ligne.
   * « defilement » : une seule bande horizontale glisse sous une tête de lecture fixe.
   * C'est la seconde qu'on veut pour incruster la tablature dans une vidéo de reprise —
   * elle tient dans un bandeau, et le regard n'a jamais à changer d'endroit.
   */
  disposition: Disposition
  theme: string
  /**
   * Combien de mesures tiennent à l'écran, en mode défilement. C'est ce réglage qui décide
   * du zoom — et donc, par ricochet, de la hauteur de la bande.
   */
  mesuresVisibles: number
  /**
   * Air laissé au-dessus et en dessous de la tablature, en fraction de sa hauteur. C'est de la
   * mise en page, pas une contrainte : le recadrage, lui, garde déjà ce qu'il ne faut pas
   * couper. Une tablature collée au bord de sa bande étouffe, et sur une incrustation elle se
   * confond avec ce qui passe derrière.
   */
  margeBande: number
  /** Plafond de hauteur de la bande, en fraction de l'image. N'agit que s'il est atteint. */
  hauteurMax: number
  /** Où se tient la tête de lecture, en fraction de largeur (mode défilement). */
  teteX: number
  /**
   * Mesures montrées en avance, en mode « mesures ».
   *
   * Elles occupent la fin de la fenêtre et rouvrent la suivante : on les a donc lues une fois
   * avant d'avoir à les jouer. Sans elles, chaque tournement de page livre du tout-inconnu au
   * moment précis où il faudrait déjà savoir quoi faire.
   */
  anticipation: number
  cadre: Cadre
  /**
   * Épaisseur du trait du cadre, en pixels d'une image large de 1920.
   *
   * Comptée sur la largeur et non sur la hauteur : cadrée sur la bande, l'image ne fait plus
   * que deux cents pixels de haut, et une épaisseur qui en découlerait se retrouverait clouée
   * à son minimum — le réglage n'aurait alors aucun effet là où on en a le plus besoin. À
   * zéro, il n'y a pas de trait : une carte se réduit à ses coins arrondis, une lueur à son
   * halo.
   */
  epaisseurCadre: number
  cadrage: Cadrage
  /** mp4 pour le montage, WebM pour le web. Voir {@link FormatVideo}. */
  format: FormatVideo
  /**
   * Sortir la transparence en deux fichiers — l'image, et sa découpe — au lieu d'un seul.
   *
   * Sans effet sur un fond opaque. Sur un fond qui n'en est pas un, c'est le réglage qui
   * décide de tout le reste : aucun navigateur ne sait encoder un canal alpha par la voie
   * rapide, si bien qu'un fichier unique impose le WebM et l'encodage en temps réel — trois
   * minutes d'attente pour trois minutes de morceau. Découpée en deux, la même transparence
   * repasse par la voie rapide et sort en mp4, neuf fois plus vite. Le montage a une
   * manipulation de plus à faire, une seule, et toujours la même.
   */
  cacheSepare: boolean
  qualite: QualiteVideo
  fond: FondVideo
  /**
   * Opacité du fond noir translucide. Sans effet sur les autres fonds.
   *
   * C'est le seul curseur qui arbitre entre deux choses qu'on veut toutes les deux : voir sa
   * reprise derrière la tablature, et lire la tablature.
   */
  opaciteFond: number
  /**
   * Couleur du curseur, ou `null` pour prendre celle du thème.
   *
   * Le `null` est le point important : sans lui, il faudrait deviner si la couleur en place
   * a été choisie ou seulement héritée, et la seule façon de deviner — la chercher dans la
   * palette — se trompe dès qu'un thème propose une teinte qui n'y figure pas. Une valeur
   * absente ne peut pas, elle, se désynchroniser de son thème.
   */
  couleur: string | null
  /** Le trait à l'instant exact, le surlignage du temps en cours, ou les deux. */
  curseurStyle: StyleCurseur
  /**
   * Le curseur glisse d'une note à l'autre, ou saute de l'une à l'autre.
   *
   * Glisser est exact à chaque instant, mais la vitesse y varie beaucoup : une partition
   * n'espace pas ses notes proportionnellement à leur durée — c'est une règle de gravure, pas
   * d'arithmétique — si bien que le curseur doit courir entre deux notes éloignées et ramper
   * entre deux notes serrées. Mesuré sur une vraie tablature, du simple au sextuple d'un temps
   * à l'autre. En défilement continu on ne le voit pas, la bande glissant elle aussi ; en
   * mesures fixes le curseur est seul à bouger, et ces écarts se lisent comme une saccade.
   *
   * Sauter supprime la question : le curseur est sur la note qui sonne, et il y reste jusqu'à
   * la suivante. On y perd la position exacte entre deux notes, on y gagne une pulsation.
   */
  curseurGlisse: boolean
  opacite: number
  /**
   * Longueur du décompte, en **temps** et non en secondes.
   *
   * Un décompte se compte à la noire, pas à la montre : c'est ce qui permet d'entrer sur le
   * premier temps sans avoir à convertir. Sa durée en secondes se déduit donc du tempo du
   * morceau, et change avec lui — quatre temps font une mesure à quatre-quatre, quel que soit
   * l'endroit où l'on a posé le curseur de tempo.
   */
  compteAvantTemps: number
  /**
   * Marquer le décompte de clics, plutôt que de le laisser muet.
   *
   * Un décompte silencieux ne sert qu'à qui regarde l'écran — c'est-à-dire pas à qui pose
   * ses doigts sur le manche, l'usage même auquel il est destiné.
   */
  decompteSonore: boolean
  /**
   * Effacer la tablature aux deux bouts de la bande.
   *
   * Utile au-delà du joli : les côtés sont justement là où une mesure se trouve coupée en
   * deux, et une moitié de mesure qui s'efface se lit comme une suite, alors qu'une moitié de
   * mesure tranchée net se lit comme une erreur. En mesures fixes, c'est un arbitrage : la
   * dernière mesure de la fenêtre est celle qu'on donne à lire en avance, et l'estomper
   * revient à atténuer ce qu'on avait justement ajouté pour être vu.
   */
  bordsFondus: boolean
  fondu: boolean
  bandeau: boolean
  barreDeProgression: boolean
}

export interface ReglagesGp {
  /** -1 pour toutes les pistes. */
  piste: number
  tempoPct: number
  metronome: boolean
  afficherPortee: boolean
  afficherTablature: boolean
  /**
   * La rythmique sous la tablature : les hampes et les barres qui disent la durée de chaque
   * note. Sans elle, un chiffre dit où poser le doigt mais pas combien de temps le laisser —
   * une tablature devient illisible pour qui ne connaît pas déjà le morceau.
   *
   * Elle s'efface d'elle-même quand la portée classique est affichée : celle-ci porte déjà
   * le rythme, et le répéter deux fois n'apprend rien.
   */
  rythme: boolean
  /**
   * Montrer les noms de sections — « Intro », « Couplet », « Refrain » — au-dessus de la
   * tablature.
   *
   * Sur quatre-vingts mesures qui se ressemblent, c'est ce qui dit où l'on en est. Ils
   * coûtent cependant de la hauteur : le recadrage serre la bande sur la portée, et les
   * laisser entrer oblige à remonter le bord haut sur toute la longueur du morceau, y
   * compris là où il n'y a aucun nom à lire. D'où le choix plutôt que l'automatisme.
   */
  sections: boolean
  /**
   * Commencer la vidéo à la première note plutôt qu'à la première mesure.
   *
   * Un fichier commence là où le morceau commence, pas là où l'instrument entre : une basse
   * qui attend deux mesures ouvre la vidéo sur deux mesures muettes. Rien n'est faux — c'est
   * ce que dit le fichier — mais on filme rarement le silence de quelqu'un d'autre.
   */
  demarrerALaPremiereNote: boolean
}

/** Un système, c'est une ligne de tablature sur la page — les six cordes qui se lisent
 *  de gauche à droite avant de revenir à la ligne. Les coordonnées sont des fractions de
 *  la page (0 à 1) et non des pixels : le PDF est réaffiché à toutes les tailles, de
 *  l'aperçu à l'écran jusqu'au rendu 1080p, et une fraction reste juste partout. */
export interface SystemePdf {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
  mesures: number
}

export interface FichierJoint {
  nom: string
  ext: string
  taille: number
}

export interface ReglagesPdf {
  systemes: SystemePdf[]
  bpm: number
  battementsParMesure: number
  mesuresParSysteme: number
  decalageMs: number
  audio: FichierJoint | null
}

export interface Reglages {
  video: ReglagesVideo
  gp?: ReglagesGp
  pdf?: ReglagesPdf
}

export interface VideoProduite {
  ext: string
  taille: number
  dureeMs: number
  creeLe: string
  /**
   * Le cache de la transparence, quand l'export l'a sortie en deux fichiers.
   *
   * Les deux ne valent rien séparés : l'un porte l'image posée sur noir, l'autre dit en noir
   * et blanc où elle se voit. C'est pour cela qu'il vit ici, accroché à la vidéo, et non
   * comme une vidéo de plus.
   */
  cache?: { nom: string; taille: number }
}

export interface Morceau {
  id: string
  titre: string
  artiste: string
  type: TypeMorceau
  fichier: FichierJoint
  auteur: string
  creeLe: string
  modifieLe: string
  reglages: Reglages
  video: VideoProduite | null
}

export interface Bibliotheque {
  morceaux: Morceau[]
  users?: SafeUser[]
  /**
   * Place occupée par les vidéos gardées sur le serveur, en octets.
   *
   * Trois minutes de 1080p pèsent une soixantaine de mégaoctets et rien ne borne leur
   * accumulation : c'est le genre de chose qui ne se remarque que le jour où le disque est
   * plein, sur une machine qui fait probablement autre chose à côté.
   */
  espaceVideos?: number
}
