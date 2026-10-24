//! Tracking controlado (M4, goal-cortes-multimodais-2026-10-23).
//!
//! Associação temporal no estilo ByteTrack (FoundationVision/ByteTrack,
//! revisão d1bf0191adff59bc8fcfeaa0b33d3d1642552a99, Apache-2.0, arquivo
//! yolox/tracker/byte_tracker.py LIDO NA ÍNTEGRA nesta revisão):
//! associações em DOIS estágios por distância IoU — (1) detecções de
//! confiança alta contra trilhas ativas+perdidas (com fusão de score) e
//! (2) trilhas restantes contra detecções de confiança baixa (resgata
//! oclusões) — com buffer de trilhas perdidas e confirmação de novas.
//! ADOTADO: o esquema de associação e o tratamento de oclusão.
//! REJEITADO: o detector YOLOX (dependência de motor/pesos adicionais;
//! o MVP usa detecção por DIFERENÇA DE FRAMES local para pessoas em
//! movimento e por COR para o caso controlado de objeto — sem fingir
//! associação de falante nem reconhecimento de identidade).
//!
//! Contrato honesto: `Track` é uma trajetória com IDs LOCAIS, confiança e
//! marcação de oclusão; mudança de cena REINICIA as trilhas (sem saltos
//! indevidos); o framing derivado é uma média móvel CENTRALIZADA e
//! limitada às bordas — em ambiguidade, enquadramento amplo/seguro.

