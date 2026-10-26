use super::{
    evidence::{self, DraftAnalysis},
    selection::{Evaluation, Nature},
    text_engine::Engine,
    types::Clip,
};
use crate::transcription::{process::ProcessControl, types::Segment};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Draft {
    nature: Nature,
    advertising: bool,
    #[serde(rename = "openingStatus")]
    opening_status: OpeningStatus,
    #[serde(rename = "endingStatus")]
    ending_status: EndingStatus,
    analysis: DraftAnalysis,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum OpeningStatus {
    AssuntoApresentado,
    ReferentesEsclarecidosNoIntervalo,
    ContextoAusente,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum EndingStatus {
    ConsequenciaOuReacaoDoMesmoEpisodio,
    RespostaOuExplicacaoConcluida,
    ObservacaoConcluidaDoMesmoAssunto,
    FalaInterrompida,
    PerguntaPendente,
    NovoAssunto,
}

impl EndingStatus {
    fn closes_episode(&self) -> bool {
        matches!(
            self,
            Self::ConsequenciaOuReacaoDoMesmoEpisodio
                | Self::RespostaOuExplicacaoConcluida
                | Self::ObservacaoConcluidaDoMesmoAssunto
        )
    }
}

fn ground(draft: Draft, id: String, quotes: &[String], source: &str) -> Result<Evaluation, String> {
    let mut analysis = draft.analysis.ground(quotes, source)?;
    let interrupted = super::editorial::enforce_ending(&mut analysis, source);
    let floor = super::types::AUTOMATIC_RELEVANCE_FLOOR;
    if matches!(draft.opening_status, OpeningStatus::ContextoAusente) {
        analysis.criteria[0].score = analysis.criteria[0].score.min(floor - 1);
        analysis.criteria[0].explanation =
            "A abertura depende de contexto que não está incluído no intervalo.".into();
    }
    if !draft.ending_status.closes_episode() && !interrupted {
        analysis.criteria[2].score = analysis.criteria[2].score.min(floor - 1);
        analysis.criteria[2].explanation =
            "O final não conclui a unidade iniciada: a avaliação identificou uma fala interrompida, uma pergunta pendente ou a mudança para outro assunto.".into();
    }
    let standalone = !matches!(draft.opening_status, OpeningStatus::ContextoAusente)
        && analysis.criteria[0].score >= floor;
    let complete =
        draft.ending_status.closes_episode() && analysis.criteria[2].score >= floor && !interrupted;
    let mut reason = analysis
        .criteria
        .iter()
        .map(|item| format!("{}: {}", item.label, item.explanation))
        .collect::<Vec<_>>()
        .join("; ");
    if interrupted {
        reason.push_str("; O intervalo termina com uma oração aberta na transcrição.");
    }
    Ok(Evaluation {
        id,
        score: analysis.score(),
        reason,
        nature: draft.nature,
        advertising: draft.advertising,
        standalone,
        complete,
        analysis: Some(analysis),
        analysis_signature: None,
    })
}

pub fn apply(clip: &mut Clip, judgment: &Evaluation) {
    clip.reasons
        .retain(|reason| !reason.contains("Conteúdo promocional"));
    if judgment.advertising {
        clip.reasons
            .push("Conteúdo promocional: prioridade secundária".into());
    }
    clip.score = judgment.score;
    clip.analysis = judgment.analysis.clone();
    clip.analysis_error = None;
    clip.analysis_stale = None;
    clip.analysis_signature = judgment.analysis_signature.clone();
    if let Some(analysis) = &clip.analysis {
        clip.title = analysis.title.clone();
    }
}

fn schema(quote_count: usize) -> serde_json::Value {
    let mut analysis_schema = evidence::schema(quote_count);
    analysis_schema["properties"]["closing"]["properties"]["evidenceId"]["enum"] =
        serde_json::json!([quote_count - 1]);
    serde_json::json!({"type":"object","additionalProperties":false,
        "required":["openingStatus","endingStatus","nature","advertising","analysis"],
        "properties":{"openingStatus":{"type":"string","enum":["assuntoApresentado","referentesEsclarecidosNoIntervalo","contextoAusente"]},
        "endingStatus":{"type":"string","enum":["consequenciaOuReacaoDoMesmoEpisodio","respostaOuExplicacaoConcluida","observacaoConcluidaDoMesmoAssunto","falaInterrompida","perguntaPendente","novoAssunto"]},
        "nature":{"type":"string","enum":["relato","humor","explicacao","opiniao","demonstracao"]},
        "advertising":{"type":"boolean"},"analysis":analysis_schema}})
}

pub fn evaluate(
    engine: &Engine,
    scratch: &Path,
    pending: &[Clip],
    speech: &[Segment],
    control: &ProcessControl,
) -> Result<Vec<Evaluation>, String> {
    let mut results = Vec::new();
    for (index, clip) in pending.iter().enumerate() {
        control.check()?;
        let source = super::semantic::source(clip, speech);
        let quotes = evidence::quotes(&source);
        if quotes.is_empty() {
            return Err("O trecho não tem fala suficiente para avaliação.".into());
        }
        let data = serde_json::json!({"start":clip.start,"end":clip.end,
            "speech":speech.iter().map(|s|s.text.as_str()).collect::<Vec<_>>().join("\n"),
            "quotes":quotes.iter().enumerate().map(|(id,text)|serde_json::json!({"id":id,"text":text})).collect::<Vec<_>>()});
        let schema = schema(quotes.len());
        let prompt = engine.prompt(include_str!("evaluate-prompt.txt"), &data)?;
        if engine.count_tokens(scratch, &prompt, control)?
            > super::engine_tools::CONTEXT_TOKENS - 1728
        {
            return Err("A transcrição completa e o trecho excedem o contexto disponível para avaliação. Nenhum texto foi dividido ou truncado.".into());
        }
        let output = engine.generate(
            scratch,
            &format!("assessment-{index}"),
            &prompt,
            &schema,
            1600,
            control,
        )?;
        let draft = serde_json::Deserializer::from_str(output.trim())
            .into_iter::<Draft>()
            .next()
            .ok_or("Não foi possível avaliar os trechos. Tente novamente.")?
            .map_err(|_| "A avaliação dos trechos retornou uma resposta inválida.")?;
        let mut judgment = ground(draft, format!("E{}", index + 1), &quotes, &source)?;
        judgment.analysis_signature =
            Some(super::store::clip_signature(speech, clip.start, clip.end));
        results.push(judgment);
    }
    Ok(results)
}

#[cfg(test)]
#[path = "assessment_context_tests.rs"]
mod context_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "avaliação local das seis referências editoriais aprovadas; não publica cortes"]
    fn approved_editorial_reference_is_recognized_by_qwen35() {
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let directory =
            std::path::PathBuf::from(std::env::var("CNP_INCREMENTAL_EVIDENCE").unwrap())
                .canonicalize()
                .unwrap();
        assert!(directory.starts_with(
            workspace
                .join(".tooling/test-output")
                .canonicalize()
                .unwrap()
        ));
        let transcript: crate::transcription::types::Transcript =
            serde_json::from_slice(&std::fs::read(directory.join("transcript.json")).unwrap())
                .unwrap();
        let reference: serde_json::Value = serde_json::from_slice(
            &std::fs::read(
                workspace
                    .join("docs/reports/evidence/criterio-editorial-assistente-2026-10-24.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(reference["status"], "APPROVED_AS_DELIVERY_REFERENCE");
        let clips: Vec<Clip> = reference["proposals"].as_array().unwrap().iter().map(|item| {
            serde_json::from_value(serde_json::json!({"id":super::super::types::identity("reference",item["start"].as_f64().unwrap(),item["end"].as_f64().unwrap(),Some("9:16")),"start":item["start"],"end":item["end"],"title":"Referência de avaliação","score":0,"reasons":[],"review":"pending"})).unwrap()
        }).collect();
        let scratch = directory.join("qwen35-reference-assessment");
        std::fs::create_dir_all(&scratch).unwrap();
        let engine = Engine::discover(&directory, super::super::types::Quality::Qwen35).unwrap();
        let started = std::time::Instant::now();
        let judgments = evaluate(
            &engine,
            &scratch,
            &clips,
            &transcript.segments,
            &ProcessControl::default(),
        )
        .unwrap();
        let cases = judgments.iter().enumerate().map(|(i,j)|serde_json::json!({"number":i+1,"start":clips[i].start,"end":clips[i].end,"expectedComplete":true,"expectedStandalone":true,"requiresImage":reference["proposals"][i]["requiresImage"],"standalone":j.standalone,"complete":j.complete,"analysis":j.analysis})).collect::<Vec<_>>();
        let result = serde_json::json!({"elapsedSeconds":started.elapsed().as_secs_f64(),"cases":cases,"scope":"Avaliação de intervalos aprovados; não comprova descoberta e títulos ainda exigem auditoria."});
        std::fs::write(
            directory.join("qwen35-reference-assessment.json"),
            serde_json::to_vec_pretty(&result).unwrap(),
        )
        .unwrap();
        assert_eq!(judgments.len(), 6);
        assert!(
            judgments.iter().all(|j| j.standalone && j.complete),
            "O Qwen recusou referência editorial aprovada; ver artefato."
        );
    }

    fn draft_for(closing: u8, opening: &str, ending: &str) -> Draft {
        serde_json::from_value(serde_json::json!({
            "nature":"relato","advertising":false,"openingStatus":opening,"endingStatus":ending,
            "analysis":{"title":"Jogo apaga o progresso da partida","summary":"A compra do jogo terminou em frustração quando o progresso desapareceu. O relato termina com a perda do salvamento.",
            "hook":{"score":80,"explanation":"O começo apresenta uma perda concreta dentro de um jogo.","evidenceId":0},
            "development":{"score":80,"explanation":"A consequência da falha está descrita nas próprias falas.","evidenceId":0},
            "closing":{"score":closing,"explanation":"O relato termina na consequência da perda do salvamento.","evidenceId":0}}})).unwrap()
    }

    fn judgment_for(closing: u8, source: &str) -> Evaluation {
        let quotes = evidence::quotes(source);
        let draft = draft_for(
            closing,
            "assuntoApresentado",
            "consequenciaOuReacaoDoMesmoEpisodio",
        );
        let mut result = ground(draft, "E1".into(), &quotes, source).unwrap();
        result.analysis_signature = Some("a".repeat(64));
        result
    }

    fn judgment(closing: u8) -> Evaluation {
        judgment_for(closing, "Comprei um jogo e ele apagou todo o progresso. Perdi a partida inteira e fiquei sem meu salvamento.")
    }

    #[test]
    fn closure_category_and_actual_context_are_required_despite_high_marks() {
        let source="Comprei um jogo e ele apagou todo o progresso. Perdi a partida inteira e fiquei sem meu salvamento.";
        let quotes = evidence::quotes(source);
        for ending in ["falaInterrompida", "perguntaPendente", "novoAssunto"] {
            let evaluation = ground(
                draft_for(95, "assuntoApresentado", ending),
                "E1".into(),
                &quotes,
                source,
            )
            .unwrap();
            assert!(!evaluation.complete);
            assert!(evaluation.analysis.as_ref().unwrap().criteria[2].score < 50);
            assert!(evaluation.reason.contains("não conclui"));
        }
        let evaluation = ground(
            draft_for(95, "contextoAusente", "consequenciaOuReacaoDoMesmoEpisodio"),
            "E1".into(),
            &quotes,
            source,
        )
        .unwrap();
        assert!(!evaluation.standalone);
        assert!(evaluation.analysis.as_ref().unwrap().criteria[0].score < 50);
        assert!(judgment(80).complete);
    }

    #[test]
    fn reported_completion_does_not_override_an_open_transcript_clause() {
        let evaluation = judgment_for(
            85,
            "Comprei um jogo e ele apagou todo o progresso. Perdi a partida inteira, porque,",
        );
        assert!(!evaluation.complete);
        assert!(evaluation.reason.contains("oração aberta"));
        assert!(
            !judgment_for(
                85,
                "A skin antiga ficou valiosa. No mercado, se você tem ela..."
            )
            .complete
        );
    }

    #[test]
    fn a_promised_explanation_is_not_a_complete_ending_even_with_a_period() {
        for ending in [
            "Aí das duas uma.",
            "O problema é o seguinte.",
            "Vou explicar.",
        ] {
            let source = format!("Comprei um jogo e ele apagou todo o progresso. {ending}");
            let evaluation = judgment_for(85, &source);
            assert!(!evaluation.complete, "fechamento indevido: {ending}");
            assert!(evaluation.analysis.unwrap().criteria[2].score < 50);
        }
        assert!(
            judgment_for(
                85,
                "Comprei um jogo e ele apagou todo o progresso. Precisei começar de novo."
            )
            .complete
        );
    }

    #[test]
    fn an_asr_comma_after_a_concluded_observation_is_not_itself_an_unfinished_story() {
        assert!(
            judgment_for(
                85,
                "O nome estava escrito errado na roupa. Ninguém revisou o texto, né,"
            )
            .complete
        );
    }

    #[test]
    fn flags_cannot_override_the_same_assessments_incomplete_ending() {
        let evaluation = judgment(30);
        assert!(evaluation.standalone);
        assert!(!evaluation.complete);
        assert!(evaluation.analysis.is_some());
    }

    #[test]
    fn approved_assessment_is_published_without_an_unrelated_second_verdict() {
        let mut clip: Clip = serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":0,"end":20,"title":"Proposta inicial","score":0,"reasons":[],"review":"pending"})).unwrap();
        apply(&mut clip, &judgment(80));
        assert_eq!(clip.title, "Jogo apaga o progresso da partida");
        assert!(clip.analysis_signature.is_some());
        let mut clips = vec![clip];
        super::super::editorial::retain_analyzed_complete(&mut clips);
        assert_eq!(clips.len(), 1);
    }

    #[test]
    fn reassessed_advertising_updates_the_published_classification() {
        let mut clip: Clip = serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":0,"end":20,"title":"Proposta inicial","score":0,"reasons":[],"review":"pending"})).unwrap();
        let mut evaluation = judgment(80);
        evaluation.advertising = true;
        apply(&mut clip, &evaluation);
        assert!(clip
            .reasons
            .iter()
            .any(|r| r.contains("Conteúdo promocional")));
        evaluation.advertising = false;
        apply(&mut clip, &evaluation);
        assert!(!clip
            .reasons
            .iter()
            .any(|r| r.contains("Conteúdo promocional")));
    }

    #[test]
    #[ignore = "valida respostas de amostras autorizadas; não acessa a rede"]
    fn imported_groq_samples_preserve_historical_flags_and_grounding() {
        let directory =
            std::path::PathBuf::from(std::env::var("CNP_INCREMENTAL_EVIDENCE").unwrap())
                .canonicalize()
                .unwrap();
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.tooling/test-output")
            .canonicalize()
            .unwrap();
        assert!(directory.starts_with(workspace));
        let transcript: crate::transcription::types::Transcript =
            serde_json::from_slice(&std::fs::read(directory.join("transcript.json")).unwrap())
                .unwrap();
        let mut cases = Vec::new();
        for (name, start, end, expected) in [
            ("relato-completo", 427.96, 455.30, true),
            ("mesmo-relato-interrompido", 427.96, 445.52, false),
            ("mudanca-sem-desfecho", 129.84, 235.04, false),
        ] {
            let clip: Clip = serde_json::from_value(serde_json::json!({"id":"a".repeat(64),"start":start,"end":end,"title":"Caso delimitado","score":0,"reasons":[],"review":"pending"})).unwrap();
            let source = super::super::semantic::source(&clip, &transcript.segments);
            let raw = std::fs::read(
                directory
                    .join("groq-comparison")
                    .join(format!("{name}.json")),
            )
            .unwrap();
            let draft: serde_json::Value = serde_json::from_slice(&raw).unwrap();
            let raw_complete = draft["complete"].as_bool().unwrap();
            let raw_standalone = draft["standalone"].as_bool().unwrap();
            let analysis: DraftAnalysis =
                serde_json::from_value(draft["analysis"].clone()).unwrap();
            analysis
                .ground(&evidence::quotes(&source), &source)
                .unwrap();
            cases.push(serde_json::json!({"name":name,"expectedComplete":expected,"rawComplete":raw_complete,"rawStandalone":raw_standalone,"groundingValidated":true,"scope":"Resposta histórica, anterior às categorias; não comprova o avaliador atual."}));
        }
        std::fs::write(
            directory.join("groq-comparison/validated-historical.json"),
            serde_json::to_vec_pretty(&cases).unwrap(),
        )
        .unwrap();
        assert_eq!(cases.len(), 3);
    }

    #[test]
    #[ignore = "comparação editorial local com modelo real; exige cópia da transcrição"]
    fn real_assessment_distinguishes_a_complete_story_from_its_interrupted_version() {
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let directory = std::path::PathBuf::from(
            std::env::var("CNP_INCREMENTAL_EVIDENCE").expect("pasta isolada"),
        )
        .canonicalize()
        .unwrap();
        assert!(directory.starts_with(
            workspace
                .join(".tooling/test-output")
                .canonicalize()
                .unwrap()
        ));
        let transcript: crate::transcription::types::Transcript =
            serde_json::from_slice(&std::fs::read(directory.join("transcript.json")).unwrap())
                .unwrap();
        let run = std::env::var("CNP_ASSESSMENT_RUN").expect("nome da rodada");
        assert!(run.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        let scratch = directory.join(&run);
        std::fs::create_dir_all(&scratch).unwrap();
        let engine = Engine::discover(
            &directory.join("base"),
            super::super::types::Quality::Qwen35,
        )
        .unwrap();
        let control = ProcessControl::default();
        let started = std::time::Instant::now();
        let mut results = Vec::new();
        for (name, start, end, complete) in [
            ("relato-completo", 427.96, 455.30, true),
            ("mesmo-relato-interrompido", 427.96, 445.52, false),
            ("mudanca-sem-desfecho", 129.84, 235.04, false),
        ] {
            let clip: Clip = serde_json::from_value(serde_json::json!({
                "id":"a".repeat(64),"start":start,"end":end,"title":"Caso delimitado",
                "score":0,"reasons":[],"review":"pending"}))
            .unwrap();
            let case_scratch = scratch.join(name);
            std::fs::create_dir_all(&case_scratch).unwrap();
            let evaluations = evaluate(
                &engine,
                &case_scratch,
                &[clip],
                &transcript.segments,
                &control,
            )
            .unwrap();
            let evaluation = &evaluations[0];
            results.push(serde_json::json!({"name":name,"start":start,"end":end,
                "expectedComplete":complete,"standalone":evaluation.standalone,"complete":evaluation.complete,
                "analysis":evaluation.analysis,"passed":evaluation.complete==complete && (!complete || evaluation.standalone)}));
            eprintln!(
                "[assessment-probe] {name}: completo={}, autônomo={}",
                evaluation.complete, evaluation.standalone
            );
        }
        let report =
            serde_json::json!({"elapsedSeconds":started.elapsed().as_secs_f64(),"cases":results});
        std::fs::write(
            directory.join(format!("{run}-summary.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        assert!(
            report["cases"]
                .as_array()
                .unwrap()
                .iter()
                .all(|case| case["passed"] == true),
            "{report}"
        );
    }
}
