import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/caption-parity.json";
import { captionCue, captionPresentation, captionPresets } from "../lib/captions";
import { montageTranscript } from "../lib/composition-playback";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { emptyWorkspace } from "../lib/workspace";
import { requireComposition } from "../lib/composition";

describe("contrato compartilhado de legendas da prévia e ASS", () => {
  for (const fixture of fixtures) it(fixture.name, () => {
    const bounds = "bounds" in fixture ? fixture.bounds : undefined;
    for (const sample of fixture.samples) {
      const cue = captionCue([fixture.segment], sample.time, fixture.perCaption, bounds);
      expect(cue?.words.map(word => word.text) ?? [], String(sample.time)).toEqual(sample.texts);
      expect(cue?.words.flatMap((word, index) => word.active ? [index] : []) ?? []).toEqual(sample.active);
      expect(cue?.words.flatMap((word, index) => word.spoken ? [index] : []) ?? []).toEqual(sample.spoken);
    }
    if (fixture.edited && fixture.editedSamples) for (const sample of fixture.editedSamples) {
      const cue = captionCue([fixture.edited], sample.time, fixture.perCaption, bounds);
      expect(cue?.words.map(word => word.text) ?? []).toEqual(sample.texts);
      expect(cue?.words.flatMap((word, index) => word.active ? [index] : []) ?? []).toEqual(sample.active);
      expect(cue?.words.flatMap((word, index) => word.spoken ? [index] : []) ?? []).toEqual(sample.spoken);
    }
  });

  it("mantém o texto canônico, tempos e correções após duplicar e mover a montagem", () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 4, width: 1920, height: 1080, videoId: null, url: null };
    workspace.transcript = [fixtures[0].segment];
    const original = compositionFromLegacy(workspace);
    const document = duplicateSelection(original, [original.items.find(item => item.kind === "video")!.id], "sequence");
    const captions = document.items.filter(item => item.kind === "caption");
    const entries = montageTranscript(document);
    expect(entries.map(entry => entry.segment.text)).toEqual([fixtures[0].segment.text, fixtures[0].segment.text]);
    expect(captionCue([entries[1].segment], 4.6)?.words.map(word => word.text)).toEqual(fixtures[0].samples[0].texts);
    captions[1].captionEdits.partial = { text: fixtures[0].edited!.text, words: fixtures[0].edited!.words };
    const edited = montageTranscript(document).find(entry => entry.itemId === captions[1].id)!.segment;
    expect(captionCue([edited], 4.6)?.words.map(word => word.text)).toEqual(["Quero", "manter", "toda", "a", "conclusão"]);
    expect(original.assets[0].transcript[0].text).toBe(fixtures[0].segment.text);
  });

  it.each([9 / 16, 1, 4 / 5, 16 / 9])("escala a legenda pelo menor lado na proporção %s", ratio => {
    const style = captionPresets[2].style;
    const reference = 1080 * Math.max(1, ratio);
    expect(captionPresentation(style, ratio).fontSize).toContain(String(style.size / reference));
    expect(captionPresentation(style, ratio).WebkitTextStroke).toContain(String(style.outline / reference));
  });

  it("mantém uma correção textual sem tempos ao aparar o item e sustenta o último frame incluído", () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 4, width: 1920, height: 1080, videoId: null, url: null };
    workspace.settings.trimStart = 1; workspace.settings.trimEnd = 3;
    workspace.transcript = [fixtures[0].segment];
    const document = compositionFromLegacy(workspace);
    const caption = document.items.find(item => item.kind === "caption")!;
    caption.captionEdits.partial = "Correção local completa.";
    const entries = montageTranscript(document);
    expect(entries).toHaveLength(1);
    expect(entries[0].segment).toMatchObject({ text: "Correção local completa.", start: 0, end: 2, words: [] });
    for (const time of [0, 1, 59 / 30]) {
      expect(captionCue([entries[0].segment], time)?.words).toEqual(["Correção", "local", "completa."].map(text => ({ text, active: false, spoken: false })));
    }
    expect(captionCue([entries[0].segment], 2)).toBeNull();
  });

  it("não recupera tempos originais após salvar e reabrir um override objeto sem words", () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 4, width: 1920, height: 1080, videoId: null, url: null };
    workspace.transcript = [fixtures[0].segment];
    const document = compositionFromLegacy(workspace);
    const caption = document.items.find(item => item.kind === "caption")!;
    caption.captionEdits.partial = { text: fixtures[0].segment.text, words: undefined };
    const reloaded = requireComposition(JSON.parse(JSON.stringify(document)));
    expect(reloaded.items.find(item => item.id === caption.id)?.captionEdits.partial).toEqual({ text: fixtures[0].segment.text });
    const segments = montageTranscript(reloaded).map(entry => entry.segment);
    expect(segments[0].words).toEqual([]);
    expect(captionCue(segments, 0.6)?.words).toEqual(fixtures[0].segment.text.split(" ").map(text => ({ text, active: false, spoken: false })));
    expect(document.assets[0].transcript[0].words).toEqual(fixtures[0].segment.words);
  });
});
