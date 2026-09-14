# Videotab

*[English version](README.md)* · *[Journal des changements](CHANGELOG.md)*

Déposer une tablature, repartir avec une vidéo où un curseur suit la musique — le plus souvent
une bande horizontale qui glisse sous une tête de lecture fixe, à incruster au bas d'une vidéo
de reprise. Un fichier Guitar Pro apporte ses notes, son tempo et son découpage : le curseur
se pose exactement sur le temps joué, la bande-son sort du synthétiseur, et chaque corde peut
avoir sa couleur. Un PDF n'est qu'une image : l'atelier y détecte les lignes de tablature, les
découpe, les recolle en une seule bande, et il ne reste qu'à donner un tempo. **Auto-hébergée** :
un seul conteneur Docker, aucune base de données externe, aucun compte à créer chez un tiers,
et rien qui ne quitte ta machine.

## Lancer avec Docker (recommandé)

```bash
docker compose up -d
```

Ça télécharge l'image publiée `ghcr.io/fuzzinvaders/videotab:latest` — rien à construire.
Pour partir des sources à la place (ex. après avoir modifié le code), décommente `build` dans
[docker-compose.yml](docker-compose.yml) et lance `docker compose up -d --build`.

Ouvre `http://localhost:8080`. Au tout premier accès, l'app demande de créer le premier
compte (identifiant + mot de passe) : c'est l'administrateur, et c'est lui qui distribue des
codes d'invitation à qui doit partager la bibliothèque.

Mettre à jour une instance existante :

```bash
docker compose pull && docker compose up -d
```

Les données (comptes, tablatures, réglages, vidéos produites) vivent dans le volume Docker
`videotab-data`, monté sur `/data` — elles survivent à `docker compose down` / `up`.

## Déployer derrière Traefik

```bash
docker network create proxy   # si le réseau n'existe pas encore
docker compose -f docker-compose.traefik.yml up -d
```

Copie [.env.example](.env.example) en `.env` à côté de ce fichier et renseigne au moins
`DOMAIN` (par exemple `videotab.exemple.fr`) — `ORIGIN` en est déduit automatiquement. Aucun
port n'est publié sur l'hôte : Traefik route le trafic par le réseau partagé `proxy`, en
HTTPS.

## Développement (sans Docker)

Deux processus côte à côte :

```bash
npm install
npm run dev:server   # API + données, sur http://localhost:3000 (fichiers dans ./.data)
npm run dev          # front Vite avec rechargement à chaud, sur http://localhost:5173
```

Ouvre `http://localhost:5173` — Vite relaie `/api` vers le serveur ci-dessus. `npm test`
(vitest) couvre le minutage, la détection des systèmes, la validation serveur et les
opérations de bibliothèque.

## Comment ça marche

- **Importer** — glisse un fichier sur la page d'accueil. Guitar Pro (`.gp`, `.gp3` à `.gp5`,
  `.gpx`), MusicXML (`.musicxml`, `.mxl`, `.xml`), Capella, alphaTex, ou un PDF. Le titre est
  tiré du nom du fichier, et l'atelier s'ouvre dans la foulée.
- **L'aperçu est la vidéo.** L'image affichée dans le lecteur est dessinée par le code qui
  dessinera la vidéo, à la définition de la vidéo. Ce qu'on voit avant de lancer les trois
  minutes d'encodage est donc ce qu'on obtiendra après.
- **Guitar Pro** — choisir la piste (une seule donne une vidéo lisible), le tempo, la
  tablature seule ou avec la portée, la rythmique sous la tablature, le métronome, et le
  départ à la première note plutôt qu'à la première mesure — une basse qui entre au bout de
  deux mesures ouvrirait sinon la vidéo sur deux mesures muettes. La
  rythmique est là par défaut : un chiffre dit où poser le doigt, pas combien de temps l'y
  laisser. Le tempo est appliqué à la **partition**,
  pas au lecteur : le son, l'image et la durée annoncée le suivent tous les trois.
