import sampleOne from "../../assets/posters/9-16-9-16_01.png";
import sampleTwo from "../../assets/posters/9-16-9-16_02.png";
import sampleThree from "../../assets/posters/9-16-9-16_03.png";
import sampleFour from "../../assets/posters/9-16-9-16_04.png";

const examples = [sampleOne, sampleTwo, sampleThree, sampleFour];

export function CaptionExamples() {
  return (
    <div className="caption-examples" aria-label="Exemplos ilustrativos de estilos de legenda">
      {examples.map((image, index) => (
        <div className={`caption-example caption-example--${index + 1}`} key={image}>
          <img src={image} alt="" width={113} height={193} />
          <span>Conte a <strong>sua história</strong></span>
        </div>
      ))}
    </div>
  );
}
