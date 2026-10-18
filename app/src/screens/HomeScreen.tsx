import { OrbitingMediaHero } from "../components/OrbitingMediaHero";
import { HomeHalftone } from "../components/HomeHalftone";
import { contactSheetPlaceholders } from "../lib/contactSheetSources";

interface Props {
  onCreate: () => void;
}

/**
 * Tela 2/3 do design 03B — a mesma Home nos dois estados da sidebar.
 * Hierarquia (Fase 03B.2): área artística com cartões orbitando ATRÁS do
 * conteúdo central (título/subtítulo/CTA) e wordmark halftone original na
 * região inferior — dois motores independentes, sem sobreposição.
 */
export function HomeScreen({ onCreate }: Props) {
  return (
    <div className="home" data-testid="home-screen">
      <OrbitingMediaHero sources={contactSheetPlaceholders} className="home__orbit" />
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
