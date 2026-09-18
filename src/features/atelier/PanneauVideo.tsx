import { Card } from '../../components/ui/Card'
import { Field, Option, Select } from '../../components/ui/Field'
import { useT } from '../../lib/langue'
import { fondAvecAlpha } from '../../lib/reglages'
import { THEMES, themeParId } from '../../lib/themes'
import type {
  Cadrage,
  Cadre,
  Disposition,
  FondVideo,
  ReglagesVideo,
  StyleCurseur,
} from '../../lib/types'
import { alphaPossible } from '../../lib/video'

/* Trois définitions, pas douze. 1080p pour publier, 720p quand la machine peine à encoder en
   temps réel, et le format vertical pour ce qui finit sur un téléphone. */
const DEFINITIONS = [
  { label: '1080p — 1920 × 1080', largeur: 1920, hauteur: 1080 },
  { label: '720p — 1280 × 720', largeur: 1280, hauteur: 720 },
  { label: 'Vertical — 1080 × 1920', largeur: 1080, hauteur: 1920 },
]

const DISPOSITIONS: Array<{ id: Disposition; nom: string; aide: string }> = [
  {
    id: 'defilement',
    nom: 'Défilement horizontal',
    aide: 'Une seule bande qui glisse sous une tête de lecture fixe. Le regard ne bouge plus, il attend que la musique arrive.',
  },
  {
    id: 'mesures',
    nom: 'Mesures fixes',
    aide: 'La même bande, mais immobile : c’est le curseur qui la traverse, et la page tourne à la fin. Un chiffre qui ne bouge pas se déchiffre — sur une tablature serrée, c’est souvent plus lisible.',
  },
  {
    id: 'page',
    nom: 'Page',
    aide: 'La partition entière, qui défile vers le bas. Pour travailler un morceau plutôt que pour l’illustrer.',
  },
]

const CADRES: Array<{ id: Cadre; nom: string }> = [
  { id: 'aucun', nom: 'Aucun' },
  { id: 'verre', nom: 'Verre — filet fin, reflet et ombre portée' },
  { id: 'accent', nom: 'Accent — un trait de couleur en bas' },
  { id: 'carte', nom: 'Carte — coins arrondis et filet' },
  { id: 'lueur', nom: 'Lueur — halo de la couleur du curseur' },
  { id: 'bandes', nom: 'Bandes — fond translucide et liserés' },
  { id: 'vignette', nom: 'Vignette — bords assombris' },
]

const STYLES: Array<{ id: StyleCurseur; nom: string; aide: string }> = [
  {
    id: 'les-deux',
    nom: 'Trait et surlignage',
    aide: 'Le trait pour l’instant exact, le surlignage pour le temps en cours.',
  },
  {
    id: 'trait',
    nom: 'Trait seul',
    aide: 'Rien que la barre verticale. Le plus lisible sur une tablature serrée, où le surlignage se confond avec le trait qui le traverse.',
  },
  {
    id: 'surlignage',
    nom: 'Surlignage seul',
    aide: 'Rien que le temps en cours, comme une partition qu’on annoterait au fluo. Sans temps à désigner — un PDF en défilement — le trait revient tout seul.',
  },
]

/* Les encadrements qui tracent un trait, et donc les seuls dont l'épaisseur veuille dire
   quelque chose. La vignette n'assombrit que les bords ; « aucun » ne dessine rien. */
/* Le verre n'y est pas : son filet est fixe et volontairement ténu. L'épaissir en ferait une
   bordure, et la bordure a déjà son cadre — la carte. */
const AVEC_TRAIT = new Set<Cadre>(['carte', 'lueur', 'bandes', 'accent'])

/* Ceux dont les coins sont arrondis — donc ceux qui ne tiennent leur promesse que sur un fond
   qui laisse passer l'image de dessous. */
const COINS_ARRONDIS = new Set<Cadre>(['carte', 'verre', 'lueur'])

const COULEURS = ['#4ade80', '#f59e0b', '#ef4444', '#38bdf8', '#a855f7', '#ec4899', '#ffffff']

