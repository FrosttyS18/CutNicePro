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

#[cfg(test)]
mod tests {
    use super::*;
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
