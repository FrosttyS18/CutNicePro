use super::Plan;
use crate::{
    editor::{render_captions, render_plan},
    render::encoder::Encoder,
};
use std::{ffi::OsString, path::Path};

#[cfg(test)]
pub(super) fn arguments(
    plan: &Plan<'_>,
    source: &Path,
    directory: &Path,
    index: usize,
) -> Result<Vec<OsString>, String> {
    arguments_with_options(
        plan,
        source,
        directory,
        index,
        crate::editor::export_options::ExportOptions::default(),
    )
}

pub(super) fn arguments_with_options(
    plan: &Plan<'_>,
    source: &Path,
    directory: &Path,
    index: usize,
    options: crate::editor::export_options::ExportOptions,
) -> Result<Vec<OsString>, String> {
    let frames = plan.window.end - plan.window.start;
    let duration = frames as f64 / 30.0;
    let output_frames = options.window_frames(plan.window, &plan.document.fps);
    if output_frames == 0 {
        return Err("A janela não contém frames na taxa de saída escolhida.".into());
    }
    let output_rate = options.output_rate(&plan.document.fps);
    let timing = options.timing_filter(plan.window, &plan.document.fps);
    let top = plan
        .layout
        .top
        .geometry(plan.asset.width, plan.asset.height);
    let bottom = plan
        .layout
        .bottom
        .geometry(plan.asset.width, plan.asset.height);
    let bounds = &plan.bounds;
    let mut captions = Vec::new();
    for caption in render_plan::active(plan.document, plan.window.start)
        .iter()
        .filter(|caption| {
            render_captions::source_video(plan.document, caption)
                .is_some_and(|owner| owner.id == plan.item.id)
        })
    {
        let filename = format!("caption-{index}-{}.ass", captions.len());
        if let Some(filter) =
            render_captions::filter(plan.document, caption, plan.window, directory, &filename)?
        {
            captions.push(filter);
        }
    }
    let caption_filter = if captions.is_empty() {
        String::new()
    } else {
        format!("hwdownload,format=yuv420p,{},hwupload,", captions.join(","))
    };
    let reduced = options.dimensions(1080, 1920) != (1080, 1920);
    let output = if reduced {
        "fullsize"
    } else if timing.is_empty() {
        "out"
    } else {
        "composed"
    };
    let mut graph = format!(
        "[0:v]format=yuv420p,setparams=colorspace=bt709,hwupload,split=2[background][placementbackground];[1:v]setpts=PTS-STARTPTS,fps=30/1,scale_cuda={}:{}:format=yuv420p:interp_algo=bicubic,split=2[top][bottom];[background][top]overlay_cuda=x=-{}:y=0:eof_action=pass:repeatlast=0[topmix];[topmix][bottom]overlay_cuda=x=-{}:y=960:eof_action=pass:repeatlast=0[stack];[stack]{caption_filter}scale_cuda={}:{}:format=yuv420p:interp_algo=bicubic[placed];[placementbackground][placed]overlay_cuda=x={}:y={}:eof_action=pass:repeatlast=0[{output}]",
        top.width, top.height, top.x, bottom.x, bounds.width, bounds.height, bounds.x, bounds.y
    );
    if reduced {
        graph.push(';');
        graph.push_str(&options.output_filter_to(
            "fullsize",
            1080,
            1920,
            true,
            if timing.is_empty() { "out" } else { "resized" },
        ));
    }
    if !timing.is_empty() {
        let current = if reduced { "resized" } else { "composed" };
        graph.push_str(&format!(
            ";[{current}]{}[out]",
            timing.trim_end_matches(',')
        ));
    }
    let script = format!("video-{index}-gpu.txt");
    std::fs::write(directory.join(&script), graph).map_err(|error| error.to_string())?;
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-init_hw_device",
        "cuda=gpu:0",
        "-filter_hw_device",
        "gpu",
        "-filter_complex_threads",
        &crate::editor::render_graph::filter_threads().to_string(),
        "-f",
        "lavfi",
        "-i",
        &format!("color=c=#000000:s=1080x1920:r=30/1:d={duration}"),
        "-hwaccel",
        "cuda",
        "-hwaccel_device",
        "gpu",
        "-hwaccel_output_format",
        "cuda",
        "-ss",
        &render_plan::source_time(plan.document, plan.item, plan.window.start).to_string(),
        "-t",
        &duration.to_string(),
        "-threads",
        "2",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(source.as_os_str().into());
    args.extend([
        "-/filter_complex".into(),
        script.into(),
        "-map".into(),
        "[out]".into(),
        "-an".into(),
        "-r".into(),
        format!("{}/{}", output_rate.0, output_rate.1).into(),
        "-frames:v".into(),
        output_frames.to_string().into(),
        "-pix_fmt".into(),
        "cuda".into(),
        "-threads".into(),
        "4".into(),
    ]);
    let (width, height) = options.dimensions(1080, 1920);
    args.extend(
        crate::editor::export_encoding::arguments(
            options,
            Encoder::Nvenc,
            width,
            height,
            output_rate,
        )
        .into_iter()
        .map(Into::into),
    );
    if options.codec == crate::editor::export_options::Codec::Hevc {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }
    args.extend([
        "-progress".into(),
        "pipe:2".into(),
        "-nostats".into(),
        format!("part-{index}.{}", options.extension()).into(),
    ]);
    Ok(args)
}
