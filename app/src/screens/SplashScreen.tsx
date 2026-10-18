import logoSplashUrl from "../assets/logo-splash.svg";

interface Props {
  /** true durante o fade-out pós-boot (ignorado com reduced motion). */
  leaving: boolean;
}

/**
 * Splash oficial: logo vetorial centralizado sobre preto puro.
 * Sem delays artificiais — permanece apenas pelo carregamento real do boot
 * (leitura inicial da persistência) e sai com um fade curto.
 */
export function SplashScreen({ leaving }: Props) {
  return (
    <div
      className={leaving ? "splash splash--leaving" : "splash"}
      role="status"
      aria-label="Carregando CutNicePro"
    >
      <img className="splash__logo" src={logoSplashUrl} alt="CutNicePro" width={507} height={96} />
    </div>
  );
}