export function PanneauMiseEnScene({
  video,
  modifier,
}: {
  video: ReglagesVideo
  modifier: (mutation: (v: ReglagesVideo) => ReglagesVideo) => void
}) {
  const t = useT()
  const theme = themeParId(video.theme)
  const enBande = video.disposition !== 'page'
  const parBlocs = video.disposition === 'mesures'

  return (
    <Card className="space-y-4">
      <h2 className="font-medium text-slate-200">Mise en scène</h2>

      <div className="space-y-2">
        {DISPOSITIONS.map((choix) => (
          <label
            key={choix.id}
            className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
              video.disposition === choix.id
                ? 'border-amber-600 bg-amber-950/30'
                : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <input
                type="radio"
                name="disposition"
                checked={video.disposition === choix.id}
                onChange={() => modifier((v) => ({ ...v, disposition: choix.id }))}
                className="accent-amber-500"
              />
              {t(choix.nom)}
            </span>
            <span className="mt-1 block text-xs text-slate-400">{t(choix.aide)}</span>
          </label>
        ))}
      </div>

      <Field label="Thème" hint={theme.description}>
        <Select
          value={video.theme}
          /* Rien d'autre à faire que changer le thème : la couleur du curseur le suit d'elle-
             même tant qu'elle vaut `null`. C'est tout l'intérêt de ne pas la stocker — la
             version précédente cherchait l'ancienne couleur dans la palette pour deviner si
             elle avait été choisie, et se trompait dès qu'un thème en proposait une qui n'y
             figurait pas : le violet du thème Néon restait ensuite collé à tous les autres. */
          onChange={(e) => modifier((v) => ({ ...v, theme: themeParId(e.target.value).id }))}
        >
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {t(theme.nom)}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-1.5">
        {[theme.fond, theme.papier ?? theme.fond, theme.lignes, theme.encre, theme.curseur].map(
          (couleur, i) => (
            <span
              key={i}
              style={{ backgroundColor: couleur }}
              className="h-6 flex-1 rounded border border-slate-700"
            />
          ),
        )}
        {theme.cordes ? (
          <span className="ml-2 flex flex-1 overflow-hidden rounded border border-slate-700">
            {theme.cordes.map((couleur) => (
              <span key={couleur} style={{ backgroundColor: couleur }} className="h-6 flex-1" />
            ))}
          </span>
        ) : null}
      </div>

      {enBande ? (
        <>
          <Curseur
            label="Mesures à l’écran"
            valeur={video.mesuresVisibles}
            min={1}
            max={16}
            pas={1}
            affichage={t('{n} mesures', { n: video.mesuresVisibles })}
            aide={
              parBlocs
                ? 'C’est ce réglage qui fait le zoom, et la fenêtre en montre autant qu’il en entre à cette taille-là — parfois une de plus, parfois une de moins, plutôt que d’en couper une.'
                : 'C’est ce réglage qui fait le zoom : moins de mesures, des chiffres plus gros, une bande plus haute. La hauteur suit toute seule.'
            }
            onChange={(mesuresVisibles) => modifier((v) => ({ ...v, mesuresVisibles }))}
          />
          {/* Le zoom reste sous la main : c'est le seul de ces réglages qu'on retouche
              vraiment. Les autres se posent une fois pour un morceau. */}
          <Repli titre="Cadrage de la bande">
            <Curseur
              label="Air autour de la tablature"
              valeur={video.margeBande}
              min={0}
              max={1.5}
              pas={0.05}
              affichage={
                video.margeBande === 0 ? t('au ras') : `${Math.round(video.margeBande * 100)} %`
              }
              aide="De l’espace au-dessus et en dessous, en proportion de la tablature. À zéro elle touche les bords de la bande ; en ouvrant, on laisse revenir ce qui dépasse — hampes, rythmes, nom de section."
              onChange={(margeBande) => modifier((v) => ({ ...v, margeBande }))}
            />
            <Curseur
              label="Hauteur maximale"
              valeur={video.hauteurMax}
              min={0.1}
              max={0.9}
              pas={0.01}
              affichage={t('{n} % de l’image', { n: Math.round(video.hauteurMax * 100) })}
              aide="Un plafond, pas une cible : la bande reste aussi courte que la tablature l’exige. Il ne s’applique que si elle le dépasse, et on voit alors plus de mesures que demandé."
              onChange={(hauteurMax) => modifier((v) => ({ ...v, hauteurMax }))}
            />
            {/* Chaque mode a son réglage d'avancée, et l'autre n'a aucun sens chez lui : sans
              tablature qui glisse il n'y a pas de tête de lecture, et sans page qui tourne il
              n'y a rien à montrer en avance. */}
            {parBlocs ? (
              <Curseur
                label="Mesures d’avance"
                valeur={video.anticipation}
                min={0}
                max={4}
                pas={1}
                affichage={
                  video.anticipation === 0
                    ? t('aucune')
                    : t('{n} mesures', { n: video.anticipation })
                }
                aide="Les dernières mesures de la fenêtre, montrées avant d’être jouées : elles rouvrent la fenêtre suivante. À une, la page tourne pile en arrivant sur la dernière mesure affichée — le curseur a donc traversé tout l’écran. En demander plus fait tourner plus tôt, et laisse plus de temps pour lire ce qui vient."
                onChange={(anticipation) => modifier((v) => ({ ...v, anticipation }))}
              />
            ) : (
              <Curseur
                label="Tête de lecture"
                valeur={video.teteX}
                min={0.1}
                max={0.7}
                pas={0.01}
                affichage={t('{n} % depuis la gauche', { n: Math.round(video.teteX * 100) })}
                aide="À gauche, on voit venir la suite de loin ; au milieu, on garde autant de passé que d’avenir."
                onChange={(teteX) => modifier((v) => ({ ...v, teteX }))}
              />
            )}
          </Repli>
        </>
      ) : null}

      {enBande ? (
        <Bascule
          label="Effacer les bouts de la bande"
          actif={video.bordsFondus}
          aide={
            video.disposition === 'mesures'
              ? 'Les côtés sont là où une mesure se trouve coupée en deux. En mesures fixes c’est un arbitrage : la dernière mesure affichée est celle qu’on donne à lire en avance, et l’estomper atténue ce qu’on avait ajouté pour être vu.'
              : 'Les côtés sont là où une mesure se trouve coupée en deux : une moitié qui s’efface se lit comme une suite, une moitié tranchée net se lit comme une erreur.'
          }
          onChange={(bordsFondus) => modifier((v) => ({ ...v, bordsFondus }))}
        />
      ) : null}

      <Field
        label="Encadrement"
        hint={
          COINS_ARRONDIS.has(video.cadre) && !fondAvecAlpha(video.fond)
            ? 'Sur un fond opaque, les coins restent carrés : un fichier sans transparence ne sait pas laisser un coin vide, il le remplit de noir. Prends un fond translucide ou transparent pour que la carte se découpe vraiment — et le verre pour qu’elle porte son ombre.'
            : COINS_ARRONDIS.has(video.cadre) && video.cadrage !== 'bande'
              ? 'Les coins arrondis ne découpent l’image que si elle est cadrée sur la bande : sur une image entière, la carte flotte au milieu d’une page qui reste pleine.'
              : undefined
        }
      >
        <Select
          value={video.cadre}
          onChange={(e) => modifier((v) => ({ ...v, cadre: e.target.value as Cadre }))}
        >
          {CADRES.map((c) => (
            <option key={c.id} value={c.id}>
              {t(c.nom)}
            </option>
          ))}
        </Select>
      </Field>

      {/* Rien à épaissir sans trait : la vignette n'assombrit que les bords, et « aucun » ne
          dessine rien du tout. */}
      {AVEC_TRAIT.has(video.cadre) ? (
        <Curseur
          label="Épaisseur du cadre"
          valeur={video.epaisseurCadre}
          min={0}
          max={24}
          pas={1}
          affichage={
            video.epaisseurCadre === 0
              ? t('sans trait')
              : `${Math.round(video.epaisseurCadre * (video.largeur / 1920))} px`
          }
          aide={
            video.cadre === 'lueur'
              ? 'Le filet autour de la bande. Le halo, lui, ne bouge pas — c’est lui qui fait la lueur, et à zéro il reste seul.'
              : 'Comptée sur une image large de 1920 et suivie à l’échelle : le cadre garde le même poids en 720p comme en vertical.'
          }
          onChange={(epaisseurCadre) => modifier((v) => ({ ...v, epaisseurCadre }))}
        />
      ) : null}
    </Card>
  )
}

