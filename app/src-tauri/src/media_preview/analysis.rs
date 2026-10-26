#[cfg(test)]
pub fn peaks(pcm: &[u8], bins: usize) -> Vec<f32> {
    let count = pcm.len() / 2;
    if count == 0 || bins == 0 {
        return vec![];
    }
    let mut result = vec![0.0f32; bins.min(count)];
    let length = result.len();
    for (index, sample) in pcm.chunks_exact(2).enumerate() {
        let value = i16::from_le_bytes([sample[0], sample[1]]) as f32 / 32768.0;
        let bin = (index * length / count).min(length - 1);
        result[bin] = result[bin].max(value.abs());
    }
    result
}

pub fn peaks_reader(
    mut reader: impl std::io::Read,
    bytes: u64,
    bins: usize,
) -> Result<Vec<f32>, String> {
    let count = bytes / 2;
    if count == 0 || bins == 0 {
        return Ok(vec![]);
    }
    let mut result = vec![0.0f32; bins.min(300_000).min(count as usize)];
    let mut buffer = [0u8; 65536];
    let mut index = 0u64;
    while index < count {
        let take = ((count - index).min((buffer.len() / 2) as u64) * 2) as usize;
        reader
            .read_exact(&mut buffer[..take])
            .map_err(|error| format!("Não foi possível ler a forma de onda: {error}"))?;
        for sample in buffer[..take].chunks_exact(2) {
            let value = i16::from_le_bytes([sample[0], sample[1]]) as f32 / 32768.0;
            let bin = ((index as u128 * result.len() as u128) / count as u128) as usize;
            result[bin] = result[bin].max(value.abs());
            index += 1;
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn streaming_peaks_match_amplitudes_and_detect_truncated_input() {
        let pcm: Vec<u8> = [0i16, 16384, -32768, 0]
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        let result = peaks_reader(std::io::Cursor::new(&pcm), pcm.len() as u64, 2).unwrap();
        assert_eq!(result, vec![0.5, 1.0]);
        assert!(peaks_reader(std::io::Cursor::new(&pcm), 100, 2).is_err());
    }
    #[test]
    fn waveform_uses_actual_pcm_amplitude_and_silence_stays_zero() {
        assert_eq!(peaks(&[0, 0, 0, 0], 2), vec![0.0, 0.0]);
        let pcm: Vec<u8> = [0i16, 16384, -32768, 0]
            .iter()
            .flat_map(|s| s.to_le_bytes())
            .collect();
        assert_eq!(peaks(&pcm, 2), vec![0.5, 1.0]);
        assert!(peaks(&[], 2).is_empty());
    }
}