- **PDF** — « Détecter les lignes » cherche les portées sur chaque page et en propose le
  découpage. Il se corrige à la main : on tire un rectangle pour ajouter une ligne, on attrape
  ses bords pour l'ajuster, on change son nombre de mesures dans le coin. Reste à donner un
  tempo — au chiffre, ou en le tapant du doigt sur le bouton **Taper** pendant qu'on écoute.
- **Bande-son d'un PDF** — un PDF ne contient aucune note qu'une machine puisse jouer. On peut
  donc y joindre l'enregistrement du morceau (mp3, wav, ogg, m4a, flac), et caler le départ
  avec le **décalage** : le temps qui passe avant la première note.
- **Disposition** — *défilement horizontal* (par défaut) : une seule bande qui glisse sous une
  tête de lecture fixe. Le zoom se règle en **mesures à l'écran** — quatre par défaut — et la
  hauteur de la bande en découle, aussi courte que la tablature l'exige : tout ce qu'elle ne
  prend pas reste visible de la vidéo posée dessous. L'air laissé autour se règle à part. Le regard ne bouge plus, il
  attend que la musique arrive, et ça tient dans un bandeau au bas d'une vidéo de reprise.
  *Mesures fixes* : la même bande, mais immobile — c'est le curseur qui la traverse, et la page
  tourne à la fin. Une mesure n'est jamais coupée, la fenêtre en met donc autant qu'il en
  entre, et la dernière est montrée en avance puis rouvre la fenêtre suivante : la page tourne
  pile en arrivant sur elle, donc jamais sur du tout-inconnu et jamais avant que le curseur
  ait traversé tout l'écran. Le tournement se fait en fondu, pas en coupure. Un chiffre qui ne bouge pas se déchiffre, un
  chiffre qui glisse ne se suit que de loin.
  *Page* : la partition entière qui défile vers le bas, pour travailler un morceau plutôt que
  pour l'illustrer.
- **Thèmes** — cinq, dont **Cordes colorées** : fond sombre, lignes grises, et une couleur par
  corde. La couleur dit sur quelle corde jouer, le chiffre dit à quelle case ; l'œil trouve la
  corde avant d'avoir lu le chiffre. L'ordre part du grave (mi rouge, la jaune, ré bleu…), ce
  qui fait qu'une basse à quatre cordes et une guitare à sept se lisent pareil. Et aussi :
  Papier, Ardoise, Néon, Craie.
- **Encadrement** — aucun, carte à coins arrondis, halo coloré, bandes translucides, ou
  vignette, avec l'épaisseur du trait en réglage — comptée sur la largeur, donc du même poids
  en 720p qu'en vertical. En défilement, les deux bouts de la bande s'effacent en dégradé : une mesure qui
  apparaît d'un coup au bord de l'image attire l'œil au mauvais moment. En mesures fixes, non :
  la mesure du bord est justement celle qu'on donne à lire en avance.
- **Curseur** — le trait à l'instant exact, le surlignage du temps en cours, ou les deux ;
  glissant entre les notes, ou sautant de l'une à l'autre. Sur
  une tablature serrée les deux disent la même chose et se gênent ; sur une vidéo regardée de
  loin, les deux valent mieux qu'un. La couleur suit le thème tant qu'on n'en choisit pas une,
  et le bouton **Auto** l'y ramène.
- **Vidéo** — 1080p, 720p ou format vertical pour un téléphone ; 24, 30 ou 60 images par
  seconde ; décompte avant le départ ; fondu ; titre et barre de progression qu'on peut couper.
- **Exporter** — la vidéo est fabriquée dans l'onglet et **en temps réel** (voir plus bas).
  Elle se télécharge, et se garde sur le serveur si on coche la case — pour la retrouver
  depuis une autre machine.

## Incruster la tablature dans une reprise

