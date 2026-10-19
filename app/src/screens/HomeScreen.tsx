import HeroGalaxy from "../components/galaxy/hero-galaxy";
import IntroConductor from "../components/galaxy/intro-conductor";
import { HomeHalftone } from "../components/HomeHalftone";

interface Props {
  onCreate: () => void;
}

/**
 * Tela 2/3 do design 03B — a mesma Home nos dois estados da sidebar.
 *
 * Fase 03B.5: a área artística é o Hero Galaxy ORIGINAL do ArtCraft
 * (motor WebGL portado — ver components/galaxy/), atrás do conteúdo
 * central e com o wordmark halftone original na região inferior.
 * O relógio da introdução (IntroConductor) rege a coreografia de entrada
 * do galaxy, como no site de referência.
 */
export function HomeScreen({ onCreate }: Props) {
  return (
    <div className="home" data-testid="home-screen">
      <IntroConductor />
      <div className="home__galaxy">
        <HeroGalaxy />
      </div>
      <div className="home__center">
        <h1 className="home__title">Bem-Vindo ao Cut Nice Pro</h1>
        <p className="home__subtitle">Crie seu novo projeto +</p>
        <button type="button" className="home__cta" onClick={onCreate} data-testid="home-create-project">
          Criar Projeto
        </button>
      </div>
      <HomeHalftone className="home__halftone" />
    </div>
  );
}
