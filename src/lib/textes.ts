/**
 * L'interface en anglais.
 *
 * La clef est la phrase française, telle qu'elle est écrite dans le code — voir lib/langue.tsx,
 * qui explique pourquoi. Une phrase absente d'ici s'affiche en français : c'est un défaut
 * visible et sans gravité, contrairement à une clef technique qui s'afficherait telle quelle.
 *
 * Les valeurs entre accolades voyagent d'une langue à l'autre et peuvent changer de place :
 * c'est tout l'intérêt de traduire des phrases entières plutôt que de les coller bout à bout.
 *
 * Les messages du serveur y figurent aussi. Ils arrivent en français dans le corps des
 * réponses et traversent tous `ErrorText`, qui les traduit au passage : le serveur n'a donc
 * pas à savoir quelle langue lit son visiteur.
 */
export const ANGLAIS: Record<string, string> = {
  // ---- Navigation, comptes, invitations ----
  Bibliothèque: 'Library',
  Compte: 'Account',
  'Passer en français': 'Passer en français',
  'Switch to English': 'Switch to English',
  Chargement: 'Loading',
  'Chargement…': 'Loading…',
  'Un instant…': 'One moment…',
  Identifiant: 'Username',
  'Mot de passe': 'Password',
  'Mot de passe actuel': 'Current password',
  Nouveau: 'New',
  Confirmation: 'Confirmation',
  'Se connecter': 'Sign in',
  'Se déconnecter': 'Sign out',
  Rejoindre: 'Join',
  'Rejoindre avec un code': 'Join with a code',
  'Une tablature, une vidéo avec curseur': 'One tab file, one video with a cursor',
  'J’ai déjà un compte': 'I already have an account',
  'J’ai un code d’invitation': 'I have an invitation code',
  "Code d'invitation": 'Invitation code',
  'Donné par la personne qui a installé Videotab.': 'Given to you by whoever installed Videotab.',
  '6 caractères au minimum.': 'Six characters minimum.',
  "Premier compte — c'est lui qui invitera les autres.":
    'First account — this is the one that will invite the others.',
  'Créer le compte': 'Create the account',
  'Création…': 'Creating…',
  'Les deux mots de passe ne sont pas identiques.': 'The two passwords do not match.',
  'Administrateur de cette instance': 'Administrator of this instance',
  Membre: 'Member',
  Changer: 'Change',
  'Mot de passe changé.': 'Password changed.',
  'Le changement a échoué.': 'The change failed.',
  Invitations: 'Invitations',
  'Nouveau code': 'New code',
  'Un code vaut sept jours et une seule inscription. Il se dicte à voix haute : ni O ni zéro, ni I ni un.':
    'A code lasts seven days and one sign-up. It is made to be read out loud: no O and no zero, no I and no one.',
  'Aucun code en attente.': 'No pending codes.',
  'jusqu’au {date}': 'until {date}',
  Révoquer: 'Revoke',
  'Impossible de lire les invitations.': 'Could not read the invitations.',
  'La création a échoué.': 'Creating it failed.',
  Comptes: 'Accounts',
  '(toi)': '(you)',
  Supprimer: 'Delete',
  'La suppression a échoué.': 'Deleting it failed.',
  'Supprimer le compte « {nom} » ? Ses morceaux resteront dans la bibliothèque.':
    'Delete the account “{nom}”? Its pieces will stay in the library.',
  'Erreur de connexion': 'Sign-in error',
  'Erreur de création du compte': 'Account creation error',
  'Impossible de joindre le serveur.': 'Could not reach the server.',

  // ---- Bibliothèque ----
  'Dépose une tablature, repars avec une vidéo': 'Drop a tab file, leave with a video',
  'Guitar Pro (.gp, .gp3 à .gp5, .gpx), MusicXML, ou un PDF scanné. Les fichiers Guitar Pro apportent leurs notes et leur tempo ; un PDF n’est qu’une image, et c’est toi qui lui donneras son minutage dans l’atelier.':
    'Guitar Pro (.gp, .gp3 to .gp5, .gpx), MusicXML, or a scanned PDF. Guitar Pro files bring their own notes and tempo; a PDF is only a picture, and you are the one who will give it its timing in the workshop.',
  'Choisir un fichier': 'Choose a file',
  'Envoi… {part} %': 'Uploading… {part}%',
  'Rien encore. Le premier fichier déposé ouvrira l’atelier tout seul.':
    'Nothing yet. The first file you drop will open the workshop by itself.',
  'Vidéos gardées sur le serveur : {poids}': 'Videos kept on the server: {poids}',
  'par {auteur}': 'by {auteur}',
  'Vidéo {duree}': 'Video {duree}',
  "L'import a échoué.": 'The import failed.',

  // ---- Atelier : cadre général ----
  'Ce morceau n’existe plus.': 'This piece no longer exists.',
  'Lecture du fichier…': 'Reading the file…',
  'Chargement de l’atelier…': 'Loading the workshop…',
  'Retour à la bibliothèque': 'Back to the library',
  Titre: 'Title',
  Artiste: 'Artist',
  'Fichier introuvable sur le serveur.': 'File not found on the server.',
  'Impossible de charger la tablature.': 'Could not load the tab.',
  'Ce morceau n’a pas de réglages Guitar Pro.': 'This piece has no Guitar Pro settings.',
  'Ce morceau n’a pas de réglages PDF.': 'This piece has no PDF settings.',

  // ---- Lecteur ----
  'Préparation…': 'Getting ready…',
  Pause: 'Pause',
  Lecture: 'Play',
  Espace: 'Space',
  'Position dans le morceau': 'Position in the piece',
  'Ouverture de la partition…': 'Opening the score…',
  'Mise en page de la partition…': 'Laying out the score…',
  'Synthèse de la bande-son…': 'Rendering the soundtrack…',
  'Synthèse de la bande-son… {part} %': 'Rendering the soundtrack… {part}%',
  'La bande-son n’a pas pu être produite.': 'The soundtrack could not be produced.',
  'alphaTab a refusé ce fichier.': 'alphaTab refused this file.',
  "Ce fichier n'a pas pu être lu comme une tablature.": 'This file could not be read as a tab.',
  'Partition lue, mise en page et jouée par': 'Score read, laid out and played by',

  // ---- Réglages Guitar Pro ----
  Piste: 'Track',
  'Toutes les pistes': 'All tracks',
  'Une seule piste donne une vidéo lisible ; toutes, un panorama.':
    'A single track makes a readable video; all of them, a panorama.',
  Tempo: 'Tempo',
  'Portée classique': 'Standard notation',
  Tablature: 'Tab',
  'Commencer à la première note': 'Start at the first note',
  'Rythmique sous la tablature': 'Rhythm under the tab',
  'Noms de sections au-dessus': 'Section names above',
  'Métronome dans la bande-son': 'Metronome in the soundtrack',

  // ---- Réglages PDF ----
  'Ouverture du PDF…': 'Opening the PDF…',
  'Rendu des pages…': 'Rendering the pages…',
  "Ce PDF n'a pas pu être ouvert.": 'This PDF could not be opened.',
  'Impossible de préparer le rendu de la page.': 'Could not prepare the page for rendering.',
  'Découpe d’abord les systèmes : « Détecter les lignes ».':
    'Cut the systems out first: “Detect the lines”.',
  'Découpage — {n} systèmes': 'Layout — {n} systems',
  'Détecter les lignes': 'Detect the lines',
  'Tout effacer': 'Clear everything',
  'Aucune ligne de tablature reconnue. Trace les systèmes à la main sur la page.':
    'No tab line recognised. Draw the systems by hand on the page.',
  'Tire un rectangle sur la page pour ajouter une ligne, attrape ses bords pour l’ajuster, change son nombre de mesures dans le coin. L’ordre de lecture suit la page, de haut en bas.':
    'Drag a rectangle on the page to add a line, grab its edges to adjust it, change its bar count in the corner. Reading order follows the page, top to bottom.',
  'Pages rendues par': 'Pages rendered by',
  'Mesures du système {numero}': 'Bars in system {numero}',
  'Supprimer le système {numero}': 'Delete system {numero}',
  Minutage: 'Timing',
  enregistré: 'saved',
  'enregistrement…': 'saving…',
  'Temps / mesure': 'Beats / bar',
  'Mesures / ligne': 'Bars / line',
  'Valeur par défaut.': 'Default value.',
  'Durée calculée :': 'Computed duration:',
  'Le temps qui passe avant la première note de la bande-son — l’intro, le décompte du batteur, le silence du début d’enregistrement.':
    'The time before the first note of the soundtrack — the intro, the drummer’s count-in, the silence at the start of the recording.',
  'Bande-son': 'Soundtrack',
  'Un PDF ne contient aucune note qu’une machine puisse jouer. Le seul son possible est celui qu’on apporte : l’enregistrement du morceau, mp3 ou wav.':
    'A PDF holds no note a machine could play. The only possible sound is the one you bring: a recording of the piece, mp3 or wav.',
  'Ajouter un fichier audio': 'Add an audio file',
  Retirer: 'Remove',
  "La bande-son n'a pas pu être envoyée.": 'The soundtrack could not be uploaded.',
  "La bande-son n'a pas pu être décodée.": 'The soundtrack could not be decoded.',

  // ---- Mise en scène ----
  Thème: 'Theme',
  'Cordes colorées': 'Coloured strings',
  'Fond sombre, une couleur par corde — la lecture de tabs.parnaut.fr.':
    'Dark background, one colour per string — how tabs.parnaut.fr reads.',
  Ardoise: 'Slate',
  'Bleu nuit et blanc cassé — un tableau noir, en plus doux.':
    'Midnight blue and off-white — a blackboard, softened.',
  'La partition telle qu’on l’imprime, posée sur un fond ardoise.':
    'The score as it prints, laid on a slate background.',
  Néon: 'Neon',
  'Noir profond et couleurs saturées, pour une incrustation qui se voit.':
    'Deep black and saturated colours, for an overlay meant to be seen.',
  'Sombre et sobre, sans couleur : la tablature et rien d’autre.':
    'Dark and plain, no colour: the tab and nothing else.',
  'Défilement horizontal': 'Horizontal scroll',
  'Une seule bande qui glisse sous une tête de lecture fixe. Le regard ne bouge plus, il attend que la musique arrive.':
    'A single band sliding under a fixed playhead. Your eyes stop moving and wait for the music to arrive.',
  'Mesures fixes': 'Fixed bars',
  'La même bande, mais immobile : c’est le curseur qui la traverse, et la page tourne à la fin. Un chiffre qui ne bouge pas se déchiffre — sur une tablature serrée, c’est souvent plus lisible.':
    'The same band, but still: the cursor crosses it, and the page turns at the end. A number that stays put can be read — on a crowded tab, that is often clearer.',
  Page: 'Page',
  'La partition entière, qui défile vers le bas. Pour travailler un morceau plutôt que pour l’illustrer.':
    'The whole score, scrolling down. For working on a piece rather than illustrating it.',
  'Mesures à l’écran': 'Bars on screen',
  '{n} mesures': '{n} bars',
  'C’est ce réglage qui fait le zoom : moins de mesures, des chiffres plus gros, une bande plus haute. La hauteur suit toute seule.':
    'This is the zoom: fewer bars, bigger numbers, a taller band. The height follows on its own.',
  'C’est ce réglage qui fait le zoom, et la fenêtre en montre autant qu’il en entre à cette taille-là — parfois une de plus, parfois une de moins, plutôt que d’en couper une.':
    'This is the zoom, and the window shows as many as fit at that size — sometimes one more, sometimes one fewer, rather than cutting one in half.',
  'Air autour de la tablature': 'Air around the tab',
  'au ras': 'flush',
  'De l’espace au-dessus et en dessous, en proportion de la tablature. À zéro elle touche les bords de la bande ; en ouvrant, on laisse revenir ce qui dépasse — hampes, rythmes, nom de section.':
    'Space above and below, in proportion to the tab. At zero it touches the edges of the band; opening it up lets what overhangs come back — stems, rhythms, section names.',
  'Hauteur maximale': 'Maximum height',
  '{n} % de l’image': '{n}% of the frame',
  'Un plafond, pas une cible : la bande reste aussi courte que la tablature l’exige. Il ne s’applique que si elle le dépasse, et on voit alors plus de mesures que demandé.':
    'A ceiling, not a target: the band stays as short as the tab demands. It only applies if the band exceeds it, and you then see more bars than you asked for.',
  'Mesures d’avance': 'Bars of lookahead',
  aucune: 'none',
  'Les dernières mesures de la fenêtre, montrées avant d’être jouées : elles rouvrent la fenêtre suivante. À une, la page tourne pile en arrivant sur la dernière mesure affichée — le curseur a donc traversé tout l’écran. En demander plus fait tourner plus tôt, et laisse plus de temps pour lire ce qui vient.':
    'The last bars of the window, shown before they are played: they open the next one. At one, the page turns exactly as you reach the last bar shown — so the cursor has crossed the whole screen. Asking for more turns earlier, and leaves more time to read what is coming.',
  'Tête de lecture': 'Playhead',
  '{n} % depuis la gauche': '{n}% from the left',
  'À gauche, on voit venir la suite de loin ; au milieu, on garde autant de passé que d’avenir.':
    'To the left, you see what is coming from far off; in the middle, you keep as much past as future.',
  Encadrement: 'Frame',
  Aucun: 'None',
  'Verre — filet fin, reflet et ombre portée': 'Glass — thin rule, highlight and drop shadow',
  'Accent — un trait de couleur en bas': 'Accent — a coloured line along the bottom',
  'Carte — coins arrondis et filet': 'Card — rounded corners and a rule',
  'Lueur — halo de la couleur du curseur': 'Glow — a halo in the cursor’s colour',
  'Bandes — fond translucide et liserés': 'Strips — translucent background and edging',
  'Vignette — bords assombris': 'Vignette — darkened edges',
  'Épaisseur du cadre': 'Frame thickness',
  'sans trait': 'no rule',
  'Le filet autour de la bande. Le halo, lui, ne bouge pas — c’est lui qui fait la lueur, et à zéro il reste seul.':
    'The rule around the band. The halo does not change — it is what makes the glow, and at zero it is left alone.',
  'Comptée sur une image large de 1920 et suivie à l’échelle : le cadre garde le même poids en 720p comme en vertical.':
    'Measured on a 1920-wide frame and scaled from there: the frame keeps the same weight at 720p or in portrait.',
  'Sur un fond opaque, les coins restent carrés : un fichier sans transparence ne sait pas laisser un coin vide, il le remplit de noir. Prends un fond translucide ou transparent pour que la carte se découpe vraiment — et le verre pour qu’elle porte son ombre.':
    'On an opaque background the corners stay square: a file without transparency cannot leave a corner empty, it fills it with black. Pick a translucent or transparent background for the card to be cut out for real — and glass for it to cast its shadow.',
  'Les coins arrondis ne découpent l’image que si elle est cadrée sur la bande : sur une image entière, la carte flotte au milieu d’une page qui reste pleine.':
    'Rounded corners only cut the image when it is cropped to the band: on a full frame, the card floats in the middle of a page that stays full.',
  'Effacer les bouts de la bande': 'Fade the ends of the band',
  'Les côtés sont là où une mesure se trouve coupée en deux : une moitié qui s’efface se lit comme une suite, une moitié tranchée net se lit comme une erreur.':
    'The sides are where a bar gets cut in half: a half that fades reads as a continuation, a half sliced clean reads as a mistake.',
  'Les côtés sont là où une mesure se trouve coupée en deux. En mesures fixes c’est un arbitrage : la dernière mesure affichée est celle qu’on donne à lire en avance, et l’estomper atténue ce qu’on avait ajouté pour être vu.':
    'The sides are where a bar gets cut in half. With fixed bars it is a trade-off: the last bar shown is the one given to read ahead, and fading it softens what was added to be seen.',

  // ---- Format de la vidéo ----
  Définition: 'Resolution',
  'Vertical — 1080 × 1920': 'Portrait — 1080 × 1920',
  'Images par seconde': 'Frames per second',
  '30 suffit pour un curseur ; 60 coûte le double.':
    '30 is enough for a cursor; 60 costs twice as much.',
  'Cadrage de la bande': 'Framing',
  'Image entière': 'Whole frame',
  'Hauteur de la bande': 'Height of the band',
  'Le format annoncé ci-dessus, la bande au milieu.':
    'The resolution set above, with the band in the middle.',
  'La vidéo fait la hauteur de la bande, et rien de plus. Elle pèse ce qu’elle montre et se pose au montage sans chercher où est la tablature dedans.':
    'The video is as tall as the band and no taller. It weighs what it shows, and drops into an edit without hunting for where the tab is inside it.',
  Fond: 'Background',
  'Couleur du thème': 'Theme colour',
  Noir: 'Black',
  'Noir translucide': 'Translucent black',
  'Noir dégradé — sans bord': 'Faded black — no edge',
  'Vert d’incrustation': 'Chroma green',
  Transparent: 'Transparent',
  'Le fond du thème, opaque.': 'The theme’s background, opaque.',
  'Un noir plein, quel que soit le thème. Le thème garde la main sur les couleurs de la tablature.':
    'Solid black, whatever the theme. The theme still governs the colours of the tab itself.',
  'Un vert plein, à détourer dans le montage. Ça marche partout, y compris sur Safari.':
    'Solid green, to be keyed out in the edit. It works everywhere, Safari included.',
  'La reprise se voit à travers, assombrie. Comme la transparence, ça impose le WebM et l’encodage en temps réel.':
    'Your cover shows through, darkened. Like transparency, it forces WebM and real-time encoding.',
  'Le voile s’efface vers le haut et vers le bas : la bande n’a plus d’arête du tout. Comme la transparence, ça impose le WebM et l’encodage en temps réel.':
    'The veil fades towards the top and the bottom: the band has no edge at all. Like transparency, it forces WebM and real-time encoding.',
  'Vraie transparence, en WebM VP8. À vérifier : tous les logiciels de montage ne la lisent pas.':
    'True transparency, in WebM VP8. Worth checking: not every editor reads it.',
  'Ce navigateur ne sait pas encoder la transparence — la vidéo sortira sur le fond du thème. Prends plutôt le fond vert.':
    'This browser cannot encode transparency — the video will come out on the theme background. Use chroma green instead.',
  'Ce navigateur ne sait pas encoder la transparence — le voile sortira opaque. Prends plutôt le fond vert.':
    'This browser cannot encode transparency — the veil will come out opaque. Use chroma green instead.',
  'Ce navigateur ne sait pas encoder la transparence — le dégradé sortira opaque. Prends plutôt le fond vert.':
    'This browser cannot encode transparency — the fade will come out opaque. Use chroma green instead.',
  'Opacité du fond': 'Background opacity',
  'Le seul réglage qui arbitre entre deux choses qu’on veut toutes les deux : voir sa reprise derrière la tablature, et lire la tablature.':
    'The one setting that arbitrates between two things you want at once: seeing your playing behind the tab, and reading the tab.',

  // ---- Curseur ----
  Curseur: 'Cursor',
  'Trait et surlignage': 'Line and highlight',
  'Le trait pour l’instant exact, le surlignage pour le temps en cours.':
    'The line for the exact instant, the highlight for the beat in progress.',
  'Trait seul': 'Line only',
  'Rien que la barre verticale. Le plus lisible sur une tablature serrée, où le surlignage se confond avec le trait qui le traverse.':
    'Just the vertical bar. The clearest on a crowded tab, where the highlight blurs into the line crossing it.',
  'Surlignage seul': 'Highlight only',
  'Rien que le temps en cours, comme une partition qu’on annoterait au fluo. Sans temps à désigner — un PDF en défilement — le trait revient tout seul.':
    'Just the beat in progress, like a score marked with a highlighter. With no beat to point at — a scrolling PDF — the line comes back by itself.',
  'Déplacement du curseur': 'Cursor movement',
  'Glissant — il suit la musique en continu': 'Sliding — it follows the music continuously',
  'Au temps — il saute de note en note': 'On the beat — it jumps from note to note',
  'Exact à chaque instant, mais la vitesse y varie : une partition n’espace pas ses notes au prorata de leur durée, et le curseur doit courir puis ramper. Sur une bande qui défile ça ne se voit pas ; en mesures fixes, il est seul à bouger.':
    'Exact at every instant, but its speed varies: a score does not space its notes in proportion to their length, so the cursor has to run then crawl. On a scrolling band you cannot see it; with fixed bars, it is the only thing moving.',
  'Le curseur se pose sur la note qui sonne et l’y attend. On perd où l’on en est entre deux notes, on gagne une pulsation régulière.':
    'The cursor lands on the note that sounds and waits there. You lose where you are between two notes, you gain a steady pulse.',
  Couleur: 'Colour',
  'Reprendre la couleur du thème': 'Go back to the theme colour',
  'Opacité du surlignage': 'Highlight opacity',

  // ---- Finitions ----
  Finitions: 'Finishing touches',
  'Décompte avant le départ': 'Count-in before the start',
  aucun: 'none',
  '{n} temps': '{n} beats',
  'Compté en temps et non en secondes : les clics tombent sur la noire du morceau, et le dernier juste avant la première note. Quatre temps font une mesure à quatre-quatre.':
    'Counted in beats, not seconds: the clicks land on the piece’s quarter note, and the last one just before the first note. Four beats make one bar in four-four.',
  'Clics pendant le décompte': 'Clicks during the count-in',
  'Titre et artiste en haut': 'Title and artist at the top',
  'Barre de progression en bas': 'Progress bar at the bottom',
  'Fondu au début et à la fin': 'Fade in and out',
  afficher: 'show',
  masquer: 'hide',

  // ---- Export ----
  Exporter: 'Export',
  'Exporter la vidéo': 'Export the video',
  Interrompre: 'Stop',
  'Ce navigateur ne sait pas enregistrer de vidéo. Firefox, Chrome, Edge et Safari récents le savent.':
    'This browser cannot record video. Recent Firefox, Chrome, Edge and Safari can.',
  'Ce navigateur ne sait pas enregistrer de vidéo (MediaRecorder absent). Firefox, Chrome, Edge et Safari récents le savent.':
    'This browser cannot record video (no MediaRecorder). Recent Firefox, Chrome, Edge and Safari can.',
  "Ce navigateur n'a aucun encodeur vidéo utilisable.": 'This browser has no usable video encoder.',
  'Impossible de préparer le canvas de rendu.': 'Could not prepare the rendering canvas.',
  'L’encodage se fait ici, dans l’onglet, mais plus vite que le morceau : les {duree} de vidéo ne demandent pas {duree} d’attente. Ne ferme pas l’onglet, c’est tout.':
    'Encoding happens here, in this tab, but faster than the music: {duree} of video does not mean {duree} of waiting. Just do not close the tab.',
  'L’encodage se fait ici, dans l’onglet, et en temps réel : {duree} de morceau demandent {duree} d’attente. Tu peux aller ailleurs pendant ce temps-là, l’enregistrement continue — mais ne ferme pas l’onglet.':
    'Encoding happens here, in this tab, and in real time: {duree} of music takes {duree} of waiting. You can go elsewhere meanwhile, the recording carries on — but do not close the tab.',
  Transparence: 'Transparency',
  'Deux fichiers — image et cache, rapide': 'Two files — picture and matte, fast',
  'Un seul fichier WebM — temps réel': 'A single WebM file — real time',
  'Aucun navigateur ne sait encoder un canal alpha : découpée en deux, la transparence repasse par l’encodeur rapide et par le mp4. Une manipulation de plus au montage, toujours la même — la marche à suivre s’affiche avec les fichiers.':
    'No browser can encode an alpha channel: split in two, transparency goes back through the fast encoder and through mp4. One more step in the edit, always the same one — the recipe appears with the files.',
  'Un seul fichier, mais alors en WebM et enregistré en temps réel : autant d’attente que le morceau dure. Tous les logiciels de montage ne lisent pas le WebM transparent.':
    'A single file, but then in WebM and recorded in real time: as much waiting as the piece lasts. Not every editor reads transparent WebM.',
  Format: 'Format',
  'mp4 — pour le montage': 'mp4 — for editing',
  'WebM — pour le web': 'WebM — for the web',
  'WebM — imposé par le fond': 'WebM — forced by the background',
  'Se pose dans n’importe quel logiciel de montage.': 'Drops into any editing software.',
  'Plus léger, mais Resolve et Premiere ne le lisent pas.':
    'Lighter, but Resolve and Premiere will not read it.',
  'Le fond {fond} réclame un canal alpha, que le mp4 ne sait pas transporter : en un seul fichier, la vidéo sortira en WebM quoi qu’on choisisse ici.':
    'The {fond} background needs an alpha channel, which mp4 cannot carry: as a single file, the video will come out as WebM whatever you pick here.',
  '« Noir translucide »': '“Translucent black”',
  '« Transparent »': '“Transparent”',
  Qualité: 'Quality',
  'Légère — fichier minuscule': 'Light — tiny file',
  Standard: 'Standard',
  'Nette — fichier lourd': 'Sharp — heavy file',
  'Pour une bande dans un coin de l’écran, où les chiffres sont petits de toute façon.':
    'For a band in a corner of the screen, where the numbers are small anyway.',
  'Le bon compromis pour une incrustation : une tablature est du trait sur fond uni, elle se comprime bien.':
    'The right compromise for an overlay: a tab is line work on a flat background, it compresses well.',
  'Quand la tablature occupe l’écran entier et qu’on lit les doigtés dessus.':
    'When the tab fills the screen and you read the fingerings off it.',
  'Garder la vidéo sur le serveur': 'Keep the video on the server',
  'Entendre le morceau pendant l’enregistrement': 'Hear the piece while recording',
  'Encodage…': 'Encoding…',
  'Enregistrement en temps réel…': 'Recording in real time…',
  'Envoi vers le serveur…': 'Uploading to the server…',
  ' — reste {duree}': ' — {duree} left',
  "L'export a échoué.": 'The export failed.',
  'Encodage interrompu.': 'Encoding stopped.',
  'Enregistrement interrompu.': 'Recording stopped.',
  'Préparation interrompue.': 'Preparation stopped.',
  'Envoi interrompu.': 'Upload stopped.',
  "Échec de l'encodage.": 'Encoding failed.',
  'Télécharger {nom} ({poids})': 'Download {nom} ({poids})',
  'Télécharger ({poids})': 'Download ({poids})',
  'Télécharger le cache ({poids})': 'Download the matte ({poids})',
  'Supprimer du serveur': 'Delete from the server',
  'Ce navigateur n’a pas d’encodeur mp4 : la vidéo est sortie en WebM. Resolve et Premiere ne le lisent pas — essaie depuis Chrome ou Edge.':
    'This browser has no mp4 encoder: the video came out as WebM. Resolve and Premiere will not read it — try from Chrome or Edge.',
  'Cette vidéo n’a tenu que {tenue} images par seconde sur les {demandees} demandées : la machine n’a pas suivi. Une définition plus petite ou une cadence plus basse donneront un résultat plus fluide.':
    'This video only held {tenue} frames per second out of the {demandees} asked for: the machine could not keep up. A smaller resolution or a lower frame rate will come out smoother.',

  // ---- Le mode d'emploi du cache ----
  'Comment s’en servir au montage': 'How to use it in an edit',
  'Les deux fichiers vont ensemble : l’image est posée sur noir, le cache dit en noir et blanc où elle se voit. C’est ainsi qu’on transporte de la transparence dans un mp4.':
    'The two files go together: the picture is laid on black, the matte says in black and white where it shows. That is how transparency travels inside an mp4.',
  '— pose les deux au-dessus de ta reprise, puis dans la page Color relie le cache à l’entrée alpha du nœud de l’image (clic droit sur le nœud, « Add Matte »). Coche « Post-Multiply » si les bords te paraissent doublés.':
    '— put both above your cover, then on the Color page connect the matte to the alpha input of the picture’s node (right-click the node, “Add Matte”). Tick “Post-Multiply” if the edges look doubled.',
  '— image sur une piste, cache sur celle du dessus, puis l’effet « Track Matte Key » sur l’image : cache en luminance, « Composite Using: Matte Luma ».':
    '— picture on one track, matte on the one above, then the “Track Matte Key” effect on the picture: matte set to luminance, “Composite Using: Matte Luma”.',
  '— cherche « luma matte », « luminance key » ou « masque de luminance » : c’est le même principe partout.':
    '— look for “luma matte”, “luminance key” or “luminance mask”: it is the same principle everywhere.',
  'Un seul fichier te suffit ? Repasse « Transparence » sur « Un seul fichier WebM » — c’est alors l’attente qui revient.':
    'One file is enough for you? Switch “Transparency” back to “A single WebM file” — the waiting then comes back.',

  // ---- Messages venus du serveur ----
  "Aucun compte n'existe encore.": 'No account exists yet.',
  'Aucune bande-son.': 'No soundtrack.',
  'Aucune vidéo enregistrée.': 'No video saved.',
  'Aucune vidéo à qui attacher ce cache.': 'No video to attach this matte to.',
  'Cet identifiant est déjà pris.': 'That username is already taken.',
  "Cette vidéo n'a pas de cache.": 'This video has no matte.',
  "Code d'invitation expiré.": 'Invitation code expired.',
  "Code d'invitation invalide ou déjà utilisé.": 'Invitation code invalid or already used.',
  'Compte introuvable.': 'Account not found.',
  'Corps de requête invalide.': 'Invalid request body.',
  'Durée invalide.': 'Invalid duration.',
  'Fichier introuvable.': 'File not found.',
  'Format audio non reconnu (mp3, ogg, wav, m4a, flac).':
    'Audio format not recognised (mp3, ogg, wav, m4a, flac).',
  'Identifiant ou mot de passe incorrect.': 'Wrong username or password.',
  'Invitation introuvable.': 'Invitation not found.',
  'Le compte administrateur ne peut pas être supprimé.':
    'The administrator account cannot be deleted.',
  'Les réglages doivent être un objet.': 'Settings must be an object.',
  'Les réglages ne sont pas sérialisables.': 'Settings are not serialisable.',
  'Les réglages sont trop volumineux.': 'Settings are too large.',
  'Morceau introuvable.': 'Piece not found.',
  'Mot de passe actuel incorrect.': 'Current password is wrong.',
  'Mot de passe trop court (6 caractères min).': 'Password too short (6 characters minimum).',
  'Non authentifié': 'Not signed in',
  'On ne supprime pas son propre compte.': 'You cannot delete your own account.',
  'Origine non autorisée': 'Origin not allowed',
  'Route inconnue': 'Unknown route',
  'Réglages manquants.': 'Settings missing.',
  "Réservé à l'administrateur.": 'Administrator only.',
  'Trop de tentatives de connexion. Réessayez dans quelques minutes.':
    'Too many sign-in attempts. Try again in a few minutes.',
  'Trop de tentatives. Réessayez dans quelques minutes.':
    'Too many attempts. Try again in a few minutes.',
  'Un compte existe déjà.': 'An account already exists.',
  'Utilisateur introuvable.': 'User not found.',
}
