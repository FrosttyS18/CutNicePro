import { afterEach,expect,it,vi } from "vitest";
import { CompositionAudio } from "../lib/composition-audio";
afterEach(()=>vi.unstubAllGlobals());
it("compartilha um contexto, aplica 200% e libera os nós da mídia",async()=>{
  const source={connect:vi.fn(),disconnect:vi.fn()};const gain={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};
  const context={createMediaElementSource:vi.fn(()=>source),createGain:vi.fn(()=>gain),destination:{},resume:vi.fn(async()=>undefined),close:vi.fn(async()=>undefined),state:"suspended"};
  const create=vi.fn(function(){return context;});vi.stubGlobal("AudioContext",create);
  const engine=new CompositionAudio();const media={volume:1} as HTMLMediaElement;
  engine.volume(media,2);expect(gain.gain.value).toBe(2);engine.volume(media,.5);await engine.resume();
  expect(create).toHaveBeenCalledOnce();expect(context.createMediaElementSource).toHaveBeenCalledOnce();expect(gain.gain.value).toBe(.5);
  engine.detach(media);expect(source.disconnect).toHaveBeenCalledOnce();expect(gain.disconnect).toHaveBeenCalledOnce();
  engine.dispose();expect(context.close).toHaveBeenCalledOnce();
});

it("usa volume nativo até 100% sem depender de AudioContext",()=>{
  const context=vi.fn(function(){return{destination:{},createMediaElementSource:()=>({connect:vi.fn(),disconnect:vi.fn()}),createGain:()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()}),close:async()=>undefined};});vi.stubGlobal("AudioContext",context);
  const engine=new CompositionAudio();const media={volume:1} as HTMLMediaElement;
  engine.volume(media,.4);expect(media.volume).toBe(.4);
  engine.volume(media,0);expect(media.volume).toBe(0);
  expect(context).not.toHaveBeenCalled();engine.dispose();
});

it("reconecta o mesmo nó após detach sem criar um segundo MediaElementSource",()=>{
  const bound=new WeakSet<HTMLMediaElement>();
  const source={connect:vi.fn(),disconnect:vi.fn()};const gain={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};
  const createSource=vi.fn((element:HTMLMediaElement)=>{if(bound.has(element))throw new DOMException("Already bound","InvalidStateError");bound.add(element);return source;});
  const context={createMediaElementSource:createSource,createGain:()=>gain,destination:{},close:vi.fn(async()=>undefined)};
  vi.stubGlobal("AudioContext",vi.fn(function(){return context;}));
  const engine=new CompositionAudio();const media={volume:1} as HTMLMediaElement;
  engine.volume(media,2);engine.detach(media);engine.volume(media,1.5);
  expect(createSource).toHaveBeenCalledOnce();expect(source.connect).toHaveBeenCalledTimes(2);
  expect(gain.gain.value).toBe(1.5);engine.dispose();
});
