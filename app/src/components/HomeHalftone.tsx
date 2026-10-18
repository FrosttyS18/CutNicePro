import HalftoneWordmarkFooter from "./HalftoneWordmarkFooter";

/**
 * Integração do HalftoneWordmarkFooter ORIGINAL (fornecido pelo mantenedor)
 * à Home do CutNicePro. Personalização apenas por props — a física do canvas
 * (molas, repulsão, onda de clique, granulação, recorte) permanece intacta.
 *
 * A apresentação de terceiros (linha de estúdio, colunas de links e
 * back-to-top) é removida visualmente via CSS escopado, sem tocar no
 * componente: as props já vão vazias e .hwf-top/.hwf-rule não são exibidos.
 */
export function HomeHalftone({ className }: { className?: string }) {
  return (
    <div className={className ? `home-halftone ${className}` : "home-halftone"}>
      <HalftoneWordmarkFooter
        wordmark="CutNicePro"
        label=""
        meta=""
        columns={[]}
        backToTop={false}
        preset="night"
        palette={{ warm: "#02C2BE", background: "#0A0A0A" }}
        fontFamily="Poppins, 'Helvetica Neue', Arial, sans-serif"
        fontWeight={800}
        height="100%"
        interactive={true}
      />
    </div>
  );
}
