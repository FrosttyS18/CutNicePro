use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub fn identity(media: &str, start: f64, end: f64, format: Option<&str>) -> String {
    let mut value = format!("{media}:{start:.3}:{end:.3}");
    if let Some(format) = format {
        value.push(':');
        value.push_str(format);
    }
    format!("{:x}", Sha256::digest(value))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub face_framing: Option<super::face_framing::FaceFraming>,
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub title: String,
    pub score: u8,
    pub reasons: Vec<String>,
    pub review: Review,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    /// Preenchimento inicial escolhido na geração ("cover"/"contain").
    /// Ausente = coleções antigas → o editor usa "contain" (padrão histórico).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis: Option<super::analysis_types::Analysis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_error: Option<String>,
    /// Assinatura dos segmentos da transcrição que alimentaram a análise
    /// (janela `start < clip.end && end > clip.start`). Atualização 19:
    /// editar um trecho da transcrição invalida SOMENTE os clipes cuja
    /// janela tocou segmentos alterados — não a coleção inteira.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_signature: Option<String>,
    /// Análise DESATUALIZADA (atualização 20): `Some(true)` marca que a
    /// análise preservada foi produzida sobre uma transcrição que já mudou
    /// (ou cuja origem não pode ser confirmada). O conteúdo histórico é
    /// mantido para recuperação, mas NÃO é avaliação válida do texto atual
    /// — a UI não publica a nota como concluída. Reanálise limpa o marcador.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_stale: Option<bool>,
    /// Exclusão persistente recuperável (atualização 19): `Some(true)` marca
    /// o clipe como excluído da experiência; NADA é apagado (mídia,
    /// transcrição, análise e demais clipes permanecem) e a restauração
    /// limpa o marcador. Geração não ressuscita clipe excluído.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted: Option<bool>,
    /// Motor que gerou ESTE clipe (atualização 19: biblioteca cumulativa
    /// mistura resultados históricos; a reanálise usa o motor de origem do
    /// próprio clipe, não o da última execução).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineRecord>,
    /// Criação REAL do clipe (ms-epoch; ausente em legados = nunca visto
    /// como novo, nunca recebe timestamp inventado). Setado UMA vez na
    /// primeira publicação; regenerar/editar não altera (G7).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at_ms: Option<u64>,
    /// Evidências multimodais realmente recebidas para este clipe (M3,
    /// goal-cortes-multimodais): frames com timestamp e eventos sonoros.
    /// Ausente = análise puramente textual (degradação declarada).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multimodal: Option<MultimodalEvidence>,
}

/// Evidências multimodais por clipe (M3): o que a análise REALMENTE recebeu
/// de imagem/áudio, com timestamps — nunca afirmado sem payload real.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MultimodalEvidence {
    /// Timestamps (s, mídia original) dos frames enviados ao modelo.
    pub frames: Vec<f64>,
    /// Resumo visual fundamentado nos frames recebidos.
    pub visual: String,
    /// Eventos sonoros/pausas do intervalo (detecção FFmpeg, não suposição).
    pub audio_events: Vec<String>,
    /// Ajustes de fronteira aplicados por pausa de áudio: (Δinício, Δfim).
    pub boundary_adjustments: (f64, f64),
    /// Backend que produziu a evidência (ex.: experimentalGemmaMultimodal).
    pub backend: String,
    /// Enquadramento automático (M4): centro suavizado da trajetória
    /// dominante, normalizado [0..1]; aplicado quando o corte não tem edição
    /// manual salva (manual SEMPRE vence = desativar automação por corte).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub framing: Option<Framing>,
}

