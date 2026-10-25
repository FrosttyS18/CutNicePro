//! Refine determinístico de fronteiras (G6 nº 2, goal-recuperacao-autoclip).
//!
//! Adaptado do par AutoClip (zhouxiaoka `boundaries.py`/`quality.py` e
//! artbyjazi `boundaries.py`, MIT, revs 3d3b5ed/5d0eac3, estudados em
//! `g4-estudo-autoclip.md`): o LLM propõe a janela; o CÓDIGO corrige as
//! bordas para unidades de fala completas usando dados que o app já tem
//! (palavras com tempo do Whisper + pausas reais de áudio do
//! silencedetect). Regras:
//! 1) início sobe para o começo da primeira frase completa no/ligeiramente
//!    antes do alvo (ou desce para dentro da linha no fim de frase interno);
//! 2) fim acompanha a frase conclusiva sem recuar à frase anterior;
//! 3) pergunta final sem uma resposta concluída é devolvida
//!    ao próximo tópico — corta ANTES dela, sem jamais remover >40% do clipe;
//! 4) bordas deslizam para a pausa de áudio real mais próxima (≤1,2 s).
//! Nenhuma correção pode encolher abaixo do mínimo da Options ou sair da mídia. Sem dado de palavras/pausas → devolve a
//! janela intacta (nunca perde clipe).

use crate::transcription::types::Segment;

#[derive(Debug, Clone, PartialEq)]
pub struct Refined {
    pub start: f64,
    pub end: f64,
    pub ops: Vec<&'static str>,
}

const PAUSE_SEC: f64 = 0.55; // pausa ≥ isto conta como fim de frase sem pontuação
const SNAP_SEC: f64 = 1.2; // desliza a borda até esta distância para uma pausa
const TRAILING_Q_SEC: f64 = 12.0; // resposta mais curta que isto após "?" = próximo tópico
const MAX_SHRINK: f64 = 0.4; // refine nunca remove mais que esta fração do clipe
const SENTENCE_END: &[char] = &['.', '!', '?', '。', '！', '？', '…'];

fn ends_sentence(text: &str) -> bool {
    let trimmed = text.trim_end();
    match trimmed.chars().last() {
        Some(c) => SENTENCE_END.contains(&c),
        None => false,
    }
}

fn lexical_words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
}

/** Frases como (início_palavra, fim_palavra, texto) em [from, to] da mídia. */
fn sentence_units(speech: &[Segment], from: f64, to: f64) -> Vec<(f64, f64, String)> {
    let punctuated = speech
        .iter()
        .flat_map(|s| s.words.iter())
        .any(|w| w.text.chars().any(|c| ",.?!;:".contains(c)));
    let mut units = Vec::new();
    let mut current: Vec<&crate::transcription::types::Word> = Vec::new();
    let flush = |current: &mut Vec<&crate::transcription::types::Word>,
                 units: &mut Vec<(f64, f64, String)>| {
        if !current.is_empty() {
            units.push((
                current[0].start,
                current.last().unwrap().end,
                current
                    .iter()
                    .map(|word| word.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" "),
            ));
            current.clear();
        }
    };
    for segment in speech {
        if segment.end <= from || segment.start >= to {
            continue;
        }
        if segment.words.is_empty() {
            flush(&mut current, &mut units);
            // sem word-level: o segmento inteiro é a unidade
            if !segment.text.trim().is_empty() {
                units.push((segment.start, segment.end, segment.text.clone()));
            }
            continue;
        }
        for word in &segment.words {
            if !punctuated
                && current
                    .last()
                    .is_some_and(|last| word.start - last.end >= PAUSE_SEC)
            {
                flush(&mut current, &mut units);
            }
            current.push(word);
            if ends_sentence(&word.text) {
                flush(&mut current, &mut units);
            }
        }
        if ends_sentence(&segment.text) && !current.is_empty() {
            let words_match_text = lexical_words(&segment.text).eq(segment
                .words
                .iter()
                .flat_map(|word| lexical_words(&word.text)));
            let end = if words_match_text {
                current.last().unwrap().end
            } else {
                segment.end
            };
            let mut text = current
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            text.push(segment.text.trim_end().chars().last().unwrap());
            units.push((current[0].start, end, text));
            current.clear();
        }
    }
    flush(&mut current, &mut units);
    units
}