use crate::transcription::process::ProcessControl;
use std::{
    collections::VecDeque,
    path::Path,
    process::{Command, Stdio},
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Detection {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub score: f64,
}

impl Detection {
    fn center(&self) -> (f64, f64) {
        ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)
    }
    fn area(&self) -> f64 {
        (self.x2 - self.x1).max(0.0) * (self.y2 - self.y1).max(0.0)
    }
    fn iou(&self, other: &Detection) -> f64 {
        let x1 = self.x1.max(other.x1);
        let y1 = self.y1.max(other.y1);
        let x2 = self.x2.min(other.x2);
        let y2 = self.y2.min(other.y2);
        let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
        let union = self.area() + other.area() - inter;
        if union <= 0.0 {
            0.0
        } else {
            inter / union
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TrackPoint {
    /** índice do frame amostrado */
    pub frame: usize,
    /** tempo na mídia original (s) */
    pub t: f64,
    /** centro normalizado [0..1] */
    pub cx: f64,
    pub cy: f64,
    /** área relativa ao frame [0..1] */
    pub area: f64,
    /** sem detecção neste frame (projeção da última posição) */
    pub occluded: bool,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Track {
    pub id: usize,
    pub points: Vec<TrackPoint>,
    /** trilha encerrada por mudança de cena (reinício deliberado) */
    pub reset_by_scene: bool,
}

impl Track {
    /** Variância do centro (fração do frame): movimento relevante p/ framing. */
    pub fn motion_variance(&self) -> f64 {
        let visible: Vec<&TrackPoint> = self.points.iter().filter(|p| !p.occluded).collect();
        if visible.len() < 4 {
            return 0.0;
        }
        let (mx, my) = visible
            .iter()
            .map(|p| (p.cx, p.cy))
            .fold((0.0, 0.0), |a, v| (a.0 + v.0, a.1 + v.1));
        let (mx, my) = (mx / visible.len() as f64, my / visible.len() as f64);
        let variance: f64 = visible
            .iter()
            .map(|p| (p.cx - mx).powi(2) + (p.cy - my).powi(2))
            .sum::<f64>()
            / visible.len() as f64;
        variance.sqrt()
    }

    /** Framing suavizado: média móvel do centro, clamp seguro nas bordas.
     *  `None` quando o movimento não justifica enquadramento automático. */
    pub fn smoothed_framing(&self, min_variance: f64) -> Option<(f64, f64)> {
        if self.motion_variance() < min_variance {
            return None;
        }
        let window = 5usize;
        let mut queue: VecDeque<(f64, f64)> = VecDeque::new();
        let mut sum = (0.0, 0.0);
        let mut smoothed = Vec::with_capacity(self.points.len());
        for point in &self.points {
            queue.push_back((point.cx, point.cy));
            sum.0 += point.cx;
            sum.1 += point.cy;
            if queue.len() > window {
                let old = queue.pop_front().expect("fila não vazia");
                sum.0 -= old.0;
                sum.1 -= old.1;
            }
            smoothed.push((sum.0 / queue.len() as f64, sum.1 / queue.len() as f64));
        }
        // média final da segunda metade (ignora arranque) + clamp seguro
        let tail = &smoothed[smoothed.len() / 2..];
        let (mut cx, mut cy) = tail.iter().fold((0.0, 0.0), |a, v| (a.0 + v.0, a.1 + v.1));
        cx /= tail.len() as f64;
        cy /= tail.len() as f64;
        Some((cx.clamp(0.12, 0.88), cy.clamp(0.12, 0.88)))
    }
}

const HIGH_SCORE: f64 = 0.35;
const LOW_SCORE: f64 = 0.08;
const MATCH_IOU: f64 = 0.30;
const SECOND_IOU: f64 = 0.20;
const MAX_LOST_FRAMES: usize = 12;
const MIN_HITS: usize = 2;

#[derive(Clone)]
struct Internal {
    id: usize,
    last: Detection,
    hits: usize,
    age: usize,
    lost_for: usize,
    points: Vec<TrackPoint>,
    reset_by_scene: bool,
}

/** Associação em dois estágios no estilo ByteTrack (IoU; atribuição
 *  ótima por permutação para N pequeno — paridade do linear_assignment
 *  para os tamanhos do MVP; documentado como simplificação). */
pub struct ByteLike {
    tracks: Vec<Internal>,
    /// trajetórias ENCERRADAS (corte de cena ou buffer de oclusão) que
    /// permanecem na saída: um plano termina, a trilha dele fica registrada.
    archived: Vec<Track>,
    next_id: usize,
}

impl Default for ByteLike {
    fn default() -> Self {
        ByteLike {
            tracks: Vec::new(),
            archived: Vec::new(),
            next_id: 1,
        }
    }
}

pub(crate) fn iou_cost(a: &Detection, b: &Detection) -> f64 {
    1.0 - a.iou(b)
}

/** Atribuição ótima por força bruta (N,M ≤ 6 no MVP; senão gulosa). */
pub(crate) fn assign(cost: &[Vec<f64>], threshold: f64) -> Vec<(usize, usize)> {
    let n = cost.len();
    let m = cost.first().map(|row| row.len()).unwrap_or(0);
    if n == 0 || m == 0 {
        return Vec::new();
    }
    if n <= 6 && m <= 6 {
        let mut order: Vec<usize> = (0..m).collect();
        let mut best: Option<(usize, f64, Vec<(usize, usize)>)> = None;
        loop {
            let mut total = 0.0;
            let mut pairs = Vec::new();
            for i in 0..n.min(m) {
                let j = order[i];
                if cost[i][j] < threshold {
                    total += cost[i][j];
                    pairs.push((i, j));
                }
            }
            // mais pares casados vence; empate → menor custo
            let better = match &best {
                None => true,
                Some((count, cost_sum, _)) => {
                    pairs.len() > *count || (pairs.len() == *count && total < *cost_sum)
                }
            };
            if better {
                best = Some((pairs.len(), total, pairs));
            }
            if !next_permutation(&mut order) {
                break;
            }
        }
        return best.map(|(_, _, pairs)| pairs).unwrap_or_default();
    }
    // guloso para matrizes maiores
    let mut pairs = Vec::new();
    let mut used_j = vec![false; m];
    loop {
        let mut best_pair: Option<(f64, usize, usize)> = None;
        for (i, row) in cost.iter().enumerate() {
            if pairs.iter().any(|(pi, _)| *pi == i) {
                continue;
            }
            for (j, c) in row.iter().enumerate() {
                if used_j[j] || *c >= threshold {
                    continue;
                }
                if best_pair.is_none_or(|(bc, _, _)| *c < bc) {
                    best_pair = Some((*c, i, j));
                }
            }
        }
        match best_pair {
            Some((_, i, j)) => {
                used_j[j] = true;
                pairs.push((i, j));
            }
            None => break,
        }
    }
    pairs
}

fn next_permutation(items: &mut [usize]) -> bool {
    let n = items.len();
    let mut i = n as isize - 2;
    while i >= 0 && items[i as usize] >= items[i as usize + 1] {
        i -= 1;
    }
    if i < 0 {
        return false;
    }
    let i = i as usize;
    let mut j = n - 1;
    while items[j] <= items[i] {
        j -= 1;
    }
    items.swap(i, j);
    items[i + 1..].reverse();
    true
}

impl ByteLike {
    /** Um frame: detecções altas/baixas → trilhas atualizadas. */
    pub fn update(&mut self, detections: &[Detection], frame: usize, t: f64) {
        let high: Vec<Detection> = detections
            .iter()
            .copied()
            .filter(|d| d.score >= HIGH_SCORE)
            .collect();
        let low: Vec<Detection> = detections
            .iter()
            .copied()
            .filter(|d| d.score < HIGH_SCORE && d.score >= LOW_SCORE)
            .collect();
        // Estágio 1: altas × (ativas + perdidas), custo IoU com leve fusão de score
        let pool: Vec<&mut Internal> = self.tracks.iter_mut().collect();
        let mut cost: Vec<Vec<f64>> = Vec::with_capacity(pool.len());
        for track in &pool {
            cost.push(
                high.iter()
                    .map(|d| iou_cost(&track.last, d) - d.score * 0.05)
                    .collect(),
            );
        }
        let matches = assign(&cost, 1.0 - MATCH_IOU);
        let mut matched_tracks = vec![false; pool.len()];
        let mut matched_dets = vec![false; high.len()];
        for (i, j) in &matches {
            matched_tracks[*i] = true;
            matched_dets[*j] = true;
            let track = &mut self.tracks[*i];
            track.hits += 1;
            track.lost_for = 0;
            track.age += 1;
            let (cx, cy) = high[*j].center();
            track.points.push(TrackPoint {
                frame,
                t,
                cx,
                cy,
                area: high[*j].area(),
                occluded: false,
                confidence: high[*j].score,
            });
            track.last = high[*j];
        }
        // Estágio 2: trilhas ATIVAS restantes × baixas (resgate de oclusão)
        let low_cost: Vec<Vec<f64>> = matched_tracks
            .iter()
            .enumerate()
            .filter(|(i, m)| !**m && !self.tracks[*i].lost())
            .map(|(i, _)| {
                low.iter()
                    .map(|d| iou_cost(&self.tracks[i].last, d))
                    .collect()
            })
            .collect();
        let active_unmatched: Vec<usize> = matched_tracks
            .iter()
            .enumerate()
            .filter(|(i, m)| !**m && !self.tracks[*i].lost())
            .map(|(i, _)| i)
            .collect();
        let second = assign(&low_cost, 1.0 - SECOND_IOU);
        let mut second_matched = vec![false; low.len()];
        for (i, j) in &second {
            let track_index = active_unmatched[*i];
            matched_tracks[track_index] = true;
            second_matched[*j] = true;
            let track = &mut self.tracks[track_index];
            track.hits += 1;
            track.lost_for = 0;
            track.age += 1;
            let (cx, cy) = low[*j].center();
            track.points.push(TrackPoint {
                frame,
                t,
                cx,
                cy,
                area: low[*j].area(),
                occluded: false,
                confidence: low[*j].score,
            });
            track.last = low[*j];
        }
        // Não associadas: oclusão (projeta última posição) ou remoção por buffer
        for index in 0..self.tracks.len() {
            if matched_tracks[index] {
                continue;
            }
            let track = &mut self.tracks[index];
            track.lost_for += 1;
            if track.lost_for > MAX_LOST_FRAMES {
                continue;
            }
            let last = *track.points.last().expect("trilha com pontos");
            track.points.push(TrackPoint {
                frame,
                t,
                cx: last.cx,
                cy: last.cy,
                area: last.area,
                occluded: true,
                confidence: 0.0,
            });
        }
        let mut index = 0;
        while index < self.tracks.len() {
            if self.tracks[index].lost_for > MAX_LOST_FRAMES {
                let done = self.tracks.remove(index);
                if done.hits >= MIN_HITS {
                    self.archived.push(Track {
                        id: done.id,
                        points: done.points,
                        reset_by_scene: done.reset_by_scene,
                    });
                }
            } else {
                index += 1;
            }
        }
        // Novas trilhas (confirmação por MIN_HITS vem no finish; aqui semeia)
        for (j, det) in high.iter().enumerate() {
            if matched_dets[j] {
                continue;
            }
            let (cx, cy) = det.center();
            self.tracks.push(Internal {
                id: self.next_id,
                last: *det,
                hits: 1,
                age: 1,
                lost_for: 0,
                points: vec![TrackPoint {
                    frame,
                    t,
                    cx,
                    cy,
                    area: det.area(),
                    occluded: false,
                    confidence: det.score,
                }],
                reset_by_scene: false,
            });
            self.next_id += 1;
        }
    }

    /** Mudança de cena: encerra e ARQUIVA trilhas confirmadas (a trajetória
     *  do plano anterior permanece como evidência; o novo plano começa com
     *  IDs novos — reinício SEM salto indevido entre planos). */
    pub fn scene_reset(&mut self) {
        let mut kept = Vec::new();
        for mut track in self.tracks.drain(..) {
            track.reset_by_scene = true;
            if track.hits >= MIN_HITS {
                self.archived.push(Track {
                    id: track.id,
                    points: track.points,
                    reset_by_scene: true,
                });
            } else {
                track.lost_for = MAX_LOST_FRAMES + 1;
                kept.push(track);
            }
        }
        self.tracks = kept;
    }

    /** Trilhas confirmadas (hits ≥ MIN_HITS) — ativas + arquivadas por
     *  corte/oclusão — ordenadas por duração (desempate: variância). */
    pub fn finish(mut self) -> Vec<Track> {
        let mut archived = std::mem::take(&mut self.archived);
        let mut tracks: Vec<Track> = self
            .tracks
            .into_iter()
            .filter(|track| track.hits >= MIN_HITS)
            .map(|internal| Track {
                id: internal.id,
                points: internal.points,
                reset_by_scene: internal.reset_by_scene,
            })
            .collect();
        tracks.append(&mut archived);
        tracks.sort_by(|a, b| {
            b.points.len().cmp(&a.points.len()).then(
                b.motion_variance()
                    .partial_cmp(&a.motion_variance())
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
        });
        tracks
    }
}

impl Internal {
    fn lost(&self) -> bool {
        self.lost_for > 0
    }
}

/** Detecção por diferença de frames (luma): componentes conexos do
 *  movimento com área mínima; score = fração de área do frame. */
pub fn motion_detections(
    prev: &[u8],
    curr: &[u8],
    width: usize,
    height: usize,
) -> (Vec<Detection>, f64) {
    let mut mask = vec![false; width * height];
    let mut changed = 0usize;
    for i in 0..width * height {
        let p = prev[i * 3] as i32 + prev[i * 3 + 1] as i32 + prev[i * 3 + 2] as i32;
        let c = curr[i * 3] as i32 + curr[i * 3 + 1] as i32 + curr[i * 3 + 2] as i32;
        if (p - c).abs() > 90 {
            mask[i] = true;
            changed += 1;
        }
    }
    let mean_change = changed as f64 / (width * height) as f64;
    if mean_change > 0.45 {
        // mudança de cena: sem detecções (o chamador faz scene_reset)
        return (Vec::new(), mean_change);
    }
    let min_area = (width * height) / 333; // 0,3% do frame
    let full_area = (width * height) as f64 * 0.05; // 5% do frame = score 1.0
    let mut visited = vec![false; width * height];
    let mut detections = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..width * height {
        if !mask[start] || visited[start] {
            continue;
        }
        stack.clear();
        stack.push(start);
        visited[start] = true;
        let (mut x1, mut y1, mut x2, mut y2, mut area) = (width, height, 0, 0, 0usize);
        while let Some(index) = stack.pop() {
            let (x, y) = (index % width, index / width);
            x1 = x1.min(x);
            y1 = y1.min(y);
            x2 = x2.max(x + 1);
            y2 = y2.max(y + 1);
            area += 1;
            if x > 0 && mask[index - 1] && !visited[index - 1] {
                visited[index - 1] = true;
                stack.push(index - 1);
            }
            if x + 1 < width && mask[index + 1] && !visited[index + 1] {
                visited[index + 1] = true;
                stack.push(index + 1);
            }
            if y > 0 && mask[index - width] && !visited[index - width] {
                visited[index - width] = true;
                stack.push(index - width);
            }
            if y + 1 < height && mask[index + width] && !visited[index + width] {
                visited[index + width] = true;
                stack.push(index + width);
            }
        }
        if area >= min_area {
            detections.push(Detection {
                x1: x1 as f64 / width as f64,
                y1: y1 as f64 / height as f64,
                x2: x2 as f64 / width as f64,
                y2: y2 as f64 / height as f64,
                score: (area as f64 / full_area).clamp(0.0, 1.0),
            });
        }
    }
    (detections, mean_change)
}

/** Trilhas de movimento a partir de frames RGB amostrados.
 *
 * Detector = DIFERENÇA CONTRA O FUNDO (câmera estática — premissa declarada
 * do MVP; diferença entre frames consecutivos só expõe as bordas do objeto
 * em movimento). Mudança de cena (corte) reinicia as trilhas E rebate o
 * modelo de fundo para o frame atual (sem trilha fantasma pós-corte).
 * Objetos parados geram blobs estáticos: quem consome escolhe a trilha por
 * VARIÂNCIA de movimento, não só por duração. */
pub fn motion_tracks(frames: &[(f64, Vec<u8>)], width: usize, height: usize) -> Vec<Track> {
    let mut tracker = ByteLike::default();
    if frames.is_empty() {
        return tracker.finish();
    }
    let mut background = frames[0].1.clone();
    for (index, (t, current)) in frames.iter().enumerate() {
        if index == 0 {
            continue;
        }
        let (detections, mean_change) = motion_detections(&background, current, width, height);
        if mean_change > 0.45 {
            tracker.scene_reset();
            background = current.clone();
            continue;
        }
        tracker.update(&detections, index, *t);
    }
    tracker.finish()
}

/** Caso controlado de OBJETO por cor: alvo selecionado pela COR dominante
 *  amostrada no primeiro frame (categoria declarada pelo chamador). Centróide
 *  do pixel mais próximo da cor alvo dentro do raio da última posição;
 *  fora do raio = oclusão (projeta última posição conhecida). */
#[cfg(test)]
pub fn color_track(
    frames: &[(f64, Vec<u8>)],
    width: usize,
    height: usize,
    target: [u8; 3],
    tolerance: u16,
) -> Track {
    let mut points = Vec::with_capacity(frames.len());
    let mut last = (0.5f64, 0.5f64);
    let radius = 0.25f64;
    for (index, (t, data)) in frames.iter().enumerate() {
        let mut best: Option<(u32, f64, f64)> = None; // (dist², cx, cy)
        for y in (0..height).step_by(2) {
            for x in (0..width).step_by(2) {
                let i = (y * width + x) * 3;
                let dist = (data[i] as i32 - target[0] as i32).pow(2) as u32
                    + (data[i + 1] as i32 - target[1] as i32).pow(2) as u32
                    + (data[i + 2] as i32 - target[2] as i32).pow(2) as u32;
                if dist > tolerance as u32 * tolerance as u32 {
                    continue;
                }
                let (cx, cy) = (x as f64 / width as f64, y as f64 / height as f64);
                if best.is_none_or(|(bd, _, _)| dist < bd) {
                    best = Some((dist, cx, cy));
                }
            }
        }
        match best {
            Some((_, cx, cy))
                if ((cx - last.0).powi(2) + (cy - last.1).powi(2)).sqrt() <= radius =>
            {
                last = (cx, cy);
                points.push(TrackPoint {
                    frame: index,
                    t: *t,
                    cx,
                    cy,
                    area: 0.01,
                    occluded: false,
                    confidence: 1.0,
                });
            }
            Some((_, cx, cy)) if points.is_empty() => {
                // primeiro ponto: aceita qualquer posição
                last = (cx, cy);
                points.push(TrackPoint {
                    frame: index,
                    t: *t,
                    cx,
                    cy,
                    area: 0.01,
                    occluded: false,
                    confidence: 1.0,
                });
            }
            _ => {
                let previous = *points.last().expect("primeiro ponto garantido acima");
                points.push(TrackPoint {
                    frame: index,
                    t: *t,
                    cx: previous.cx,
                    cy: previous.cy,
                    area: 0.01,
                    occluded: true,
                    confidence: 0.0,
                });
            }
        }
    }
    Track {
        id: 1,
        points,
        reset_by_scene: false,
    }
}

/** Cor alvo de uma região do primeiro frame (seleção do alvo controlado):
 *  semente = pixel de MAIOR saturação da região (fundo neutro tem saturação
 *  ~0); resultado = média dos pixels próximos da semente. */
#[cfg(test)]
pub fn dominant_color(
    data: &[u8],
    width: usize,
    height: usize,
    region: (f64, f64, f64, f64),
) -> [u8; 3] {
    let (x1, y1, x2, y2) = (
        (region.0 * width as f64) as usize,
        (region.1 * height as f64) as usize,
        (region.2 * width as f64) as usize,
        (region.3 * height as f64) as usize,
    );
    let mut seed: Option<(i32, [u8; 3])> = None; // (saturação, cor)
    for y in y1.max(0)..y2.min(height) {
        for x in x1.max(0)..x2.min(width) {
            let i = (y * width + x) * 3;
            let color = [data[i], data[i + 1], data[i + 2]];
            let maxc = color.iter().max().copied().unwrap_or(0) as i32;
            let minc = color.iter().min().copied().unwrap_or(255) as i32;
            let saturation = maxc - minc;
            if seed.is_none_or(|(s, _)| saturation > s) {
                seed = Some((saturation, color));
            }
        }
    }
    let seed_color = match seed {
        Some((_, c)) => c,
        None => [128, 128, 128],
    };
    let mut sum = [0u64; 3];
    let mut count = 0u64;
    for y in y1.max(0)..y2.min(height) {
        for x in x1.max(0)..x2.min(width) {
            let i = (y * width + x) * 3;
            let dist = (data[i] as i32 - seed_color[0] as i32).abs()
                + (data[i + 1] as i32 - seed_color[1] as i32).abs()
                + (data[i + 2] as i32 - seed_color[2] as i32).abs();
            if dist < 90 {
                sum[0] += data[i] as u64;
                sum[1] += data[i + 1] as u64;
                sum[2] += data[i + 2] as u64;
                count += 1;
            }
        }
    }
    if count == 0 {
        return seed_color;
    }
    [
        (sum[0] / count) as u8,
        (sum[1] / count) as u8,
        (sum[2] / count) as u8,
    ]
}

/** Decodifica frames RGB pequenos da janela (amostragem em fps baixo).
 *  Saída: (t relativo à mídia, pixels RGB24). */
pub fn decode_frames(
    ffmpeg: &Path,
    source: &Path,
    start: f64,
    end: f64,
    fps: f64,
    control: &ProcessControl,
) -> Result<(usize, usize, Vec<(f64, Vec<u8>)>), String> {
    if end - start < 0.2 {
        return Err("janela muito curta para tracking".into());
    }
    let width = 256usize;
    let mut command = Command::new(ffmpeg);
    command
        .args(["-nostdin", "-hide_banner", "-loglevel", "error"])
        .args(["-ss", &start.to_string(), "-t", &(end - start).to_string()])
        .arg("-i")
        .arg(source)
        .args(["-vf", &format!("scale={width}:-2,fps={fps}")])
        .args(["-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|e| format!("falha ao decodificar janela: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("stdout indisponível")?;
    let mut all = Vec::new();
    use std::io::Read;
    let mut buffer = [0u8; 65536];
    loop {
        control.check()?;
        match stdout.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => all.extend_from_slice(&buffer[..n]),
            Err(e) => {
                let _ = child.kill();
                return Err(format!("leitura de frames: {e}"));
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("falha ao decodificar janela".into());
    }
    // altura derivada do tamanho lido (largura fixa, pares)
    let frame_size_hint = width * 144 * 3; // 16:9 aproximação p/ descobrir altura
    let _ = frame_size_hint;
    // altura real: assume AR da janela via 2º frame — usa proporção do
    // primeiro bloco completo: tentativa e erro com divisores comuns
    for height in [144usize, 160, 128, 192, 240, 108, 256] {
        let size = width * height * 3;
        if size > 0 && all.len() % size == 0 && all.len() / size >= 2 {
            let count = all.len() / size;
            let step = (end - start) / count as f64;
            let frames = all
                .chunks(size)
                .enumerate()
                .map(|(i, chunk)| (start + i as f64 * step, chunk.to_vec()))
                .collect();
            return Ok((width, height, frames));
        }
    }
    Err("formato de frames inesperado".into())
}
