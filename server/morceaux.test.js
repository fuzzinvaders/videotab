import { describe, expect, it } from "vitest";
import {
  attacherVideo,
  creerMorceau,
  detacherVideo,
  enregistrerReglages,
  reglagesParDefaut,
  renommerMorceau,
  supprimerMorceau,
  trouver,
} from "./morceaux.js";

function bibliothequeAvec(...types) {
  const data = { morceaux: [] };
  for (const type of types) {
    creerMorceau(data, {
      fichier: {
        nom: `essai${type === "pdf" ? ".pdf" : ".gp5"}`,
        ext: type === "pdf" ? ".pdf" : ".gp5",
        type,
      },
      taille: 1234,
      auteur: "remi",
    });
  }
  return data;
}

describe("creerMorceau", () => {
  it("tire le titre du nom de fichier, sans l'extension", () => {
    const data = { morceaux: [] };
    creerMorceau(data, {
      fichier: { nom: "Nothing Else Matters.gp5", ext: ".gp5", type: "gp" },
      taille: 42,
      auteur: "remi",
    });
    expect(data.morceaux[0].titre).toBe("Nothing Else Matters");
  });

  it("laisse le titre explicite l'emporter sur le nom du fichier", () => {
    const data = { morceaux: [] };
    creerMorceau(data, {
      titre: "Reprise au propre",
      fichier: { nom: "export_final_v3.gp5", ext: ".gp5", type: "gp" },
      taille: 42,
      auteur: "remi",
    });
    expect(data.morceaux[0].titre).toBe("Reprise au propre");
  });

  it("donne des réglages propres au type, pas un tronc commun", () => {
    const data = bibliothequeAvec("gp", "pdf");
    expect(data.morceaux[0].reglages.gp).toBeDefined();
    expect(data.morceaux[0].reglages.pdf).toBeUndefined();
    expect(data.morceaux[1].reglages.pdf).toBeDefined();
    expect(data.morceaux[1].reglages.gp).toBeUndefined();
  });

  it("part sans vidéo : elle n'existe qu'une fois produite", () => {
    const data = bibliothequeAvec("gp");
    expect(data.morceaux[0].video).toBeNull();
  });
});

describe("reglagesParDefaut", () => {
  it("propose du 1080p en 16/9, le format que personne n'a à choisir", () => {
    const { video } = reglagesParDefaut("gp");
    expect(video.largeur / video.hauteur).toBeCloseTo(16 / 9);
  });

  it("laisse le découpage d'un PDF vide, puisqu'il n'est pas encore détecté", () => {
    expect(reglagesParDefaut("pdf").pdf.systemes).toEqual([]);
  });
});

describe("renommerMorceau", () => {
  it("refuse un titre vide plutôt que de laisser un morceau sans nom", () => {
    const data = bibliothequeAvec("gp");
    const avant = data.morceaux[0].titre;
    renommerMorceau(data, data.morceaux[0].id, { titre: "", artiste: "Metallica" });
    expect(data.morceaux[0].titre).toBe(avant);
    expect(data.morceaux[0].artiste).toBe("Metallica");
  });

  it("signale un identifiant inconnu au lieu de ne rien faire en silence", () => {
    const data = bibliothequeAvec("gp");
    expect(renommerMorceau(data, "inexistant", { titre: "Bof" }).ok).toBe(false);
  });
});

describe("enregistrerReglages", () => {
  it("remplace en bloc : un système supprimé ne réapparaît pas", () => {
    const data = bibliothequeAvec("pdf");
    const id = data.morceaux[0].id;
    enregistrerReglages(data, id, { pdf: { systemes: [{ page: 0 }, { page: 1 }] } });
    enregistrerReglages(data, id, { pdf: { systemes: [{ page: 0 }] } });
    expect(data.morceaux[0].reglages.pdf.systemes).toHaveLength(1);
  });

  it("avance la date de modification, qui trie la bibliothèque", async () => {
    const data = bibliothequeAvec("gp");
    const avant = data.morceaux[0].modifieLe;
    await new Promise((r) => setTimeout(r, 2));
    enregistrerReglages(data, data.morceaux[0].id, { video: { fps: 60 } });
    expect(Date.parse(data.morceaux[0].modifieLe)).toBeGreaterThan(Date.parse(avant));
  });
});

describe("attacherVideo / detacherVideo", () => {
  it("date la vidéo au moment où elle est déposée", () => {
    const data = bibliothequeAvec("gp");
    attacherVideo(data, data.morceaux[0].id, { ext: ".webm", taille: 10, dureeMs: 1000 });
    expect(data.morceaux[0].video.creeLe).toBeTypeOf("string");
    expect(data.morceaux[0].video.ext).toBe(".webm");
  });

  it("rend l'ancienne vidéo à l'appelant, qui seul sait où elle est rangée", () => {
    const data = bibliothequeAvec("gp");
    const id = data.morceaux[0].id;
    attacherVideo(data, id, { ext: ".webm", taille: 10, dureeMs: 1000 });
    const result = detacherVideo(data, id);
    expect(result.ancienne.ext).toBe(".webm");
    expect(trouver(data, id).video).toBeNull();
  });
});

describe("supprimerMorceau", () => {
  it("sort le morceau de la liste et dit quelle source effacer derrière", () => {
    const data = bibliothequeAvec("gp");
    const id = data.morceaux[0].id;
    attacherVideo(data, id, { nom: `${id}-abc.webm`, ext: ".webm", taille: 10, dureeMs: 1000 });
    const result = supprimerMorceau(data, id);
    expect(data.morceaux).toHaveLength(0);
    expect(result.fichiers.source).toEqual({ id, ext: ".gp5" });
  });

  /* Les vidéos ne sont volontairement pas énumérées : chaque export porte un nom neuf, un
     morceau peut donc en avoir laissé plusieurs derrière lui, et c'est un balayage du dossier
     qui s'en charge. Les nommer une par une reviendrait à oublier celles qu'on n'a pas pu
     effacer sur le moment. */
  it("ne prétend pas connaître les vidéos, qui se balaient par le dossier", () => {
    const data = bibliothequeAvec("pdf");
    expect(supprimerMorceau(data, data.morceaux[0].id).fichiers.video).toBeUndefined();
  });
});