fn nearest_pause(boundaries: &[f64], target: f64, limit: f64) -> Option<f64> {
    // pausa real = fim de uma unidade; desliza a borda para cá se ≤ limit
    let mut best: Option<(f64, f64)> = None; // (distância, tempo)
    for &t in boundaries {
        let d = (t - target).abs();
        if d <= limit && best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, t));
        }
    }
    best.map(|(_, t)| t)
}

/** Refina as bordas de um clipe. `next_start`/`prev_end` delimitam vizinhos. */
pub fn refine_boundaries(
    clip_start: f64,
    clip_end: f64,
    speech: &[Segment],
    pauses: &[(f64, f64)],
    min_seconds: f64,
    prev_end: Option<f64>,
    next_start: Option<f64>,
    media_end: f64,
) -> Refined {
    let original = clip_end - clip_start;
    if original <= 0.0 {
        return Refined {
            start: clip_start,
            end: clip_end,
            ops: Vec::new(),
        };
    }
    let has_words = speech.iter().any(|s| !s.words.is_empty());
    if !has_words {
        return Refined {
            start: clip_start,
            end: clip_end,
            ops: Vec::new(),
        }; // sem word-level: conservador
    }
    let units = sentence_units(speech, clip_start - 8.0, clip_end + 8.0);
    if units.is_empty() {
        return Refined {
            start: clip_start,
            end: clip_end,
            ops: Vec::new(),
        };
    }
    let mut ops: Vec<&'static str> = Vec::new();

    // --- início: primeira frase que começa em/antes do alvo (até 8 s antes) ---
    let mut start = clip_start;
    if let Some(first) = units
        .iter()
        .find(|u| u.1 > clip_start && u.0 >= clip_start - 8.0)
    {
        if first.0 != clip_start && first.0 < clip_start {
            start = first.0;
            ops.push("start_sentence");
        }
    }

    // --- fim: frase que cobre o alvo; corta na primeira conclusão >= alvo ---
    let mut end = clip_end;
    let covering: Vec<_> = units
        .iter()
        .filter(|u| u.0 < clip_end && u.1 >= clip_end - 0.05)
        .collect();
    if let Some(unit) = covering.first() {
        if ends_sentence(&unit.2) && unit.1 > clip_end {
            end = unit.1;
            ops.push("end_sentence");
        }
    } else if let Some(last) = units
        .iter()
        .filter(|u| u.0 < clip_end && u.1 < clip_end)
        .next_back()
    {
        // alvo cai num vão: desce para o fim da frase anterior se >= min
        if last.1 >= clip_start + min_seconds && last.1 < clip_end {
            end = last.1;
            ops.push("end_gap");
        }
    }

    // --- pergunta final do entrevistador devolvida ao próximo tópico ---
    let q_units: Vec<_> = units
        .iter()
        .filter(|u| u.0 >= end - TRAILING_Q_SEC && u.0 < end && u.2.trim_end().ends_with('?'))
        .collect();
    if let Some(q) = q_units.last() {
        let after: Vec<_> = units
            .iter()
            .filter(|u| u.0 >= q.1 && u.1 <= end + 1.0)
            .collect();
        let answer: f64 = after.iter().map(|u| u.1 - u.0).sum();
        let cut = q.0;
        if !after.iter().any(|unit| ends_sentence(&unit.2))
            && answer <= TRAILING_Q_SEC
            && cut - start >= min_seconds
            && (end - cut) <= original * MAX_SHRINK
        {
            end = cut;
            ops.push("drop_trailing_question");
        }
    }

    // --- limites duros: mídia, vizinhos, mínimo ---
    start = start.clamp(0.0, media_end);
    if start + min_seconds > media_end {
        return Refined {
            start: clip_start,
            end: clip_end,
            ops: Vec::new(),
        };
    }
    end = end.clamp(start + min_seconds, media_end);
    if let Some(prev) = prev_end {
        start = start.max(prev);
        if end < start + min_seconds {
            return Refined {
                start: clip_start,
                end: clip_end,
                ops: Vec::new(),
            }; // conflito: mantém original
        }
    }
    if let Some(next) = next_start {
        end = end.min(next);
        if end < start + min_seconds {
            return Refined {
                start: clip_start,
                end: clip_end,
                ops: Vec::new(),
            };
        }
    }

    let mut bounds: Vec<f64> = units.iter().map(|u| u.1).collect();
    let mut starts: Vec<f64> = units.iter().map(|u| u.0).collect();
    for &(ps, pe) in pauses {
        if pe > start && ps < end + SNAP_SEC {
            bounds.push(pe);
            starts.push(pe);
        }
    }
    bounds.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    bounds.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
    if let Some(p) = nearest_pause(&starts, start, SNAP_SEC) {
        let lower = prev_end.unwrap_or(0.0);
        if p >= lower && end - p >= min_seconds && p > start {
            start = p;
            ops.push("start_pause");
        } else if p < start && p >= lower && end - p >= min_seconds {
            start = p;
            ops.push("start_pause");
        }
    }
    if let Some(p) = nearest_pause(&bounds, end, SNAP_SEC) {
        let upper = next_start.unwrap_or(media_end);
        if p <= upper && p - start >= min_seconds {
            end = p;
            ops.push("end_pause");
        }
    }

    if ops.is_empty() || end <= start {
        return Refined {
            start: clip_start,
            end: clip_end,
            ops: Vec::new(),
        };
    }
    Refined { start, end, ops }
}

