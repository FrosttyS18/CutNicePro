export interface PreviewSize { width: number; height: number }
export interface PreviewPoint { x: number; y: number }
export interface PreviewCamera extends PreviewPoint { zoom: number }
export const PREVIEW_ZOOM_MIN = .25;
export const PREVIEW_ZOOM_MAX = 4;
export const FIT_PREVIEW: Readonly<PreviewCamera> = { zoom: 1, x: 0, y: 0 };

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function fitSize(viewport: PreviewSize, output: PreviewSize): PreviewSize {
  if (![viewport.width, viewport.height, output.width, output.height].every(value => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 };
  const fit = Math.min(viewport.width / output.width, viewport.height / output.height);
  return { width: output.width * fit, height: output.height * fit };
}

export function boundPreviewCamera(viewport: PreviewSize, output: PreviewSize, camera: PreviewCamera): PreviewCamera {
  const zoom = clamp(finite(camera.zoom, 1), PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX);
  const fit = fitSize(viewport, output);
  const limitX = Math.max(0, (fit.width * zoom - viewport.width) / 2);
  const limitY = Math.max(0, (fit.height * zoom - viewport.height) / 2);
  return { zoom, x: clamp(finite(camera.x), -limitX, limitX) || 0, y: clamp(finite(camera.y), -limitY, limitY) || 0 };
}

export function previewGeometry(viewport: PreviewSize, output: PreviewSize, camera: PreviewCamera) {
  const bounded = boundPreviewCamera(viewport, output, camera);
  const fit = fitSize(viewport, output);
  const width = fit.width * bounded.zoom, height = fit.height * bounded.zoom;
  const left = (viewport.width - width) / 2 + bounded.x, top = (viewport.height - height) / 2 + bounded.y;
  const x = width ? clamp(-left / width, 0, 1) : 0;
  const y = height ? clamp(-top / height, 0, 1) : 0;
  return { width, height, left, top, visible: {
    left: x, top: y,
    width: width ? clamp((viewport.width - left) / width, 0, 1) - x : 1,
    height: height ? clamp((viewport.height - top) / height, 0, 1) - y : 1,
  } };
}

export function zoomPreviewAt(viewport: PreviewSize, output: PreviewSize, camera: PreviewCamera, zoom: number, point: PreviewPoint): PreviewCamera {
  const current = boundPreviewCamera(viewport, output, camera);
  if (!Number.isFinite(zoom)) return current;
  const nextZoom = clamp(zoom, PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX), factor = nextZoom / current.zoom;
  const x = finite(point.x, viewport.width / 2) - viewport.width / 2;
  const y = finite(point.y, viewport.height / 2) - viewport.height / 2;
  return boundPreviewCamera(viewport, output, { zoom: nextZoom, x: x - (x - current.x) * factor, y: y - (y - current.y) * factor });
}

export function centerPreviewAt(viewport: PreviewSize, output: PreviewSize, camera: PreviewCamera, point: PreviewPoint): PreviewCamera {
  const fit = fitSize(viewport, output);
  return boundPreviewCamera(viewport, output, { zoom: camera.zoom,
    x: (.5 - clamp(finite(point.x, .5), 0, 1)) * fit.width * camera.zoom,
    y: (.5 - clamp(finite(point.y, .5), 0, 1)) * fit.height * camera.zoom });
}
