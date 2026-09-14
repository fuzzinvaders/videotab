/**
 * Un battement régulier, pris sur le fil audio.
 *
 * Le navigateur ralentit délibérément une page qu'on ne regarde plus : `requestAnimationFrame`
 * cesse d'être appelé, et les minuteurs tombent à un réveil par seconde. C'est une bonne
 * politique — elle économise la batterie des cent onglets ouverts — mais elle démolit un
 * export vidéo, qui doit continuer à dessiner ses trente images par seconde pendant trois
 * minutes. Mesuré ici : une même scène rend 30 images par seconde onglet devant, et **une**
 * image par seconde onglet derrière. Le fichier produit est inutilisable, et rien ne l'avait
 * signalé.
 *
 * Le fil audio, lui, n'est jamais ralenti : une page cachée continue de jouer sa musique,
 * sinon la moitié du web serait cassée. Un `AudioWorkletProcessor` y est appelé tous les 128
 * échantillons, soit toutes les 2,7 ms à 48 kHz, et le message qu'il envoie réveille la page
 * sans passer par un minuteur. C'est ce battement-là qui cadence l'export, et l'onglet peut
 * dès lors passer derrière sans que la vidéo s'en aperçoive.
 *
 * Le processeur n'écrit rien dans ses sorties : c'est une horloge, pas un instrument.
 */

const CODE = `
class MetronomeVideotab extends AudioWorkletProcessor {
  process() {
    this.port.postMessage(0)
    return true
  }
}
registerProcessor('videotab-metronome', MetronomeVideotab)
`

/* Un nom de processeur ne peut être enregistré qu'une fois par contexte, et le contexte est
   partagé par toute l'application : au deuxième export, `addModule` refuserait. */
const charges = new WeakSet<AudioContext>()

export interface Metronome {
  arreter(): void
}

export async function battre(contexte: AudioContext, surTic: () => void): Promise<Metronome> {
  if (!charges.has(contexte)) {
    // Le module est écrit ici plutôt que servi comme fichier : sept lignes ne méritent pas
    // une entrée dans la configuration de build, ni une requête réseau au moment d'exporter.
    const url = URL.createObjectURL(new Blob([CODE], { type: 'application/javascript' }))
    try {
      await contexte.audioWorklet.addModule(url)
      charges.add(contexte)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const noeud = new AudioWorkletNode(contexte, 'videotab-metronome')
  noeud.port.onmessage = () => surTic()
  // Un nœud que rien ne relie à la sortie n'est pas garanti d'être appelé. Il n'émet que du
  // silence, mais il faut qu'il soit branché pour battre.
  noeud.connect(contexte.destination)

  return {
    arreter() {
      noeud.port.onmessage = null
      noeud.disconnect()
    },
  }
}
