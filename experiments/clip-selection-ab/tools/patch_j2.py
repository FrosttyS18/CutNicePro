import io
p = r'C:\CutNicePro\app\src-tauri\src\clips\selection.rs'
s = io.open(p, encoding='utf-8').read()

marker = "    #[test]\n    fn falha_da_avaliacao_exclui_pendentes_sem_falso_sucesso() {"
tests = '''    /// Regressão do defeito de associação (contraprova do mantenedor,
    /// commit bc8a198): E{n} deve permanecer vinculado ao n-ésimo pendente
    /// ORIGINAL mesmo após notas serem aplicadas. No código antigo, o
    /// filtro dinâmico por valid_score deslocava os alvos (E2=90 caía no
    /// terceiro pendente e o terceiro ficava sem avaliação).
    fn run_associacao(respostas: Vec<(String, u8, String)>) -> Vec<Clip> {
        let segments = speech_from(60);
        let options = options(3, 15.0, 90.0);
        // três propostas CURTAS e disjuntas -> três alternativas disjuntas
        // [first, ~min] = pendentes E1..E3 na ordem
        let proposals = vec![(
            0..30,
            vec![candidate(1, 2, 70), candidate(10, 11, 71), candidate(20, 21, 72)],
        )];
        let evaluate = move |_pending: &[Clip], _segs: &[Segment]| {
            Ok(respostas.clone())
        };
        resolve(&proposals, &segments, "media", 240.0, &options, &evaluate)
            .expect("seleção")
    }

    fn assert_associacao(chosen: &[Clip], esperado: &[(&str, u8)]) {
        assert_eq!(chosen.len(), esperado.len(), "quantidade de escolhidos");
        for (clip, (rotulo, nota)) in chosen.iter().zip(esperado) {
            let razao = clip
                .reasons
                .iter()
                .find(|r| r.contains("Avaliação do intervalo efetivo"))
                .expect("razão da avaliação presente");
            assert!(
                razao.contains(rotulo),
                "razão {razao} deveria citar {rotulo} (clip {}/{})",
                clip.start, clip.end
            );
            assert_eq!(
                clip.score, *nota,
                "nota do clip com razão {rotulo} deve ser {nota} (conteúdo [{}, {}])",
                clip.start, clip.end
            );
        }
    }

    #[test]
    fn associacao_normal_e1_10_e2_90_e3_20() {
        // ordem NORMAL — exatamente o caso da contraprova (falhava em bc8a198)
        let chosen = run_associacao(vec![
            ("E1".into(), 10, "raz-E1".into()),
            ("E2".into(), 90, "raz-E2".into()),
            ("E3".into(), 20, "raz-E3".into()),
        ]);
        // escolhidos ordenados por nota: E2(90), E1(10), E3(20)
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E1", 10), ("raz-E3", 20)]);
    }

    #[test]
    fn associacao_ordem_inversa_e_permutada() {
        let chosen = run_associacao(vec![
            ("E3".into(), 20, "raz-E3".into()),
            ("E2".into(), 90, "raz-E2".into()),
            ("E1".into(), 10, "raz-E1".into()),
        ]);
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E1", 10), ("raz-E3", 20)]);
        let chosen = run_associacao(vec![
            ("E2".into(), 90, "raz-E2".into()),
            ("E3".into(), 20, "raz-E3".into()),
            ("E1".into(), 10, "raz-E1".into()),
        ]);
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E1", 10), ("raz-E3", 20)]);
    }

    #[test]
    fn associacao_com_conforme_intercalado_nao_desloca_ids() {
        let segments = speech_from(60);
        let options = options(4, 15.0, 90.0);
        // conforme ENTRE as curtas: nota própria, NÃO ocupa E-id
        let proposals = vec![(
            0..30,
            vec![candidate(1, 2, 70), candidate(4, 8, 81), candidate(10, 11, 71)],
        )];
        let evaluate = |_pending: &[Clip], _segs: &[Segment]| {
            Ok(vec![
                ("E1".into(), 10, "raz-E1".into()),
                ("E2".into(), 90, "raz-E2".into()),
            ])
        };
        let chosen =
            resolve(&proposals, &segments, "media", 240.0, &options, &evaluate).unwrap();
        // disputa: conforme 81, E2=90, E1=10 -> top3 = E2, conforme, E1
        assert_associacao(&chosen[..1], &[("raz-E2", 90)]);
        assert!(
            chosen
                .iter()
                .any(|c| c.score == 81 && c.reasons.iter().all(|r| !r.contains("raz-")))
        );
    }

    #[test]
    fn respostas_duplicada_ausente_e_desconhecida() {
        // duplicada: a PRIMEIRA aplica (10); ausente: E3 fora da disputa;
        // desconhecida (E99): ignorada sem pânico
        let chosen = run_associacao(vec![
            ("E1".into(), 10, "raz-E1".into()),
            ("E1".into(), 99, "raz-E1-dup".into()),
            ("E99".into(), 50, "raz-E99".into()),
            ("E2".into(), 90, "raz-E2".into()),
        ]);
        // disputam E1=10 e E2=90 (E3 sem avaliação fica fora)
        assert_eq!(chosen.len(), 2);
        assert_associacao(&chosen, &[("raz-E2", 90), ("raz-E1", 10)]);
        assert!(!chosen
            .iter()
            .any(|c| c.reasons.iter().any(|r| r.contains("dup"))));
    }

'''
assert marker in s
s = s.replace(marker, tests + marker, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('testes de associação adicionados')
