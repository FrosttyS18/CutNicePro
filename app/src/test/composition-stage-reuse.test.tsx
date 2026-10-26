import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionStage } from "../components/editor/CompositionStage";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { splitSelection } from "../lib/composition-edit";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const resources = vi.hoisted(() => ({ disposed: 0, created: 0 }));
vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class {
  constructor() { resources.created += 1; }
  getFrameAt() { return Promise.resolve(null); }
  dispose() { resources.disposed += 1; }
} }));
vi.mock("../lib/composition-audio", () => ({ CompositionAudio: class { volume() {} resume() { return Promise.resolve(); } detach() {} dispose() {} } }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; resources.created = 0; resources.disposed = 0; });

describe("continuidade dos decodificadores da montagem", () => {
  it("mute visual usa o mesmo player e ocultar preserva áudio sem alterar settings individuais", async () => {
    const workspace=emptyWorkspace();
    workspace.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
    const original=compositionFromLegacy(workspace);
    const before=structuredClone(original.items);
    const media={source:{url:"source.mp4",error:null}};
    const render=(hidden:boolean,muted:boolean)=><CompositionStage document={{...original,tracks:original.tracks.map(track=>track.kind==="visual"?{...track,hidden,muted}:track)}} frame={0} playing={false} media={media} onError={vi.fn()}/>;
    mounted=await reactHost(render(false,false));
    const video=mounted.host.querySelector("video")!;
    expect(video.muted).toBe(false);
    await mounted.render(render(false,true));
    expect(mounted.host.querySelector("video")).toBe(video);
    expect(video.muted).toBe(true);
    expect(mounted.host.querySelector("audio")).toBeNull();
    await mounted.render(render(false,false));
    expect(mounted.host.querySelector("video")).toBe(video);
    expect(video.muted).toBe(false);
    expect(resources.created).toBe(1);
    await mounted.render(render(true,false));
    expect(mounted.host.querySelector("video")).toBeNull();
    expect(mounted.host.querySelector("audio")).not.toBeNull();
    expect(original.items).toEqual(before);
  });

  it("não reabre o vídeo com som original ao atravessar uma divisão", async () => {
    const workspace = emptyWorkspace();
    workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
    const original = compositionFromLegacy(workspace);
    const document = splitSelection(original, [original.items[0].id], 150);
    const media = { [document.assets[0].id]: { url: "source.mp4", error: null } };
    const onError = vi.fn();
    mounted = await reactHost(<CompositionStage document={document} frame={149} playing={false} media={media} onError={onError}/>);
    const video = mounted.host.querySelector("video");
    expect(video).not.toBeNull(); expect(mounted.host.querySelector("audio")).toBeNull();
    expect(video!.muted).toBe(false);
    await mounted.render(<CompositionStage document={document} frame={150} playing={false} media={media} onError={onError}/>);
    expect(mounted.host.querySelector("video")).toBe(video);
    expect(mounted.host.querySelector("audio")).toBeNull();
    expect(resources.created).toBe(1); expect(resources.disposed).toBe(0);
  });
  it("mantém o elemento de áudio independente ao atravessar uma divisão",async()=>{
    const workspace=emptyWorkspace();
    workspace.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
    const original=compositionFromLegacy(workspace);
    const audio=original.items.find(item=>item.kind==="audio")!;audio.groupId="independent";
    const document=splitSelection(original,[original.items[0].id,audio.id],150);
    const media={source:{url:"source.mp4",error:null}};const onError=vi.fn();
    mounted=await reactHost(<CompositionStage document={document} frame={149} playing={false} media={media} onError={onError}/>);
    const element=mounted.host.querySelector("audio");expect(element).not.toBeNull();
    await mounted.render(<CompositionStage document={document} frame={150} playing={false} media={media} onError={onError}/>);
    expect(mounted.host.querySelector("audio")).toBe(element);
    expect(resources.created).toBe(1);expect(resources.disposed).toBe(0);
  });
});
