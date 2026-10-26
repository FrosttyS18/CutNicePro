import { act, StrictMode, useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionPlayback } from "../hooks/useCompositionPlayback";
import { reactHost } from "./react-host";
import { CompositionStage } from "../components/editor/CompositionStage";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";

vi.mock("../lib/frame-seeker", () => ({ FrameSeeker: class { getFrameAt() { return Promise.resolve(null); } dispose() {} } }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let playback: ReturnType<typeof useCompositionPlayback>;
let now = 0;
const requests = new Map<number, FrameRequestCallback>();
let sequence = 0;
function Probe({ ready = true, duration = 300 }) {
  const state = useCompositionPlayback({ numerator: 30, denominator: 1 }, duration, ready);
  useLayoutEffect(() => { playback = state; }, [state]);
  return <output>{state.frame}</output>;
}
afterEach(async () => { await mounted?.close(); mounted = undefined; requests.clear(); now = 0; vi.unstubAllGlobals(); });

async function mount(ready: boolean, duration = 300) {
  vi.stubGlobal("performance", { now: () => now });
  mounted = await reactHost(<StrictMode><Probe ready={ready} duration={duration}/></StrictMode>, environment => {
    Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{const id=++sequence;requests.set(id,callback);return id;}});
    Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{requests.delete(id);}});
  });
}
async function advance(time: number) {
  now = time;
  const callbacks = [...requests.values()]; requests.clear();
  await act(async () => { callbacks.forEach(callback => callback(time)); });
}

describe("relógio condicionado pela prontidão das fontes", () => {
  it("aguarda metadados com intenção de reproduzir e começa em zero após a espera", async () => {
    await mount(false);
    await act(async () => { playback.toggle(); });
    await advance(10_000);
    expect(playback.playing).toBe(true);
    expect(playback.buffering).toBe(true);
    expect(playback.frame).toBe(0);
    await mounted!.render(<StrictMode><Probe ready/></StrictMode>);
    expect(playback.frame).toBe(0);
    await advance(10_034);
    expect(playback.frame).toBe(1);
    expect(playback.buffering).toBe(false);
  });

  it("waiting congela a última posição e canplay reancora sem recuperar o tempo parado", async () => {
    await mount(true);
    await act(async () => { playback.toggle(); });
    await advance(200);
    expect(playback.frame).toBe(6);
    await mounted!.render(<StrictMode><Probe ready={false}/></StrictMode>);
    await advance(10_000);
    expect(playback.frame).toBe(6);
    expect(playback.playing).toBe(true);
    await mounted!.render(<StrictMode><Probe ready/></StrictMode>);
    await advance(10_100);
    expect(playback.frame).toBe(9);
  });

  it("seek e pausa durante buffering preservam a posição sem retomar sozinhos", async () => {
    await mount(false);
    await act(async () => { playback.toggle(); playback.seek(90); });
    await advance(10_000);
    expect(playback.frame).toBe(90);
    await act(async () => { playback.pause(); });
    await mounted!.render(<StrictMode><Probe ready/></StrictMode>);
    await advance(20_000);
    expect(playback.frame).toBe(90);
    expect(playback.playing).toBe(false);
    expect(playback.buffering).toBe(false);
    await act(async () => { playback.toggle(); });
    await advance(20_100);
    expect(playback.frame).toBe(93);
  });

  it("mantém montagem vazia parada e conclui no último frame após ficar pronta", async () => {
    await mount(false, 0);
    await act(async () => { playback.toggle(); });
    expect(playback.playing).toBe(false);
    await mounted!.render(<StrictMode><Probe ready={false} duration={3}/></StrictMode>);
    await act(async () => { playback.toggle(); playback.seek(2); });
    await advance(1000);
    expect(playback.frame).toBe(2);
    await mounted!.render(<StrictMode><Probe ready duration={3}/></StrictMode>);
    await advance(1034);
    expect(playback.frame).toBe(3);
    expect(playback.playing).toBe(false);
  });
});

