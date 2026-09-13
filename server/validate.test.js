import { describe, expect, it } from "vitest";
import {
  validateBody,
  validateDuree,
  validateId,
  validateNomFichier,
  validateReglages,
  validateTexte,
} from "./validate.js";

describe("validateId", () => {
  it("accepte un UUID, la seule forme que le serveur produise", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(validateId(id)).toEqual({ ok: true, value: id });
  });

  it("refuse tout ce qui pourrait sortir du dossier des fichiers", () => {
    for (const mauvais of ["../../etc/passwd", "..", "a/b", ""]) {
      expect(validateId(mauvais).ok).toBe(false);
    }
  });
});

describe("validateNomFichier", () => {
  it("reconnaît les formats de tablature et le PDF", () => {
    expect(validateNomFichier("solo.gp5").value.type).toBe("gp");
    expect(validateNomFichier("partition.PDF").value.type).toBe("pdf");
    expect(validateNomFichier("piece.musicxml").value.type).toBe("gp");
  });

  it("refuse un format inconnu en disant lesquels sont attendus", () => {
    const result = validateNomFichier("morceau.docx");
    expect(result.ok).toBe(false);
    expect(result.error).toContain(".gp5");
  });

  it("ne garde que la dernière composante d'un chemin", () => {
    expect(validateNomFichier("C:\\Users\\remi\\solo.gp5").value.nom).toBe("solo.gp5");
    expect(validateNomFichier("../../secret.pdf").value.nom).toBe("secret.pdf");
  });

  it("refuse un fichier sans extension, qui ne dit pas son format", () => {
    expect(validateNomFichier("tablature").ok).toBe(false);
  });
});

describe("validateTexte", () => {
  it("chasse les caractères de contrôle, qui cassent un en-tête HTTP", () => {
    expect(validateTexte("Solo\u0000\u001fen mi", "Le titre").value).toBe("Solo  en mi");
  });

  it("refuse ce qui dépasse la longueur annoncée", () => {
    expect(validateTexte("x".repeat(200), "Le titre", 120).ok).toBe(false);
  });

  it("laisse passer l'absence quand le champ est facultatif", () => {
    expect(validateTexte(undefined, "L'artiste")).toEqual({ ok: true, value: "" });
    expect(validateTexte(undefined, "L'artiste", 120, { obligatoire: true }).ok).toBe(false);
  });
});

describe("validateReglages", () => {
  it("rend une copie, pour qu'aucune référence de l'appelant ne reste attachée", () => {
    const source = { video: { fps: 30 } };
    const copie = validateReglages(source).value;
    copie.video.fps = 60;
    expect(source.video.fps).toBe(30);
  });

  it("refuse un tableau ou une valeur simple à la place d'un objet", () => {
    expect(validateReglages([1, 2]).ok).toBe(false);
    expect(validateReglages("bonjour").ok).toBe(false);
  });

  it("refuse ce qui ferait gonfler le fichier de bibliothèque sans fin", () => {
    expect(validateReglages({ bruit: "x".repeat(500_000) }).ok).toBe(false);
  });
});

describe("validateDuree", () => {
  it("arrondit à la milliseconde et accepte l'absence", () => {
    expect(validateDuree("1234.7").value).toBe(1235);
    expect(validateDuree(null).value).toBe(0);
  });

  it("refuse le négatif et l'invraisemblable", () => {
    expect(validateDuree(-1).ok).toBe(false);
    expect(validateDuree(13 * 3600 * 1000).ok).toBe(false);
    expect(validateDuree("beaucoup").ok).toBe(false);
  });
});

describe("validateBody", () => {
  it("n'accepte qu'un objet : un tableau n'a pas de champs à lire", () => {
    expect(validateBody({ titre: "x" }).ok).toBe(true);
    expect(validateBody([]).ok).toBe(false);
    expect(validateBody(null).ok).toBe(false);
  });
});