pub fn refine_candidates(
    clips: &mut [super::types::Clip],
    speech: &[Segment],
    min_seconds: f64,
    duration: f64,
) {
    for clip in clips {
        let refined = refine_boundaries(
            clip.start,
            clip.end,
            speech,
            &[],
            min_seconds,
            None,
            None,
            duration,
        );
        clip.start = refined.start;
        clip.end = refined.end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcription::types::Word;

    #[test]
    fn overlapping_candidates_are_refined_without_trimming_each_other() {
        let speech = vec![
            seg(0.0, 20.0, "Contexto.", vec![("Contexto.", 0.0, 20.0)]),
            seg(20.0, 39.0, "Conclusão.", vec![("Conclusão.", 20.0, 39.0)]),
            seg(
                41.0,
                45.0,
                "Outra pergunta?",
                vec![("Outra", 41.0, 43.0), ("pergunta?", 43.0, 45.0)],
            ),
            seg(
                45.0,
                60.0,
                "Resposta completa.",
                vec![("Resposta", 45.0, 52.0), ("completa.", 52.0, 60.0)],
            ),
        ];
        let mut clips: Vec<super::super::types::Clip> = [(0.0,41.0),(20.0,60.0)].into_iter().enumerate().map(|(i,(start,end))|serde_json::from_value(serde_json::json!({"id":i.to_string(),"start":start,"end":end,"title":"Versão completa","score":80,"reasons":[],"review":"pending"})).unwrap()).collect();
        refine_candidates(&mut clips, &speech, 10.0, 60.0);
        assert_eq!((clips[0].start, clips[0].end), (0.0, 39.0));
        assert_eq!((clips[1].start, clips[1].end), (20.0, 60.0));
    }

    fn seg(start: f64, end: f64, text: &str, words: Vec<(&str, f64, f64)>) -> Segment {
        Segment {
            id: format!("s{start}"),
            start,
            end,
            text: text.into(),
            words: words
                .into_iter()
                .map(|(t, s, e)| Word {
                    text: t.into(),
                    start: s,
                    end: e,
                })
                .collect(),
        }
    }

    #[test]
    fn preserves_the_concluding_sentence_instead_of_retreating_to_previous_one() {
        let speech = vec![seg(
            0.0,
            18.0,
            "Contexto. Explicação com conclusão.",
            vec![
                ("Contexto.", 0.0, 10.0),
                ("Explicação", 10.1, 13.0),
                ("com", 13.0, 15.0),
                ("conclusão.", 15.0, 18.0),
            ],
        )];
        let refined = refine_boundaries(0.0, 15.0, &speech, &[], 3.0, None, None, 25.0);
        assert_eq!(refined.end, 18.0);
    }

    #[test]
    fn a_truncated_word_list_does_not_attach_the_next_interrupted_sentence() {
        let speech = vec![
            seg(
                0.0,
                8.0,
                "Eu vi o erro.",
                vec![
                    ("Eu", 0.0, 1.0),
                    ("vi", 1.0, 2.0),
                    ("o", 2.0, 3.0),
                    ("erro.", 3.0, 8.0),
                ],
            ),
            seg(
                8.0,
                12.0,
                "Não sei qual é o problema dessa imagem.",
                vec![
                    ("Não", 8.0, 8.2),
                    ("sei", 8.2, 8.4),
                    ("qual", 8.4, 8.6),
                    ("é", 8.6, 8.8),
                    ("o", 8.8, 9.0),
                    ("problema", 9.0, 10.0),
                    ("dessa", 10.0, 11.0),
                ],
            ),
            seg(
                12.02,
                14.0,
                "Tem que ampliar, eu não tô...",
                vec![
                    ("Tem", 12.02, 12.5),
                    ("que ampliar,", 12.5, 13.0),
                    ("eu não tô...", 13.0, 14.0),
                ],
            ),
        ];
        let refined = refine_boundaries(0.0, 12.0, &speech, &[], 3.0, None, None, 14.0);
        assert_eq!(refined.end, 12.0);
        assert_eq!(speech[1].words.last().unwrap().end, 11.0);
        assert_eq!(speech[1].text, "Não sei qual é o problema dessa imagem.");
    }

    #[test]
    fn missing_terminal_punctuation_preserves_the_complete_word_timing() {
        let speech = vec![seg(
            0.0,
            30.0,
            "A tarefa terminou com sucesso.",
            vec![
                ("A", 0.0, 1.0),
                ("tarefa", 1.0, 2.0),
                ("terminou", 2.0, 3.0),
                ("com", 3.0, 4.0),
                ("sucesso", 4.0, 5.0),
            ],
        )];
        let refined = refine_boundaries(0.0, 5.0, &speech, &[], 3.0, None, None, 30.0);
        assert_eq!(refined.end, 5.0);
        assert!(refined.end - refined.start <= 15.0);
        assert_eq!(speech[0].end, 30.0);
        assert_eq!(speech[0].words.last().unwrap().text, "sucesso");
    }

    #[test]
    fn rhetorical_question_with_a_finished_answer_keeps_its_conclusion() {
        let speech = vec![
            seg(
                0.0,
                20.0,
                "Contexto completo.",
                vec![("Contexto", 0.0, 10.0), ("completo.", 10.0, 20.0)],
            ),
            seg(
                20.1,
                22.0,
                "Vou perder tempo?",
                vec![
                    ("Vou", 20.1, 20.5),
                    ("perder", 20.5, 21.0),
                    ("tempo?", 21.0, 22.0),
                ],
            ),
            seg(
                22.1,
                30.0,
                "Não. Qualidade importa.",
                vec![
                    ("Não.", 22.1, 23.0),
                    ("Qualidade", 23.0, 27.0),
                    ("importa.", 27.0, 30.0),
                ],
            ),
        ];
        let refined = refine_boundaries(0.0, 30.0, &speech, &[], 3.0, None, None, 35.0);
        assert_eq!(refined.end, 30.0);
        assert!(!refined.ops.contains(&"drop_trailing_question"));
    }

    #[test]
    fn a_sentence_end_is_not_a_valid_start_snap_that_removes_the_hook() {
        let speech = vec![
            seg(
                0.0,
                0.6,
                "Olá pessoal.",
                vec![("Olá", 0.0, 0.2), ("pessoal.", 0.2, 0.6)],
            ),
            seg(
                0.7,
                15.0,
                "Tema completo.",
                vec![("Tema", 0.7, 9.0), ("completo.", 9.0, 15.0)],
            ),
        ];
        let refined = refine_boundaries(0.0, 15.0, &speech, &[], 3.0, None, None, 20.0);
        assert_eq!(refined.start, 0.0);
    }

    #[test]
    fn speech_rows_do_not_split_a_sentence_into_unrelated_units() {
        let speech = vec![
            seg(
                0.0,
                2.0,
                "Vamos falar",
                vec![("Vamos", 0.0, 1.0), ("falar", 1.0, 2.0)],
            ),
            seg(
                2.0,
                5.0,
                "de quantidade.",
                vec![("de", 2.0, 2.5), ("quantidade.", 2.5, 5.0)],
            ),
            seg(
                5.1,
                15.0,
                "A conclusão.",
                vec![("A", 5.1, 7.0), ("conclusão.", 7.0, 15.0)],
            ),
        ];
        let refined = refine_boundaries(2.0, 15.0, &speech, &[], 3.0, None, None, 20.0);
        assert_eq!(refined.start, 0.0);
        assert_eq!(refined.end, 15.0);
    }

    #[test]
    fn moves_start_back_to_sentence_beginning() {
        // modelo cortou no meio da primeira frase; refine sobe para o começo dela
        let speech = vec![seg(
            9.5,
            14.0,
            "Frase completa do início. Meio",
            vec![
                ("Frase", 9.5, 10.0),
                ("completa", 10.0, 10.6),
                ("do", 10.6, 10.8),
                ("início.", 10.8, 11.2),
                ("Meio", 11.2, 11.6),
            ],
        )];
        let r = refine_boundaries(10.4, 14.0, &speech, &[], 3.0, None, None, 30.0);
        assert!((r.start - 9.5).abs() < 0.01, "start {}", r.start);
        assert!(r.ops.contains(&"start_sentence"));
    }

    #[test]
    fn cuts_end_on_covering_sentence() {
        // alvo 14.0 cai no meio da frase 11-16; fim de frase interno em 13.5
        let speech = vec![seg(
            9.0,
            16.0,
            "Duas frases aqui.",
            vec![
                ("Duas", 9.0, 9.5),
                ("frases", 9.5, 10.2),
                ("aqui.", 10.2, 10.8),
                ("Segunda", 10.8, 11.4),
                ("frase", 11.4, 12.6),
                ("termina", 12.6, 13.5),
                ("agora.", 13.5, 14.2),
            ],
        )];
        let r = refine_boundaries(9.0, 14.0, &speech, &[], 3.0, None, None, 30.0);
        assert!((r.end - 14.2).abs() < 0.6, "end {}", r.end); // termina na frase que cobre
    }

    #[test]
    fn drops_trailing_interviewer_question() {
        // resposta termina em 20; de 21-23 há "?... resposta curta" (próximo tópico)
        let speech = vec![
            seg(
                10.0,
                20.0,
                "Resposta completa que termina aqui.",
                vec![
                    ("Resposta", 10.0, 10.8),
                    ("completa.", 10.8, 11.6),
                    ("Que", 11.6, 12.0),
                    ("termina", 12.0, 12.8),
                    ("aqui.", 12.8, 13.5),
                ],
            ),
            seg(
                21.0,
                23.0,
                "E o próximo tema?",
                vec![
                    ("E", 21.0, 21.3),
                    ("o", 21.3, 21.5),
                    ("próximo", 21.5, 22.2),
                    ("tema?", 22.2, 23.0),
                ],
            ),
        ];
        let r = refine_boundaries(10.0, 23.0, &speech, &[], 3.0, None, None, 30.0);
        assert!(r.end <= 21.5, "end {}", r.end);
        assert!(r.ops.contains(&"drop_trailing_question"));
    }

    #[test]
    fn never_shrinks_below_minimum_or_into_neighbor() {
        let speech = vec![seg(
            10.0,
            12.0,
            "Curto demais.",
            vec![("Curto", 10.0, 10.6), ("demais.", 10.6, 11.5)],
        )];
        // mínimo 5 s: refine não pode encolher para 1,5 s — mantém janela que respeita o mínimo
        let r = refine_boundaries(10.0, 16.0, &speech, &[], 5.0, None, Some(16.5), 30.0);
        assert!(r.end - r.start >= 5.0, "{}..{}", r.start, r.end);
        assert!(r.end <= 16.5);
    }

    #[test]
    fn snaps_to_real_audio_pause() {
        let speech = vec![
            seg(
                10.0,
                12.0,
                "Uma frase.",
                vec![("Uma", 10.0, 10.5), ("frase.", 10.5, 11.4)],
            ),
            seg(
                13.2,
                16.0,
                "Outra frase.",
                vec![("Outra", 13.2, 13.8), ("frase.", 13.8, 15.0)],
            ),
        ];
        // pausa real 12.0–13.2; alvo final 14.8 → desliza para 13.2 (início da fala pós-pausa)
        let pauses = vec![(12.0, 13.2)];
        let r = refine_boundaries(10.0, 14.8, &speech, &pauses, 3.0, None, None, 30.0);
        assert!(
            (r.start - 13.2).abs() < 0.01 || r.start == 10.0,
            "start {}",
            r.start
        );
        assert!(r.end >= r.start + 3.0);
    }

    #[test]
    fn no_word_data_keeps_window() {
        let speech = vec![seg(10.0, 20.0, "Sem palavras com tempo.", vec![])];
        let r = refine_boundaries(12.0, 18.0, &speech, &[], 3.0, None, None, 30.0);
        assert_eq!((r.start, r.end), (12.0, 18.0));
        assert!(r.ops.is_empty());
    }
}
