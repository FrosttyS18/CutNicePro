import { useEffect } from "react";
import HeroGalaxy from "../components/galaxy/hero-galaxy";
import IntroConductor from "../components/galaxy/intro-conductor";
import { HomeHalftone } from "../components/HomeHalftone";
import {
  FlipButton,
  FlipButtonBack,
  FlipButtonFront,
} from "../components/animate-ui/flip-button";

interface Props {
  onCreate: () => void;
}

/**
 * Tela 2/3 do design 03B — a mesma Home nos dois estados da sidebar.
 *
 * Fase 03B.9 — contrato ÚNICO de entrada (ver ui.css · mesma timeline):
 *   0.10s "Bem-Vindo" (fade+rise 850ms) → 0.75s subtítulo (500ms) →
 *   1.25s botão (500ms) → 1.90s o Galaxy começa a revelação ORIGINAL
 *   centro→periferia (cardsAt=1.9 + wave de 3.4s, intro.ts/tunables).
 * Headline = somente "Bem-Vindo" (Poppins 700 branco); subtítulo em
 * #929292; CTA = FlipButton OFICIAL do Animate UI (from="top",
 * tapScale 0.97; springs das faces 280/20 no próprio componente).
 * Galaxy (03B.5/03B.6/03B.7 paleta) e Halftone intactos.
 */
export function HomeScreen({ onCreate }: Props) {
  useEffect(() => {
    // dados de entrada já assentados quando reduced-motion (CSS cobre);
    // nada a fazer aqui — hook mantido para clareza do contrato.
  }, []);

  return (
    <div className="home" data-testid="home-screen">
      <IntroConductor />
      <div className="home__galaxy">
        <HeroGalaxy />
      </div>
      <div className="home__center">
        <h1 className="home__title" data-testid="home-title">
          <span className="home__rise">Bem-Vindo</span>
        </h1>
        <p className="home__subtitle">
          <span className="home__fade">Crie seu novo projeto +</span>
        </p>
        <div className="home__cta-slot">
          <FlipButton
            from="top"
            tapScale={0.97}
            className="home__flip"
            data-testid="home-create-project"
            aria-label="Criar Projeto"
            onClick={onCreate}
          >
            <FlipButtonFront className="home__flip-face home__flip-face--front">
              Criar Projeto
            </FlipButtonFront>
            <FlipButtonBack className="home__flip-face home__flip-face--back">
              Criar Projeto
            </FlipButtonBack>
          </FlipButton>
        </div>
      </div>
      <HomeHalftone className="home__halftone" />
    </div>
  );
}