C'est ce pour quoi l'application existe. Trois réglages y suffisent :

1. **Disposition : défilement horizontal**, ou mesures fixes. Dans les deux cas la tablature
   devient un bandeau, pas une page.
2. **Fond : transparent** — ou **vert d'incrustation** si le logiciel de montage préfère.
   Transparent produit un WebM VP8 à canal alpha ; c'est plus propre, mais tous les navigateurs
   ne l'encodent pas et tous les montages ne le lisent pas, et l'interface le dit avant qu'on
   appuie. Le vert, lui, marche partout.
3. **Cadrage : hauteur de la bande.** La vidéo ne fait plus que la hauteur de la tablature —
   1920×230 sur une tablature de basse à quatre mesures — donc elle pèse ce qu'elle montre et
   se pose au montage sans qu'on cherche où est la tablature dedans.
4. **Titre et barre de progression coupés**, si la vidéo de reprise porte déjà les siens.

Le reste — hauteur de la bande, position de la tête de lecture, thème — se règle en regardant
l'aperçu, qui est l'image exacte qui sera encodée.

Pour un PDF, le détourage se fait tout seul sur les thèmes sans papier : le blanc de la page
devient transparent et les traits prennent la couleur du thème. Ce n'est **pas** une inversion
— une inversion rendrait le papier noir et opaque, et la tablature arriverait dans un
rectangle noir posé sur la reprise.

## L'export se fait dans le navigateur

C'est le choix d'architecture principal, et il a des conséquences visibles.

Le serveur ne lit aucune tablature, ne dessine aucune portée et n'encode aucune vidéo. Tout
cela se passe dans le navigateur, qui a déjà un moteur de rendu, un synthétiseur et un
encodeur vidéo — trois choses qu'il faudrait autrement installer sur l'hôte, et qui rendraient
impossible l'hébergement sur un NAS. Le serveur garde les fichiers et les comptes,
c'est-à-dire exactement ce qu'un onglet fermé ne sait pas garder.

En échange :

- **L'encodage dure aussi longtemps que le morceau.** `MediaRecorder` est un magnétophone, pas
  un moteur de rendu : il horodate ce qu'il reçoit avec l'horloge du mur. Trois minutes de
  morceau demandent trois minutes.
- **L'onglet doit rester ouvert**, mais pas devant. L'encodage est cadencé par le fil audio,
  que le navigateur ne ralentit jamais : la vidéo garde sa cadence pleine pendant que tu
  travailles dans une autre fenêtre. Le fermer, en revanche, l'interrompt. Une nuance : tant
  que l'onglet est caché, les images se posent sur la grille de la carte son, environ
  10,7 ms, qui divise le 30 images par seconde plus régulièrement que le 60 — c'est donc le
  choix le plus sûr pour un export qu'on laisse tourner.
- **Le format est du WebM** (VP9 + Opus) partout sauf sur Safari, qui produit du mp4. Les deux
  sont acceptés par YouTube, Instagram et les logiciels de montage courants.

## Sauvegarder

Le volume Docker survit à `docker compose down`, mais **pas à la perte de la machine**. La
sauvegarde la plus simple en recopie le contenu :

```bash
docker run --rm -v videotab_videotab-data:/data -v "$PWD":/out alpine \
  tar czf /out/videotab-$(date +%F).tar.gz -C /data .
```

Pour restaurer, l'inverse, conteneur arrêté :

```bash
docker compose down
docker run --rm -v videotab_videotab-data:/data -v "$PWD":/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/videotab-2026-09-01.tar.gz -C /data"
docker compose up -d
```

Les vidéos produites pèsent lourd. Si la sauvegarde doit rester légère, `sources/` et les deux
fichiers JSON suffisent à tout reconstruire : une vidéo se réexporte, une tablature non.

## Mot de passe oublié

Videotab n'envoie aucun courrier : un écran de récupération ne pourrait vérifier l'identité de
personne. Le droit vient de l'accès à la machine :

