import { SplashLogo } from "../components/splash/SplashLogo";

interface Props {
  leaving: boolean;
  onAnimationComplete: () => void;
}

export function SplashScreen({ leaving, onAnimationComplete }: Props) {
  return (
    <div
      className={leaving ? "splash splash--leaving" : "splash"}
      role="status"
      aria-label="Carregando CutNicePro"
    >
      <SplashLogo onComplete={onAnimationComplete} />
    </div>
  );
}
