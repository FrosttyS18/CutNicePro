use super::*;
use crate::transcription::types::Transcript;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    time::{Duration, Instant},
};

const FROZEN: &str = "simple-completion-verdict-control/prepared-535cfb780caa42039cb1ddc269d538b6";
const SYSTEM: &str = include_str!("evaluate-prompt.txt");

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    fixture: String,
    first: usize,
    last: usize,
    expected_complete: bool,
    #[serde(default)]
    start_at: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Artifact {
    path: PathBuf,
    sha256: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    scope: String,
    prompt: PathBuf,
    schema: PathBuf,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreparedCase {
    case: Case,
    start: f64,
    end: f64,
    native_source: String,
    binary_source: String,
    source_changed_from_binary: bool,
    quotes: Vec<String>,
    inputs: Vec<Input>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    version: u8,
    runtime: PathBuf,
    model: PathBuf,
    cases: Vec<PreparedCase>,
    artifacts: Vec<Artifact>,
}

fn workspace() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn lab() -> PathBuf {
    workspace()
        .join(".tooling/test-output/goal-story-coverage-2026-10-25")
        .canonicalize()
        .unwrap()
}

fn within(path: &Path, root: &Path) -> PathBuf {
    let path = path.canonicalize().unwrap();
    assert!(
        path.starts_with(root),
        "audit path outside its allowed directory"
    );
    path
}

fn artifact(path: &Path) -> Artifact {
    let mut file = fs::File::open(path).unwrap();
    let mut hash = Sha256::new();
    std::io::copy(&mut file, &mut hash).unwrap();
    Artifact {
        path: path.to_owned(),
        sha256: format!("{:x}", hash.finalize()),
    }
}

fn save_new(path: &Path, bytes: &[u8]) {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .unwrap();
    file.write_all(bytes).unwrap();
    file.sync_all().unwrap();
    assert_eq!(fs::read(path).unwrap(), bytes);
}

fn save_json(path: &Path, value: &impl Serialize) {
    save_new(path, &serde_json::to_vec_pretty(value).unwrap());
}

fn clip(case: &Case, speech: &[Segment]) -> Clip {
    assert!(case.first <= case.last && case.last < speech.len());
    let start = speech[case.first].start;
    let end = speech[case.last].end;
    serde_json::from_value(json!({"id":super::super::types::identity("context-audit",start,end,None),"start":start,"end":end,"title":"Caso de auditoria","score":0,"reasons":[],"review":"pending"})).unwrap()
}

fn data(clip: &Clip, speech: &[Segment], quotes: &[String], isolated: bool) -> Value {
    let mut value = json!({"start":clip.start,"end":clip.end,
        "quotes":quotes.iter().enumerate().map(|(id,text)|json!({"id":id,"text":text})).collect::<Vec<_>>()});
    if isolated {
        value["contextAvailability"] = json!("Contexto externo não fornecido neste braço. Somente as falas de quotes estão incluídas no intervalo.");
    } else {
        value["speech"] = json!(speech
            .iter()
            .map(|segment| segment.text.as_str())
            .collect::<Vec<_>>()
            .join("\n"));
    }
    value
}

fn normalized(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn native_context_schema_preserves_the_logged_schema_bytes_and_required_order() {
    let logged = include_str!("assessment_context_schema_snapshot.json").trim();
    assert_eq!(serde_json::to_string(&schema(3)).unwrap(), logged);
    for count in [1, 3, 18] {
        let value = schema(count);
        assert_eq!(
            value["required"],
            json!([
                "openingStatus",
                "endingStatus",
                "nature",
                "advertising",
                "analysis"
            ])
        );
        assert_eq!(
            value["properties"]["analysis"]["properties"]["closing"]["properties"]["evidenceId"]
                ["enum"],
            json!([count - 1])
        );
    }
}

#[test]
fn native_context_inputs_keep_the_same_quotes_and_system_in_both_scopes() {
    let speech = vec![Segment {
        id: "s".into(),
        start: 0.0,
        end: 20.0,
        text: "Comprei um jogo e perdi o salvamento. Precisei começar tudo de novo.".into(),
        words: vec![],
    }];
    let case = Case {
        id: "case".into(),
        fixture: "fixture".into(),
        first: 0,
        last: 0,
        expected_complete: true,
        start_at: None,
    };
    let clip = clip(&case, &speech);
    let quotes = evidence::quotes(&super::super::semantic::source(&clip, &speech));
    let full = data(&clip, &speech, &quotes, false);
    let isolated = data(&clip, &speech, &quotes, true);
    assert_eq!(full["quotes"], isolated["quotes"]);
    assert!(full["speech"].is_string() && isolated.get("speech").is_none());
    let engine = Engine::for_test();
    let full_prompt = engine.prompt(SYSTEM, &full).unwrap();
    let isolated_prompt = engine.prompt(SYSTEM, &isolated).unwrap();
    assert_eq!(
        full_prompt.split("<|im_start|>user").next(),
        isolated_prompt.split("<|im_start|>user").next()
    );
    assert!(full_prompt.contains("TRANSCRIÇÃO COMPLETA — speech:"));
    assert!(!isolated_prompt.contains("TRANSCRIÇÃO COMPLETA — speech:"));
    assert!(isolated_prompt.contains("Contexto externo não fornecido"));
}

#[test]
#[ignore = "CPU-only preparation of the native full-assessment comparison; no model calls"]
fn prepare_native_full_assessment_context_comparison_without_model_calls() {
    let lab = lab();
    let frozen = within(&lab.join(FROZEN), &lab);
    let source = workspace()
        .join(
            ".tooling/test-output/pipelines-comparados-2026-10-24/corpus/davyjones-transcript.json",
        )
        .canonicalize()
        .unwrap();
    let transcript: Transcript = serde_json::from_slice(&fs::read(&source).unwrap()).unwrap();
    assert_eq!(transcript.segments.len(), 334);
    crate::transcription::parser::validate(&transcript.segments, 599.098).unwrap();
    let runtime = within(
        &workspace().join(".tooling/vendor/llamacpp-b11829-cuda"),
        &workspace(),
    );
    let model = within(
        &workspace()
            .join("experiments/clip-selection-ab/models")
            .join(super::super::engine_tools::MODEL_NAME),
        &workspace(),
    );
    let engine = Engine::for_test_runtime(&runtime, &model).unwrap();
    let directory = lab.join(format!(
        "native-full-assessment-context-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir(&directory).unwrap();
    let mut artifacts = vec![
        artifact(&source),
        artifact(&model),
        artifact(&workspace().join("app/src-tauri/src/clips/evaluate-prompt.txt")),
        artifact(&workspace().join("app/src-tauri/src/clips/assessment.rs")),
        artifact(&workspace().join("app/src-tauri/src/clips/evidence.rs")),
        artifact(&workspace().join("app/src-tauri/src/clips/text_engine.rs")),
    ];
    for name in [
        "llama-completion.exe",
        "llama-completion-impl.dll",
        "llama-tokenize.exe",
        "llama-common.dll",
        "llama.dll",
        "ggml-cuda.dll",
    ] {
        artifacts.push(artifact(&runtime.join(name)));
    }
    let mut cases = Vec::new();
    for index in 0..9 {
        let input_case = frozen.join(format!("case-{index:02}/case.json"));
        let case: Case = serde_json::from_slice(&fs::read(&input_case).unwrap()).unwrap();
        assert_eq!(case.id, format!("case-{index:02}"));
        artifacts.push(artifact(&input_case));
        let clip = clip(&case, &transcript.segments);
        let native_source = super::super::semantic::source(&clip, &transcript.segments);
        let quotes = evidence::quotes(&native_source);
        assert!(!quotes.is_empty());
        let mut parts = transcript.segments[case.first..=case.last]
            .iter()
            .map(|segment| segment.text.clone())
            .collect::<Vec<_>>();
        if let Some(start) = &case.start_at {
            let offset = parts[0]
                .find(start)
                .expect("frozen binary opening is in its source segment");
            parts[0] = parts[0][offset..].into();
        }
        let binary_source = parts.join("\n");
        let mut inputs = Vec::new();
        let case_directory = directory.join(&case.id);
        fs::create_dir(&case_directory).unwrap();
        let schema_bytes = serde_json::to_vec(&schema(quotes.len())).unwrap();
        for (scope, isolated) in [("full", false), ("isolated", true)] {
            let input_directory = case_directory.join(scope);
            fs::create_dir(&input_directory).unwrap();
            let prompt = input_directory.join("prompt.txt");
            let schema_path = input_directory.join("schema.json");
            let prompt_text = engine
                .prompt(
                    SYSTEM,
                    &data(&clip, &transcript.segments, &quotes, isolated),
                )
                .unwrap();
            save_new(&prompt, prompt_text.as_bytes());
            save_new(&schema_path, &schema_bytes);
            artifacts.extend([artifact(&prompt), artifact(&schema_path)]);
            inputs.push(Input {
                scope: scope.into(),
                prompt,
                schema: schema_path,
            });
        }
        cases.push(PreparedCase {
            source_changed_from_binary: normalized(&native_source) != normalized(&binary_source),
            case,
            start: clip.start,
            end: clip.end,
            native_source,
            binary_source,
            quotes,
            inputs,
        });
    }
    assert_eq!(
        cases
            .iter()
            .filter(|case| case.case.expected_complete)
            .count(),
        6
    );
    let plan = Plan {
        version: 1,
        runtime,
        model,
        cases,
        artifacts,
    };
    save_json(&directory.join("plan.json"), &plan);
    let metadata = json!({"status":"PREPARED_NATIVE_INPUTS_ONLY_PENDING_REVIEW","nativePreparation":true,"modelCalls":0,"tokenizerCalls":0,"publications":0,"maximumModelCalls":18,"automaticRetries":0,"cpuFallback":false,"contextTokens":32768,"outputTokens":1600,"temperature":0.7,"seed":42,"perCallTimeoutSeconds":90,"totalBudgetSeconds":900,"system":"Exact production evaluate-prompt.txt via actual Engine.prompt; no text edits.","schema":"Actual extracted assessment::schema and evidence::schema; outer flags-first order preserved.","isolatedDataChange":"Omit global speech and add contextAvailability declaration; no explicit next utterance in either native scope.","caseBounds":"Real Segment[first].start through Segment[last].end; semantic::source is used unchanged. startAt in the binary fixture is reported rather than applied to native bounds.","differencesFromBinary":plan.cases.iter().map(|case|json!({"id":case.case.id,"start":case.start,"end":case.end,"sourceChanged":case.source_changed_from_binary,"quoteCount":case.quotes.len()})).collect::<Vec<_>>(),"judgment":"Raw output and native ground are separate. No automatic editorial PASS or publication; expectedComplete is audit metadata only.","execution":"Explicit opt-in test requires CNP_ASSESSMENT_CONTEXT_PLAN pointing at plan.json and CNP_ASSESSMENT_CONTEXT_EXECUTE=18 after root review/GPU release."});
    save_json(&directory.join("preparation.json"), &metadata);
    let reread: Plan =
        serde_json::from_slice(&fs::read(directory.join("plan.json")).unwrap()).unwrap();
    assert_eq!(reread.cases.len(), 9);
    println!(
        "native-context-plan={}",
        directory.join("plan.json").display()
    );
}

fn grounded_record(output: &str, case: &PreparedCase) -> Value {
    let raw = serde_json::Deserializer::from_str(output.trim())
        .into_iter::<Value>()
        .next()
        .ok_or_else(|| "empty raw output".to_string())
        .and_then(|value| value.map_err(|error| error.to_string()));
    let draft = serde_json::Deserializer::from_str(output.trim())
        .into_iter::<Draft>()
        .next()
        .ok_or_else(|| "empty draft output".to_string())
        .and_then(|value| value.map_err(|error| error.to_string()));
    match (raw, draft) {
        (Ok(raw), Ok(draft)) => match ground(
            draft,
            case.case.id.clone(),
            &case.quotes,
            &case.native_source,
        ) {
            Ok(value) => {
                json!({"raw":raw,"grounded":{"score":value.score,"standalone":value.standalone,"complete":value.complete,"advertising":value.advertising,"reason":value.reason,"analysis":value.analysis},"fidelityStatus":"PENDING_TEXT_REVIEW"})
            }
            Err(error) => {
                json!({"raw":raw,"groundError":error,"fidelityStatus":"PENDING_TEXT_REVIEW"})
            }
        },
        (raw, draft) => {
            json!({"rawParseError":raw.err().map(|error|error.to_string()),"draftParseError":draft.err().map(|error|error.to_string()),"fidelityStatus":"PENDING_TEXT_REVIEW"})
        }
    }
}

fn generate_once(
    engine: &Engine,
    scratch: &Path,
    prompt: &str,
    schema: &Value,
) -> Result<String, String> {
    let control = ProcessControl::default();
    std::thread::scope(|scope| {
        let (done, wait) = std::sync::mpsc::channel();
        let control_ref = &control;
        scope.spawn(move || {
            if wait.recv_timeout(Duration::from_secs(90))
                == Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            {
                control_ref.cancel();
            }
        });
        let result = engine.generate(scratch, "assessment", prompt, schema, 1600, &control);
        let _ = done.send(());
        result
    })
}

#[test]
#[ignore = "Executes18 real native assessments only after explicit plan review; no publication"]
fn run_prepared_native_full_assessment_context_comparison() {
    assert_eq!(
        std::env::var("CNP_ASSESSMENT_CONTEXT_EXECUTE").as_deref(),
        Ok("18")
    );
    let plan_path = within(
        &PathBuf::from(std::env::var_os("CNP_ASSESSMENT_CONTEXT_PLAN").unwrap()),
        &lab(),
    );
    let plan: Plan = serde_json::from_slice(&fs::read(&plan_path).unwrap()).unwrap();
    assert_eq!(plan.version, 1);
    assert_eq!(plan.cases.len(), 9);
    for expected in &plan.artifacts {
        within(&expected.path, &workspace());
        assert_eq!(
            artifact(&expected.path).sha256,
            expected.sha256,
            "prepared artifact changed: {}",
            expected.path.display()
        );
    }
    let engine = Engine::for_test_runtime(&plan.runtime, &plan.model).unwrap();
    let output = plan_path.parent().unwrap().join("execution");
    fs::create_dir(&output).unwrap();
    let started = Instant::now();
    let mut results = Vec::new();
    for case in &plan.cases {
        assert_eq!(case.inputs.len(), 2);
        assert_eq!(
            case.inputs
                .iter()
                .map(|input| input.scope.as_str())
                .collect::<Vec<_>>(),
            ["full", "isolated"]
        );
        for input in &case.inputs {
            if started.elapsed() > Duration::from_secs(900) {
                break;
            }
            assert!(matches!(input.scope.as_str(), "full" | "isolated"));
            let prompt_path = within(&input.prompt, plan_path.parent().unwrap());
            let schema_path = within(&input.schema, plan_path.parent().unwrap());
            let prompt = fs::read_to_string(prompt_path).unwrap();
            let schema: Value = serde_json::from_slice(&fs::read(schema_path).unwrap()).unwrap();
            let directory = output.join(format!("{}-{}", case.case.id, input.scope));
            fs::create_dir(&directory).unwrap();
            let mut result = json!({"id":case.case.id,"scope":input.scope,"expectedComplete":case.case.expected_complete,"start":case.start,"end":case.end,"source":case.native_source,"quotes":case.quotes,"sourceChangedFromBinary":case.source_changed_from_binary,"fidelityStatus":"PENDING_TEXT_REVIEW"});
            let call_start = Instant::now();
            match engine.count_tokens(&directory, &prompt, &ProcessControl::default()) {
                Ok(count) if count <= super::super::engine_tools::CONTEXT_TOKENS - 1728 => {
                    result["promptTokens"] = json!(count);
                    match generate_once(&engine, &directory, &prompt, &schema) {
                        Ok(raw) => {
                            save_new(&directory.join("raw.txt"), raw.as_bytes());
                            result["assessment"] = grounded_record(&raw, case);
                        }
                        Err(error) => result["executionError"] = json!(error),
                    }
                }
                count => result["contextError"] = json!(format!("{count:?}")),
            }
            result["elapsedSeconds"] = json!(call_start.elapsed().as_secs_f64());
            save_json(&directory.join("result.json"), &result);
            eprintln!("native-context {} {} recorded", case.case.id, input.scope);
            results.push(result);
        }
    }
    save_json(
        &output.join("summary.json"),
        &json!({"status":"RECORDED_PENDING_TEXT_REVIEW","casesRecorded":results.len(),"maximumCalls":18,"elapsedSeconds":started.elapsed().as_secs_f64(),"results":results,"publications":0,"editorialApproval":false}),
    );
    assert_eq!(
        results.len(),
        18,
        "bounded comparison did not record every planned input"
    );
}

#[test]
#[ignore = "CPU-only replay of saved FULL model JSON through native grounding; no Engine or publication"]
fn replay_saved_full_assessments_with_native_grounding_without_model_calls() {
    let allowed = workspace()
        .join(".tooling/test-output")
        .canonicalize()
        .unwrap();
    let plan_path = within(
        &PathBuf::from(
            std::env::var_os("CNP_ASSESSMENT_CONTEXT_PLAN")
                .expect("CNP_ASSESSMENT_CONTEXT_PLAN is required"),
        ),
        &allowed,
    );
    let raw_directory = within(
        &PathBuf::from(
            std::env::var_os("CNP_ASSESSMENT_REPLAY_RAW")
                .expect("CNP_ASSESSMENT_REPLAY_RAW is required"),
        ),
        &allowed,
    );
    let layout =
        std::env::var("CNP_ASSESSMENT_REPLAY_LAYOUT").unwrap_or_else(|_| "external".into());
    assert!(matches!(layout.as_str(), "external" | "native-full"));
    let plan: Plan = serde_json::from_slice(&fs::read(&plan_path).unwrap()).unwrap();
    assert_eq!(plan.version, 1);
    assert_eq!(plan.cases.len(), 9);
    let plan_identity = artifact(&plan_path);
    let mut provenance = vec![plan_identity];
    for name in [
        "assessment_context_tests.rs",
        "assessment.rs",
        "evidence.rs",
        "editorial.rs",
        "analysis_types.rs",
    ] {
        provenance.push(artifact(
            &workspace().join("app/src-tauri/src/clips").join(name),
        ));
    }
    let model_metadata = if layout == "external" {
        let path = within(&raw_directory.join("model.json"), &raw_directory);
        let value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(value["nativePlanSha256"], json!(provenance[0].sha256));
        provenance.push(artifact(&path));
        value
    } else {
        json!({"identity":"Original native Qwen FULL outputs","nativePlanSha256":provenance[0].sha256})
    };
    let mut records = Vec::new();
    let mut parity = 0;
    for (index, case) in plan.cases.iter().enumerate() {
        assert_eq!(case.case.id, format!("case-{index:02}"));
        assert_eq!(case.quotes, evidence::quotes(&case.native_source));
        let input = case
            .inputs
            .iter()
            .find(|input| input.scope == "full")
            .expect("frozen FULL input");
        let frozen_schema = within(&input.schema, &allowed);
        assert_eq!(
            fs::read(&frozen_schema).unwrap(),
            serde_json::to_vec(&schema(case.quotes.len())).unwrap()
        );
        let (case_directory, filename) = if layout == "native-full" {
            (
                raw_directory.join(format!("{}-full", case.case.id)),
                "raw.txt",
            )
        } else {
            (raw_directory.join(&case.case.id), "output.txt")
        };
        let raw_path = within(&case_directory.join(filename), &raw_directory);
        let raw = fs::read_to_string(&raw_path).unwrap();
        let assessment = grounded_record(&raw, case);
        provenance.push(artifact(&raw_path));
        provenance.push(artifact(&frozen_schema));
        let previous = if layout == "native-full" {
            let path = within(&case_directory.join("result.json"), &raw_directory);
            let value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            assert_eq!(value["source"], json!(case.native_source));
            assert_eq!(value["quotes"], json!(case.quotes));
            let equal = assessment == value["assessment"];
            provenance.push(artifact(&path));
            if equal {
                parity += 1;
            }
            json!({"previousNativeAssessmentEqual":equal})
        } else {
            Value::Null
        };
        records.push(json!({"id":case.case.id,"fixture":case.case.fixture,"scope":"full","expectedComplete":case.case.expected_complete,"start":case.start,"end":case.end,"source":case.native_source,"quotes":case.quotes,"rawFile":raw_path,"assessment":assessment,"previousNative":previous,"fidelityStatus":"PENDING_TEXT_REVIEW"}));
    }
    let output = raw_directory.join(format!(
        "native-grounding-replay-{}.json",
        uuid::Uuid::new_v4()
    ));
    let result = json!({"status":if layout=="native-full" && parity==9 {"PASS_CPU_REPLAY_PARITY_ONLY"} else {"RECORDED_NATIVE_GROUNDING_PENDING_TEXT_REVIEW"},"layout":layout,"frozenPlan":plan_path,"modelMetadata":model_metadata,"casesRecorded":records.len(),"previousFullAssessmentsEqual":if layout=="native-full" {Some(parity)} else {None},"records":records,"provenance":provenance,"modelCalls":0,"tokenizerCalls":0,"publications":0,"editorialApproval":false,"executionPlanReuse":false,"limits":"Replay only uses frozen case data and saved JSON. Current grounding code is fingerprinted; original plan/execution remain historical and are not revalidated for new inference. Expected labels never modify model outputs or grounded scores."});
    save_json(&output, &result);
    let reread: Value = serde_json::from_slice(&fs::read(&output).unwrap()).unwrap();
    assert_eq!(reread, result);
    println!(
        "native-grounding-replay={} cases={} previousFullParity={}",
        output.display(),
        records.len(),
        parity
    );
    if layout == "native-full" {
        assert_eq!(
            parity, 9,
            "current grounding differs from a previously recorded FULL assessment"
        );
    }
}
