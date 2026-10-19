import HeroGalaxy from "../components/galaxy/hero-galaxy";
import IntroConductor from "../components/galaxy/intro-conductor";
import { HomeHalftone } from "../components/HomeHalftone";

interface Props {
  onCreate: () => void;
}

/**
 * Tela 2/3 do design 03B — a mesma Home nos dois estados da sidebar.
 *
 * Fase 03B.8 (correções sobre a 03B.7):
 *  - headline em UMA linha ("Bem-vindo ao Cut Nice Pro", 32–44px, somente
 *    "Nice" em Deep Aqua) com entrada única suave (fade + rise, sem
 *    stagger de palavras); subtítulo/botão em sequência discreta;
 *  - Flip Button como CAIXA 3D vertical: face frontal translateZ, face
 *    inferior rotateX(90°) translateZ; o conjunto gira no EIXO X — a frente
 *    sobe e some por cima, o verso surge de baixo (hover e foco).
 * Galaxy (03B.5/03B.6 + paleta 03B.7) e Halftone intactos.
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
          <span className="home__rise">
            Bem-vindo ao Cut <span className="home__nice">Nice</span> Pro
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
            <span className="flip-btn__box">
              <span className="flip-btn__face flip-btn__face--front">Criar Projeto</span>
              <span className="flip-btn__face flip-btn__face--bottom">Criar Projeto</span>
            </span>
          </span>
        </button>
      </div>
      <HomeHalftone className="home__halftone" />
    </div>
  );
}