```bash
docker exec videotab node tools/motdepasse.js <identifiant>
```

Sans mot de passe en argument, il en tire un au hasard et l'affiche — rien ne passe par
l'historique du shell. Toutes les sessions ouvertes sont fermées ; redémarre le conteneur pour
que ce soit pris en compte.

## Architecture

- Front : React + TypeScript + Vite + Tailwind, PWA installable ([vite.config.ts](vite.config.ts)).
- Back : [server/server.js](server/server.js), Node nu, **sans aucune dépendance npm**, qui
  sert à la fois les fichiers construits et l'API REST sous `/api/*`.
- Données : [server/store.js](server/store.js) — `users.json` (comptes, secret de session,
  invitations), `morceaux.json` (la bibliothèque), et les fichiers lourds sur le disque, dans
  `sources/` et `videos/`. Écritures atomiques (fichier temporaire puis rename) ; les
  tablatures et les vidéos sont écrites en flux, jamais chargées en mémoire.
- Comptes : mots de passe dérivés par scrypt, session en cookie signé HMAC-SHA256
  (`httpOnly`, `SameSite=Lax`). Connexions et inscriptions freinées (10 échecs par quart
  d'heure et par IP).
- Le **nom d'un fichier sur le disque vient de l'identifiant du morceau**, jamais du nom
  envoyé par le navigateur : c'est ce qui écarte d'un coup les `../`, les caractères interdits
  et les collisions entre deux « tablature.pdf ».
- **Une seule scène pour deux mondes** ([src/lib/scene.ts](src/lib/scene.ts)). Guitar Pro et
  PDF se réduisent au même objet — une image, et un rectangle qui s'y déplace au fil du temps.
  L'aperçu et la vidéo appellent le même `dessiner(ctx, t)`. La seule vraie bifurcation du
  fichier est la disposition : en page on suit le curseur en `y` avec un lissage, en
  défilement on le maintient en `x` sans lissage — la position y est déjà continue, et la
  lisser n'ajouterait qu'un retard entre le son et l'image — et en mesures fixes la bande ne
  bouge pas du tout entre deux tournements de page, ce qui est tout l'intérêt de la choisir.
- **Les thèmes** ([src/lib/themes.ts](src/lib/themes.ts)) agissent à trois moments distincts :
  les couleurs que la scène peint, celles qu'alphaTab reçoit **avant** de dessiner (une portée
  n'est pas une image qu'on retouche après coup), et la couleur de chaque corde, posée note
  par note dans le modèle via `NoteStyle`.
- **Guitar Pro** ([src/lib/gp.ts](src/lib/gp.ts)) : alphaTab dessine la partition *et* la
  joue. Le lien entre les deux est la table des tics, construite pendant l'export audio — à
  chaque tranche produite, le synthétiseur dit à quel tic et à quelle milliseconde il en est.
  L'image et le son viennent donc de la même lecture, et ne peuvent pas se décaler.
- **PDF** ([src/lib/pdf.ts](src/lib/pdf.ts), [src/lib/systemes.ts](src/lib/systemes.ts)) : les
  portées sont trouvées par un profil d'encre ligne par ligne — six longs traits horizontaux
  serrés, c'est la signature d'une tablature. Le minutage, lui, est une arithmétique pure
  ([src/lib/minutage.ts](src/lib/minutage.ts)), donc testable sans navigateur.
- **Vidéo** ([src/lib/video.ts](src/lib/video.ts)) : `canvas.captureStream` + `MediaRecorder`,
  l'horloge étant celle du contexte audio quand il y a une bande-son — c'est elle que le son
  suivra, et une image calculée d'après une autre horloge finirait décalée.

## Licence

[AGPL-3.0-or-later](LICENSE). alphaTab est distribué sous MPL-2.0, pdf.js sous Apache-2.0, la
police Bravura sous OFL et la banque de sons Sonivox sous Apache-2.0.