/// Enquadramento derivado de trajetória (M4): centro normalizado + origem.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Framing {
    pub cx: f64,
    pub cy: f64,
    /// "tracking" (automático por trajetória) — intervenção manual muda o
    /// focal salvo no workspace e a automação deixa de aplicar.
    pub source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Review {
    Pending,
    Approved,
    Rejected,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipCollection {
    pub version: u8,
    pub media_id: String,
    pub transcript_hash: String,
    pub clips: Vec<Clip>,
    /// Metadados técnicos do motor que produziu a coleção (backend, modelo,
    /// template, amostragem). Não é conteúdo editorial — a UI não despeja
    /// textos internos; serve para reanálise pelo motor correto e para
    /// decidir quando uma análise antiga pode ser reaproveitada.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineRecord>,
}
impl ClipCollection {
    /// Atualiza o estado das análises após qualquer mudança na transcrição
    /// (atualizações 19/20 — substitui a invalidação total por `transcript_hash`).
    ///
    /// Estratégia granular, determinística e DURÁVEL em leituras (upd 20):
    /// cada clipe carrega a assinatura dos segmentos que o alimentam.
    ///
    /// - Transcrição inalterada (`transcript_hash` confere): clipes sem
    ///   assinatura (legados) recebem a atual — a coleção foi gravada íntegra
    ///   para ESTA transcrição, então a análise continua válida. Atribuir a
    ///   assinatura aqui é som, não confiança cega.
    /// - Transcrição alterada: quem TEM assinatura e ela divergiu → a análise
    ///   é preservada e marcada `analysis_stale` (desatualizada — recuperável,
    ///   nunca publicada como válida). Quem NÃO tem assinatura (legado sem
    ///   baseline) também é marcado `stale`: sem baseline não se pode afirmar
    ///   que a análise histórica corresponde ao texto atual. Este estado é
    ///   RECOMPUTADO igual a cada leitura — confiança não é renovada em ciclo
    ///   algum, e nenhum comando de leitura grava no disco.
    /// - Revisão humana nunca é redefinida aqui (registros históricos
    ///   Pending/Approved/Rejected permanecem).
    pub fn refresh_analysis_state(&mut self, segments: &[crate::transcription::types::Segment]) {
        let Ok(current) = super::store::fingerprint(segments) else {
            return; // sem assinatura confiável não há o que comparar: preserva
        };
        if self.transcript_hash == current {
            for clip in &mut self.clips {
                if clip.analysis_signature.is_none() {
                    clip.analysis_signature =
                        Some(super::store::clip_signature(segments, clip.start, clip.end));
                }
            }
            return;
        }
        for clip in &mut self.clips {
            let signature = super::store::clip_signature(segments, clip.start, clip.end);
            let outdated = match &clip.analysis_signature {
                // legado sem baseline: origem da análise não confirmável
                None => clip.analysis.is_some(),
                // assinatura divergiu: a análise foi feita sobre outro texto
                Some(old) if *old != signature => true,
                Some(_) => false,
            };
            clip.analysis_signature = Some(signature);
            if outdated {
                clip.analysis_stale = Some(true);
            }
        }
        self.transcript_hash = current;
    }
}

/// Registro técnico do motor usado na geração (atualização 8: modo
/// experimental Gemma 4). `backend` distingue coleções e veda reuso de
/// análise entre motores diferentes.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineRecord {
    pub backend: String,
    pub model: String,
    pub template: String,
    pub sampling: String,
    pub seed: u32,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Quality {
    /// Motor padrão histórico (Qwen3-4B local). NÃO é mais usado para GERAR
    /// (decisão do mantenedor, atualização 17: Gemma 4 exclusivo); permanece
    /// para LER e re-analisar coleções antigas que o registraram.
    Standard,
    /// Gemma-4-12B-IT QAT Q4_0 local — ÚNICO motor de geração desde a
    /// atualização 17. Default do payload: pedidos sem `quality` explícito
    /// também geram com Gemma 4.
    #[default]
    ExperimentalGemma,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub min_seconds: f64,
    pub max_seconds: f64,
    pub count: usize,
    #[serde(default)]
    pub format: Option<String>,
    /// Preenchimento aplicado aos cortes gerados ("cover"=Preencher,
    /// "contain"=Manter vídeo inteiro). Ausente = "contain" (histórico).
    #[serde(default)]
    pub fit: Option<String>,
    /// Escolha explícita de motor; ignorado na geração desde a atualização
    /// 17 (Gemma 4 exclusivo — o default resolve para Gemma). Nunca houve
    /// troca silenciosa: o Gemma falha com erro próprio se indisponível.
    #[serde(default)]
    pub quality: Option<Quality>,
    /// Modo automático: quantidade e duração resultam dos momentos
    /// encontrados dentro de LIMITES TÉCNICOS fixos (10–180 s, até 12
    /// cortes) — nunca de valores de episódio. Resolvido a partir de
    /// `GenerateOptions` antes de entrar no pipeline.
    #[serde(default)]
    pub automatic: bool,
}
impl Options {
    pub fn quality(&self) -> Quality {
        self.quality.unwrap_or_default()
    }
    pub fn validate(&self) -> Result<(), String> {
        if !self.automatic
            && (!self.min_seconds.is_finite()
                || !self.max_seconds.is_finite()
                || self.min_seconds < 10.0
                || self.max_seconds > 180.0
                || self.max_seconds < self.min_seconds
                || !(1..=12).contains(&self.count)
                || self
                    .format
                    .as_ref()
                    .is_some_and(|v| !["16:9", "9:16", "1:1", "4:5"].contains(&v.as_str())))
        {
            return Err("Escolha de 1 a 12 cortes, com duração entre 10 e 180 segundos.".into());
        }
        if self.automatic
            && self
                .format
                .as_ref()
                .is_some_and(|v| !["16:9", "9:16", "1:1", "4:5"].contains(&v.as_str()))
        {
            return Err("Escolha de 1 a 12 cortes, com duração entre 10 e 180 segundos.".into());
        }
        Ok(())
    }
}

/// Limites técnicos do modo automático — documentados e fixos (os mesmos
/// limites absolutos que o modo personalizado aceita). Nenhum valor de
/// episódio, nenhuma quantidade arbitrária: o conteúdo decide quantos
/// momentos existem; o piso editorial e o teto aplicam-se com registro.
pub const AUTOMATIC_MIN_SECONDS: f64 = 10.0;
pub const AUTOMATIC_MAX_SECONDS: f64 = 180.0;
pub const AUTOMATIC_MAX_CLIPS: usize = 12;
/// Piso editorial do automático: candidato cuja PRÓPRIA avaliação fique
/// abaixo disso não vira sugestão (registro no log; nunca some em silêncio).
pub const AUTOMATIC_RELEVANCE_FLOOR: u8 = 50;

/// Contrato da UI para gerar cortes. `automatic` não envia duração nem
/// quantidade; o personalizado envia os três valores explicitamente (a
/// duração mínima é técnica, 10 s — "até 3 minutos" NÃO implica mínimos).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateOptions {
    #[serde(default)]
    pub automatic: bool,
    #[serde(default)]
    pub min_seconds: Option<f64>,
    #[serde(default)]
    pub max_seconds: Option<f64>,
    #[serde(default)]
    pub count: Option<usize>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub fit: Option<String>,
    #[serde(default)]
    pub quality: Option<Quality>,
}
impl GenerateOptions {
    /// Resolve o pedido da UI em limites concretos para o pipeline. O
    /// automático recebe os LIMITES TÉCNICOS (não valores de episódio e não
    /// os antigos valores fixos da UI); o personalizado valida o que veio.
    pub fn resolve(self) -> Result<Options, String> {
        let format_valid = self
            .format
            .as_ref()
            .is_none_or(|v| ["16:9", "9:16", "1:1", "4:5"].contains(&v.as_str()));
        if !format_valid {
            return Err("Proporção de corte inválida.".into());
        }
        if !self
            .fit
            .as_ref()
            .is_none_or(|v| ["cover", "contain"].contains(&v.as_str()))
        {
            return Err("Ajuste do vídeo inválido.".into());
        }
        if self.automatic {
            if self.min_seconds.is_some() || self.max_seconds.is_some() || self.count.is_some() {
                return Err("No modo automático, quantidade e duração não são informados.".into());
            }
            return Ok(Options {
                min_seconds: AUTOMATIC_MIN_SECONDS,
                max_seconds: AUTOMATIC_MAX_SECONDS,
                count: AUTOMATIC_MAX_CLIPS,
                format: self.format,
                fit: self.fit,
                quality: self.quality,
                automatic: true,
            });
        }
        let (min_seconds, max_seconds, count) = (
            self.min_seconds.ok_or("Informe a duração dos cortes.")?,
            self.max_seconds.ok_or("Informe a duração dos cortes.")?,
            self.count.ok_or("Informe a quantidade de cortes.")?,
        );
        let options = Options {
            min_seconds,
            max_seconds,
            count,
            format: self.format,
            fit: self.fit,
            quality: self.quality,
            automatic: false,
        };
        options.validate()?;
        Ok(options)
    }
}
