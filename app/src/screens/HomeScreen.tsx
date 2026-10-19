import HeroGalaxy from "../components/galaxy/hero-galaxy";
import IntroConductor from "../components/galaxy/intro-conductor";
import { HomeHalftone } from "../components/HomeHalftone";

interface Props {
  onCreate: () => void;
}

/**
 * Tela 2/3 do design 03B — a mesma Home nos dois estados da sidebar.
 *
 * Fase 03B.5: área artística = Hero Galaxy ORIGINAL do ArtCraft (motor
 * WebGL portado) atrás do conteúdo central; wordmark halftone original na
 * região inferior; IntroConductor rege a coreografia de entrada.
 *
 * Fase 03B.7 (polish cinematográfico do conteúdo central):
 *  - headline em duas linhas com revelação por máscara (motion typography
 *    só com transform/opacity; stagger título → subtítulo → botão;
 *    reduced-motion abre assentado; resize/sidebar não reiniciam);
 *  - CTA "Criar Projeto" com Flip Button 3D em CSS puro (frente branca,
 *    verso #242424; hover E focus-visible giram; reduced-motion sem giro).
 * O Hero Galaxy (03B.5/03B.6) e o Halftone permanecem intactos.
 */
export function HomeScreen({ onCreate }: Props) {
  return (
    <div className="home" data-testid="home-screen">
      <IntroConductor />
      <div className="home__galaxy">
        <HeroGalaxy />
      </div>
      <div className="home__center">
        <h1 className="home__title" data-testid="home-title">
          <span className="home__line">
            <span className="home__line-inner">Bem-Vindo ao</span>
          </span>
          <span className="home__line home__line--2">
            <span className="home__line-inner">Cut Nice Pro</span>
          </span>
        </h1>
        <p className="home__subtitle">
          <span className="home__fade">Crie seu novo projeto +</span>
        </p>
        <button
          type="button"
          className="home__cta flip-btn"
          onClick={onCreate}
          data-testid="home-create-project"
          aria-label="Criar Projeto"
        >
          <span className="flip-btn__reveal" aria-hidden="true">
            <span className="flip-btn__inner">
              <span className="flip-btn__face flip-btn__face--front">Criar Projeto</span>
              <span className="flip-btn__face flip-btn__face--back">Criar Projeto</span>
            </span>
          </span>
        </button>
      </div>
      <HomeHalftone className="home__halftone" />
    </div>
  );
}
