interface AudioNodes {source:MediaElementAudioSourceNode;gain:GainNode;connected:boolean}

export class CompositionAudio {
  private context:AudioContext|null=null;
  private bindings=new WeakMap<HTMLMediaElement,AudioNodes>();
  private nodes=new Map<HTMLMediaElement,AudioNodes>();
  volume(element:HTMLMediaElement,volume:number){
    if(!Number.isFinite(volume)||volume<0||volume>2)throw new Error("Volume de áudio inválido");
    let nodes=this.bindings.get(element);
    if(!nodes && volume<=1){element.volume=volume;return;}
    this.context??=new AudioContext();
    if(!nodes){
      const source=this.context.createMediaElementSource(element);const gain=this.context.createGain();
      nodes={source,gain,connected:false};this.bindings.set(element,nodes);
    }
    if(!nodes.connected){
      nodes.source.connect(nodes.gain);nodes.gain.connect(this.context.destination);nodes.connected=true;
    }
    this.nodes.set(element,nodes);
    element.volume=1;nodes.gain.gain.value=volume;
  }
  async resume(){if(this.context?.state==="suspended")await this.context.resume();}
  detach(element:HTMLMediaElement){const nodes=this.nodes.get(element);if(nodes){nodes.source.disconnect();nodes.gain.disconnect();nodes.connected=false;}this.nodes.delete(element);}
  dispose(){for(const element of this.nodes.keys())this.detach(element);void this.context?.close().catch(()=>undefined);this.context=null;this.bindings=new WeakMap();}
}
