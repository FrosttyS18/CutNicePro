use crate::{
    editor::{
        render_captions, render_graph, render_media, render_plan,
        types::{Asset, Composition, Item, ItemKind},
    },
    render::split_screen::SplitScreen,
};

pub(in crate::editor) struct Plan<'a> {
    pub(super) document: &'a Composition,
    pub(super) window: &'a render_plan::Window,
    pub(super) item: &'a Item,
    pub(super) asset: &'a Asset,
    pub(super) layout: SplitScreen,
    pub(super) bounds: render_graph::LayerBounds,
}

impl<'a> Plan<'a> {
    pub(in crate::editor) fn for_window(
        document: &'a Composition,
        window: &'a render_plan::Window,
    ) -> Result<Option<Self>, String> {
        if document.fps.numerator != 30
            || document.fps.denominator != 1
            || window.end.saturating_sub(window.start) < 1800
        {
            return Ok(None);
        }
        let canvas = render_media::settings(document, None, &document.settings)?;
        if canvas.dimensions()? != (1080, 1920)
            || canvas.background != "#000000"
            || !canvas.text.is_empty()
        {
            return Ok(None);
        }
        let active = render_plan::active(document, window.start);
        let mut visuals = active
            .iter()
            .filter(|item| matches!(item.kind, ItemKind::Video | ItemKind::Image));
        let Some(&item) = visuals.next() else {
            return Ok(None);
        };
        if item.kind != ItemKind::Video || visuals.next().is_some() {
            return Ok(None);
        }
        if active.iter().any(|caption| {
            caption.kind == ItemKind::Caption
                && render_captions::source_video(document, caption)
                    .is_none_or(|owner| owner.id != item.id)
        }) {
            return Ok(None);
        }
        let asset = document
            .assets
            .iter()
            .find(|asset| asset.id == item.asset_id)
            .ok_or("Fonte do vídeo ausente")?;
        if asset.width < 2
            || asset.height < 2
            || asset.width as u64 * 960 < asset.height as u64 * 1080
        {
            return Ok(None);
        }
        let settings = render_media::settings(document, Some(asset), &item.settings)?;
        if settings.effects_filter().is_some() {
            return Ok(None);
        }
        let duration = (window.end - window.start) as f64 / 30.0;
        let source_time = render_plan::source_time(document, item, window.start);
        let Some(layout) = settings
            .split_screen
            .as_ref()
            .and_then(|layout| layout.at(source_time + duration / 2.0))
        else {
            return Ok(None);
        };
        let placement = item.placement.clone().unwrap_or_default();
        let bounds = render_graph::layer_bounds(1080, 1920, &placement);
        let top = layout.top.geometry(asset.width, asset.height);
        let bottom = layout.bottom.geometry(asset.width, asset.height);
        if layout.top.zoom != 1.0
            || layout.bottom.zoom != 1.0
            || placement.opacity != 1.0
            || placement.scale > 2.0
            || bounds.y as i64 & 1 != 0
            || top.height != 960
            || bottom.height != 960
        {
            return Ok(None);
        }
        Ok(Some(Self {
            document,
            window,
            item,
            asset,
            layout,
            bounds,
        }))
    }
}