it("integra Stage e relógio em StrictMode sem saltar após metadados lentos ou waiting",async()=>{
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace);
  let mediaReady=0;
  function Integrated(){
    const [ready,setReady]=useState(false);
    const state=useCompositionPlayback(document.fps,300,ready);
    useLayoutEffect(()=>{playback=state;},[state]);
    return <CompositionStage document={document} frame={state.frame} playing={state.playing}
      media={{source:{url:"source.mp4",error:null}}} onError={()=>undefined} onReady={setReady}/>;
  }
  vi.stubGlobal("performance",{now:()=>now});
  mounted=await reactHost(<StrictMode><Integrated/></StrictMode>,environment=>{
    Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{const id=++sequence;requests.set(id,callback);return id;}});
    Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{requests.delete(id);}});
    Object.defineProperty(environment.HTMLMediaElement.prototype,"readyState",{configurable:true,get:()=>mediaReady});
    Object.defineProperty(environment.HTMLMediaElement.prototype,"paused",{configurable:true,get:function(this:HTMLElement){return this.dataset.paused!=="false";}});
    environment.HTMLMediaElement.prototype.play=vi.fn(async function(this:HTMLElement){this.dataset.paused="false";});
    environment.HTMLMediaElement.prototype.pause=vi.fn(function(this:HTMLElement){this.dataset.paused="true";});
    environment.HTMLMediaElement.prototype.load=vi.fn();
  });
  await act(async()=>{playback.toggle();});
  await advance(10_000);
  expect(playback.frame).toBe(0);expect(playback.buffering).toBe(true);
  const video=mounted.host.querySelector("video")!;
  await act(async()=>{mediaReady=4;video.dispatchEvent(new window.Event("loadedmetadata"));video.dispatchEvent(new window.Event("canplay"));});
  expect(playback.frame).toBe(0);expect(playback.buffering).toBe(false);
  await advance(10_034);expect(playback.frame).toBe(1);
  await act(async()=>{video.dispatchEvent(new window.Event("waiting"));});
  await advance(20_000);expect(playback.frame).toBe(1);expect(playback.buffering).toBe(true);
  await act(async()=>{video.dispatchEvent(new window.Event("canplay"));});
  await advance(20_034);expect(playback.frame).toBe(2);
  await act(async()=>{video.dispatchEvent(new window.Event("error"));});
  await advance(30_000);expect(playback.frame).toBe(2);expect(playback.buffering).toBe(true);
});

it("pausa dois vídeos e áudio extra enquanto qualquer fonte espera e retoma todos sincronizados",async()=>{
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace);
  document.assets.push({...document.assets[0],id:"overlay",mediaId:"overlay",name:"Sobreposto.mp4"},
    {...document.assets[0],id:"music",mediaId:"music",name:"Trilha.wav",kind:"audio",width:0,height:0});
  document.tracks.push({id:"V2",name:"Sobreposição",kind:"visual",primary:false,hidden:false,muted:false,locked:false},
    {id:"A2",name:"Trilha",kind:"audio",primary:false,hidden:false,muted:false,locked:false});
  document.items.push({...structuredClone(document.items[0]),id:"overlay",assetId:"overlay",groupId:"overlay",trackId:"V2"},
    {...structuredClone(document.items[1]),id:"music",assetId:"music",groupId:"music",trackId:"A2",followsMain:false});
  const media={source:{url:"source.mp4",error:null},overlay:{url:"overlay.mp4",error:null},music:{url:"music.wav",error:null}};
  function Integrated(){
    const [ready,setReady]=useState(false);
    const state=useCompositionPlayback(document.fps,300,ready);
    useLayoutEffect(()=>{playback=state;},[state]);
    return <CompositionStage document={document} frame={state.frame} playing={state.playing} media={media} onError={()=>undefined} onReady={setReady}/>;
  }
  vi.stubGlobal("performance",{now:()=>now});
  mounted=await reactHost(<StrictMode><Integrated/></StrictMode>,environment=>{
    Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{const id=++sequence;requests.set(id,callback);return id;}});
    Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{requests.delete(id);}});
    Object.defineProperty(environment.HTMLMediaElement.prototype,"readyState",{configurable:true,get:()=>4});
    Object.defineProperty(environment.HTMLMediaElement.prototype,"paused",{configurable:true,get:function(this:HTMLElement){return this.dataset.paused!=="false";}});
    environment.HTMLMediaElement.prototype.play=vi.fn(async function(this:HTMLElement){this.dataset.paused="false";});
    environment.HTMLMediaElement.prototype.pause=vi.fn(function(this:HTMLElement){this.dataset.paused="true";});
    environment.HTMLMediaElement.prototype.load=vi.fn();
  });
  await act(async()=>{playback.toggle();});
  const sources=[...mounted.host.querySelectorAll<HTMLMediaElement>("video,audio")];
  expect(sources).toHaveLength(3);expect(sources.every(source=>!source.paused)).toBe(true);
  sources.forEach(source=>{source.currentTime=.1;});
  await advance(100);expect(playback.frame).toBe(3);
  const waiting=sources[2];
  await act(async()=>{waiting.dispatchEvent(new window.Event("waiting"));});
  expect(playback.buffering).toBe(true);
  expect(sources.every(source=>source.paused)).toBe(true);
  expect(sources.every(source=>source.preload==="auto")).toBe(true);
  const positions=sources.map(source=>source.currentTime);
  sources.forEach(source=>{if(!source.paused)source.currentTime+=1;});
  await advance(10_000);
  expect(playback.frame).toBe(3);expect(sources.map(source=>source.currentTime)).toEqual(positions);
  await act(async()=>{waiting.dispatchEvent(new window.Event("canplay"));});
  expect(playback.buffering).toBe(false);expect(sources.every(source=>!source.paused)).toBe(true);
  sources.forEach(source=>{if(!source.paused)source.currentTime+=.1;});
  await advance(10_100);expect(playback.frame).toBe(6);
  sources.forEach(source=>{expect(source.currentTime).toBeCloseTo(.2);});
});