export function PanneauVideo({
  video,
  modifier,
}: {
  video: ReglagesVideo
  modifier: (mutation: (v: ReglagesVideo) => ReglagesVideo) => void
}) {
  const t = useT()
  const theme = themeParId(video.theme)
  const definition =
    DEFINITIONS.find((d) => d.largeur === video.largeur && d.hauteur === video.hauteur)?.label ??
    DEFINITIONS[0].label
  const alpha = alphaPossible()

  return (
    <Card className="space-y-4">
      <h2 className="font-medium text-slate-200">Vidéo</h2>

      <Field label="Définition">
        <Select
          value={definition}
          onChange={(e) => {
            const choix = DEFINITIONS.find((d) => d.label === e.target.value)
            if (choix)
              modifier((v) => ({
                ...v,
                largeur: choix.largeur,
                hauteur: choix.hauteur,
              }))
          }}
        >
          {DEFINITIONS.map((d) => (
            <option key={d.label}>{d.label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Images par seconde" hint="30 suffit pour un curseur ; 60 coûte le double.">
        <Select
          value={String(video.fps)}
          onChange={(e) => modifier((v) => ({ ...v, fps: Number(e.target.value) }))}
        >
          <option value="24">24</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </Select>
      </Field>

      <Field
        label="Cadrage"
        hint={
          video.cadrage === 'bande'
            ? 'La vidéo fait la hauteur de la bande, et rien de plus. Elle pèse ce qu’elle montre et se pose au montage sans chercher où est la tablature dedans.'
            : 'Le format annoncé ci-dessus, la bande au milieu.'
        }
      >
        <Select
          value={video.cadrage}
          onChange={(e) => modifier((v) => ({ ...v, cadrage: e.target.value as Cadrage }))}
          disabled={video.disposition === 'page'}
        >
          <Option value="image">Image entière</Option>
          <Option value="bande">Hauteur de la bande</Option>
        </Select>
      </Field>

      <Field
        label="Fond"
        hint={
          video.fond === 'chroma'
            ? 'Un vert plein, à détourer dans le montage. Ça marche partout, y compris sur Safari.'
            : video.fond === 'degrade'
              ? alpha
                ? 'Le voile s’efface vers le haut et vers le bas : la bande n’a plus d’arête du tout. Comme la transparence, ça impose le WebM et l’encodage en temps réel.'
                : 'Ce navigateur ne sait pas encoder la transparence — le dégradé sortira opaque. Prends plutôt le fond vert.'
              : video.fond === 'voile'
                ? alpha
                  ? 'La reprise se voit à travers, assombrie. Comme la transparence, ça impose le WebM et l’encodage en temps réel.'
                  : 'Ce navigateur ne sait pas encoder la transparence — le voile sortira opaque. Prends plutôt le fond vert.'
                : video.fond === 'transparent'
                  ? alpha
                    ? 'Vraie transparence, en WebM VP8. À vérifier : tous les logiciels de montage ne la lisent pas.'
                    : 'Ce navigateur ne sait pas encoder la transparence — la vidéo sortira sur le fond du thème. Prends plutôt le fond vert.'
                  : video.fond === 'noir'
                    ? 'Un noir plein, quel que soit le thème. Le thème garde la main sur les couleurs de la tablature.'
                    : 'Le fond du thème, opaque.'
        }
      >
        <Select
          value={video.fond}
          onChange={(e) => modifier((v) => ({ ...v, fond: e.target.value as FondVideo }))}
        >
          <Option value="theme">Couleur du thème</Option>
          <Option value="noir">Noir</Option>
          <Option value="voile">Noir translucide</Option>
          <Option value="degrade">Noir dégradé — sans bord</Option>
          <Option value="chroma">Vert d’incrustation</Option>
          <Option value="transparent">Transparent</Option>
        </Select>
      </Field>

      {video.fond === 'voile' || video.fond === 'degrade' ? (
        <Curseur
          label="Opacité du fond"
          valeur={video.opaciteFond}
          min={0.1}
          max={1}
          pas={0.05}
          affichage={`${Math.round(video.opaciteFond * 100)} %`}
          aide="Le seul réglage qui arbitre entre deux choses qu’on veut toutes les deux : voir sa reprise derrière la tablature, et lire la tablature."
          onChange={(opaciteFond) => modifier((v) => ({ ...v, opaciteFond }))}
        />
      ) : null}

      <Repli titre="Curseur">
        <Field
          label="Curseur"
          hint={t(STYLES.find((s) => s.id === video.curseurStyle)?.aide ?? '')}
        >
          <Select
            value={video.curseurStyle}
            onChange={(e) =>
              modifier((v) => ({
                ...v,
                curseurStyle: e.target.value as StyleCurseur,
              }))
            }
          >
            {STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {t(style.nom)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Déplacement du curseur"
          hint={
            video.curseurGlisse
              ? 'Exact à chaque instant, mais la vitesse y varie : une partition n’espace pas ses notes au prorata de leur durée, et le curseur doit courir puis ramper. Sur une bande qui défile ça ne se voit pas ; en mesures fixes, il est seul à bouger.'
              : 'Le curseur se pose sur la note qui sonne et l’y attend. On perd où l’on en est entre deux notes, on gagne une pulsation régulière.'
          }
        >
          <Select
            value={video.curseurGlisse ? 'glisse' : 'saute'}
            onChange={(e) =>
              modifier((v) => ({
                ...v,
                curseurGlisse: e.target.value === 'glisse',
              }))
            }
          >
            <Option value="glisse">Glissant — il suit la musique en continu</Option>
            <Option value="saute">Au temps — il saute de note en note</Option>
          </Select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-300">Couleur du curseur</span>
          <div className="flex flex-wrap items-center gap-2">
            {/* « Automatique » est une valeur à part entière, pas l'absence de choix : c'est
              elle qui fait suivre le thème, et c'est elle qu'on retrouve pour se dépanner
              après avoir essayé les couleurs une à une. */}
            <button
              onClick={() => modifier((v) => ({ ...v, couleur: null }))}
              style={{ backgroundColor: theme.curseur }}
              className={`flex h-8 items-center rounded-full px-3 text-xs font-medium text-neutral-950 ring-offset-2 ring-offset-slate-900 transition-all ${
                video.couleur === null ? 'ring-2 ring-slate-100' : ''
              }`}
              title="Reprendre la couleur du thème"
            >
              Auto
            </button>
            {COULEURS.map((couleur) => (
              <button
                key={couleur}
                onClick={() => modifier((v) => ({ ...v, couleur }))}
                style={{ backgroundColor: couleur }}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-slate-900 transition-all ${
                  video.couleur === couleur ? 'ring-2 ring-slate-100' : ''
                }`}
                aria-label={`Curseur ${couleur}`}
              />
            ))}
            {/* Une couleur figée venue d'ailleurs (un thème d'avant, un JSON à la main) a droit
              à sa pastille : sans elle, aucune ne serait entourée et l'écran donnerait à
              croire que le réglage ne répond plus. */}
            {video.couleur && !COULEURS.includes(video.couleur) ? (
              <button
                onClick={() => modifier((v) => ({ ...v, couleur: video.couleur }))}
                style={{ backgroundColor: video.couleur }}
                className="h-8 w-8 rounded-full ring-2 ring-slate-100 ring-offset-2 ring-offset-slate-900"
                aria-label={`Curseur ${video.couleur}`}
              />
            ) : null}
          </div>
        </div>

        {video.curseurStyle !== 'trait' ? (
          <Curseur
            label="Opacité du surlignage"
            valeur={video.opacite}
            min={0}
            max={0.8}
            pas={0.05}
            affichage={`${Math.round(video.opacite * 100)} %`}
            onChange={(opacite) => modifier((v) => ({ ...v, opacite }))}
          />
        ) : null}
      </Repli>

      <Repli titre="Finitions">
        <Curseur
          label="Décompte avant le départ"
          valeur={video.compteAvantTemps}
          min={0}
          max={16}
          pas={1}
          affichage={
            video.compteAvantTemps === 0
              ? t('aucun')
              : t('{n} temps', { n: video.compteAvantTemps })
          }
          aide="Compté en temps et non en secondes : les clics tombent sur la noire du morceau, et le dernier juste avant la première note. Quatre temps font une mesure à quatre-quatre."
          onChange={(compteAvantTemps) => modifier((v) => ({ ...v, compteAvantTemps }))}
        />

        <div className="space-y-2">
          {/* Sans clics, le décompte ne compte que pour qui regarde l'écran — et pas pour
              qui pose ses doigts sur le manche, à qui il est pourtant destiné. */}
          {video.compteAvantTemps > 0 ? (
            <Bascule
              label="Clics pendant le décompte"
              actif={video.decompteSonore}
              onChange={(decompteSonore) => modifier((v) => ({ ...v, decompteSonore }))}
            />
          ) : null}
          <Bascule
            label="Titre et artiste en haut"
            actif={video.bandeau}
            onChange={(bandeau) => modifier((v) => ({ ...v, bandeau }))}
          />
          <Bascule
            label="Barre de progression en bas"
            actif={video.barreDeProgression}
            onChange={(barreDeProgression) => modifier((v) => ({ ...v, barreDeProgression }))}
          />
          <Bascule
            label="Fondu au début et à la fin"
            actif={video.fondu}
            onChange={(fondu) => modifier((v) => ({ ...v, fondu }))}
          />
        </div>
      </Repli>
    </Card>
  )
}

/**
 * Un groupe de réglages qu'on déplie quand on en a besoin.
 *
 * Tout mettre à plat faisait une page à n'en plus finir, et la plupart de ces réglages se
 * touchent une fois puis plus jamais. Le `details` du navigateur y suffit, sans état à tenir
 * ni composant à écrire : on rouvre ce qu'on cherche, et le reste se range de lui-même au
 * rechargement suivant.
 */
function Repli({ titre, children }: { titre: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <details className="group rounded-lg border border-slate-700 bg-slate-800/40 open:border-slate-600 open:bg-slate-800/70">
      {/* Le marqueur natif est masqué des deux façons qu'il faut : `list-none` pour Firefox,
          le pseudo-élément pour les navigateurs WebKit, qui l'ignore. */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 select-none hover:bg-slate-700/40 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="size-4 shrink-0 fill-amber-500 transition-transform group-open:rotate-90"
          >
            <path d="M7 4l7 6-7 6z" />
          </svg>
          {t(titre)}
        </span>
        <span className="text-xs text-slate-400 group-open:hidden">{t('afficher')}</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">{t('masquer')}</span>
      </summary>
      <div className="space-y-4 border-t border-slate-700 p-3">{children}</div>
    </details>
  )
}

function Bascule({
  label,
  actif,
  aide,
  onChange,
}: {
  label: string
  actif: boolean
  aide?: string
  onChange: (actif: boolean) => void
}) {
  const t = useT()
  return (
    <label className="block text-sm text-slate-300">
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={actif}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        {t(label)}
      </span>
      {aide ? <span className="mt-1 block pl-6 text-xs text-slate-500">{t(aide)}</span> : null}
    </label>
  )
}

function Curseur({
  label,
  valeur,
  min,
  max,
  pas,
  affichage,
  aide,
  onChange,
}: {
  label: string
  valeur: number
  min: number
  max: number
  pas: number
  affichage: string
  aide?: string
  onChange: (valeur: number) => void
}) {
  const t = useT()
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-300">
        {t(label)}
        <span className="font-mono text-xs text-slate-500">{affichage}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      {aide ? <span className="mt-1 block text-xs text-slate-500">{t(aide)}</span> : null}
    </label>
  )
}
