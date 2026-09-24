// Turns files picked in the admin panel into drafts, pairing each puzzle JSON with its images
// the way a local puzzle folder does: {name}.png is the solution image, meta.sourceFile the
// source image. Pure, so it's testable without Firebase.
import type { ImageKind } from "../../shared/cloudPuzzles";
import { validatePuzzleJson, type CrosswordJson } from "../../src/index";

export interface ImportFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface PlannedDraft {
  readonly id: string;
  // Where `npm run puzzles:download` will write it.
  readonly file: string;
  readonly jsonText: string;
  readonly title: string;
  readonly images: readonly { readonly kind: ImageKind; readonly name: string; readonly file: ImportFile }[];
  // Validation issues: the draft is still created, to be fixed in the editor.
  readonly issues: readonly string[];
}

export interface ImportPlan {
  readonly drafts: readonly PlannedDraft[];
  // Files that can't become drafts, and images no puzzle uses.
  readonly problems: readonly string[];
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export function planImport(files: readonly ImportFile[], takenIds: ReadonlySet<string>): ImportPlan {
  const images = new Map(files.filter((f) => IMAGE_EXTENSIONS.test(f.name)).map((f) => [f.name.toLowerCase(), f]));
  const usedImages = new Set<string>();
  const drafts: PlannedDraft[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (IMAGE_EXTENSIONS.test(file.name)) continue;
    if (!/\.json$/i.test(file.name)) {
      problems.push(`${file.name}: فقط فایل‌های JSON و تصویر (png، jpg، webp) پذیرفته می‌شوند.`);
      continue;
    }
    const jsonText = new TextDecoder().decode(file.bytes);
    let json: CrosswordJson;
    try {
      json = JSON.parse(jsonText) as CrosswordJson;
    } catch {
      problems.push(`${file.name}: فایل JSON معتبر نیست.`);
      continue;
    }
    const slug = file.name.replace(/\.json$/i, "");
    const id = String(json.meta?.id ?? slug);
    if (takenIds.has(id) || seen.has(id)) {
      problems.push(`${file.name}: شناسهٔ «${id}» قبلاً استفاده شده است.`);
      continue;
    }
    seen.add(id);

    const draftImages: PlannedDraft["images"][number][] = [];
    const solution = images.get(`${slug}.png`.toLowerCase());
    if (solution) {
      draftImages.push({ kind: "solution", name: `${slug}.png`, file: solution });
      usedImages.add(solution.name);
    }
    const sourceFile = json.meta?.sourceFile;
    if (sourceFile) {
      const source = images.get(sourceFile.toLowerCase());
      if (source) {
        draftImages.push({ kind: "source", name: sourceFile, file: source });
        usedImages.add(source.name);
      } else {
        problems.push(`${file.name}: تصویر منبع «${sourceFile}» انتخاب نشده است.`);
      }
    }

    const validation = validatePuzzleJson(json);
    drafts.push({
      id,
      file: `admin/${file.name}`,
      jsonText,
      title: json.meta?.title ?? slug,
      images: draftImages,
      issues: validation.valid ? [] : validation.issues.map((i) => i.message),
    });
  }

  for (const image of images.values()) {
    if (!usedImages.has(image.name)) problems.push(`${image.name}: هیچ جدولی از این تصویر استفاده نمی‌کند.`);
  }
  return { drafts, problems };
}
