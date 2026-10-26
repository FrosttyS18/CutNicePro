import math
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import worker
import split_worker


def face(cx, cy=0.4, width=0.12, height=0.2, confidence=0.95, size=(480, 270)):
    return [(cx - width / 2) * size[0], (cy - height / 2) * size[1],
            width * size[0], height * size[1], *([0] * 10), confidence]


class SplitFramingTests(unittest.TestCase):
    def test_v1_script_loads_without_deploying_the_split_module(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "worker.py").write_text(Path(worker.__file__).read_text(encoding="utf-8"), encoding="utf-8")
            result = subprocess.run([sys.executable, "-c", 'import worker; worker.validate_request({"version":1,"clips":[]})'],
                                    cwd=folder, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)

    def selection(self, samples, width=1920, height=1080):
        select = getattr(split_worker, "summarize_split", None)
        self.assertTrue(callable(select), "Seleção dupla ainda não implementada")
        return select(samples, width, height)

    def pair(self, left=0.25, right=0.75):
        extract = getattr(split_worker, "split_faces", None)
        self.assertTrue(callable(extract), "Extração dupla ainda não implementada")
        return extract([face(left), face(right)], 480, 270)

    def test_stable_simultaneous_pair_produces_two_distinct_crop_anchors(self):
        result = self.selection([self.pair()] * 4)
        self.assertEqual(result["status"], "found")
        self.assertEqual(result["layout"]["version"], 1)
        top, bottom = result["layout"]["top"], result["layout"]["bottom"]
        self.assertLess(top["x"], 25)
        self.assertGreater(bottom["x"], 75)
        self.assertGreater(top["zoom"], 1)
        for panel in [top, bottom]:
            self.assertTrue(0 <= panel["x"] <= 100 and 0 <= panel["y"] <= 100)
            self.assertTrue(1 <= panel["zoom"] <= 3)

    def test_alternating_single_faces_do_not_invent_a_simultaneous_pair(self):
        extract = getattr(split_worker, "split_faces", None)
        self.assertTrue(callable(extract), "Extração dupla ainda não implementada")
        result = self.selection([extract([face(x)], 480, 270) for x in [0.25, 0.75, 0.25]])
        self.assertEqual(result["status"], "manual")
        self.assertNotIn("layout", result)

    def test_absent_ambiguous_or_missing_samples_preserve_manual_choice(self):
        for samples in [[], [None] * 3, [self.pair(), None, self.pair()]]:
            with self.subTest(samples=samples):
                result = self.selection(samples)
                self.assertEqual(result["status"], "manual")
                self.assertNotIn("layout", result)
                self.assertTrue(result["message"])

    def test_changed_composition_and_large_scale_change_are_manual(self):
        moved = self.pair(0.48, 0.86)
        extract = getattr(split_worker, "split_faces", None)
        large = extract([face(0.25, width=0.24, height=0.4), face(0.75)], 480, 270)
        for samples in [[self.pair(), moved, self.pair()], [self.pair(), large, self.pair()]]:
            result = self.selection(samples)
            self.assertEqual(result["status"], "manual")
            self.assertNotIn("layout", result)

    def test_pair_that_cannot_be_isolated_into_distinct_panels_remains_manual(self):
        result = self.selection([self.pair(0.4, 0.55)] * 3)
        self.assertEqual(result["status"], "manual")
        self.assertNotIn("layout", result)

    def test_duplicates_third_faces_and_nonfinite_boxes_are_not_a_pair(self):
        extract = getattr(split_worker, "split_faces", None)
        self.assertTrue(callable(extract), "Extração dupla ainda não implementada")
        for faces in [[face(0.25), face(0.25)], [face(0.2), face(0.5), face(0.8)],
                      [face(math.nan), face(0.75)]]:
            self.assertIsNone(extract(faces, 480, 270))

    def test_vertical_pair_uses_separate_vertical_crop_anchors(self):
        extract = getattr(split_worker, "split_faces", None)
        self.assertTrue(callable(extract), "Extração dupla ainda não implementada")
        pair = extract([face(0.5, 0.25), face(0.5, 0.75)], 480, 270)
        result = self.selection([pair] * 3, 1080, 1920)
        self.assertEqual(result["status"], "found")
        self.assertLess(result["layout"]["top"]["y"], 25)
        self.assertGreater(result["layout"]["bottom"]["y"], 75)

    def test_split_request_accepts_long_source_and_rejects_wrong_mode_or_interval(self):
        request = {"version": 2, "mode": "split", "start": 20, "end": 620}
        worker.validate_request(request)
        self.assertEqual(len(worker.offsets(20, 620)), 12)
        for invalid in [{**request, "mode": "other"}, {**request, "start": -1},
                        {**request, "end": 20}, {**request, "end": math.inf}]:
            with self.assertRaises(ValueError):
                worker.validate_request(invalid)

    def capture_fixture(self, seek=True, composition=None):
        capture = SimpleNamespace(isOpened=lambda: True, get=lambda _: 30,
                                  released=False, reads=0, at=0)
        def set_position(_, at):
            capture.at = at / 1000
            return seek
        capture.set = set_position
        def read():
            capture.reads += 1
            return True, SimpleNamespace(shape=(1080, 1920, 3))
        def release():
            capture.released = True
        capture.read, capture.release = read, release
        detector = SimpleNamespace(setInputSize=lambda _: None,
                                   detect=lambda _: (None, composition(capture.at) if composition else
                                                     [face(0.25, size=(960, 540)), face(0.75, size=(960, 540))]))
        cv2 = SimpleNamespace(setNumThreads=lambda _: None,
                              ocl=SimpleNamespace(setUseOpenCL=lambda _: None),
                              VideoCapture=lambda *_: capture,
                              FaceDetectorYN=SimpleNamespace(create=lambda *_: detector),
                              resize=lambda frame, _: frame, CAP_FFMPEG=1, CAP_PROP_N_THREADS=2,
                              CAP_PROP_OPEN_TIMEOUT_MSEC=3, CAP_PROP_READ_TIMEOUT_MSEC=4,
                              CAP_PROP_FPS=5, CAP_PROP_POS_MSEC=6)
        return cv2, capture

    def analyze_fixture(self, cv2, cuts="", viewport=None, end=600, start=0):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.mp4"
            model = Path(folder) / "model.onnx"
            ffmpeg = Path(folder) / "ffmpeg.exe"
            source.touch()
            model.touch()
            ffmpeg.touch()
            completed = SimpleNamespace(returncode=0, stdout=cuts, stderr="")
            with patch.dict(sys.modules, {"cv2": cv2}), patch.object(worker, "peak_working_set", return_value=1024), patch("subprocess.run", return_value=completed):
                return worker.analyze({"version": 2, "mode": "split", "source": str(source),
                                       "model": str(model), "ffmpeg": str(ffmpeg), "start": start,
                                       "end": end, **({"viewport": viewport} if viewport else {})})

    def test_split_analysis_reads_three_frames_per_scene_and_releases_capture(self):
        cv2, capture = self.capture_fixture()
        response = self.analyze_fixture(cv2)
        self.assertEqual(response["version"], 2)
        self.assertEqual(response["backend"], "yunet-split-scenes-v2")
        self.assertEqual(response["suggestion"]["status"], "found")
        self.assertEqual(response["samples"], 3)
        self.assertEqual(capture.reads, 3)
        self.assertEqual(response["suggestion"]["layout"]["shots"][0]["sourceStart"], 0)
        self.assertEqual(response["suggestion"]["layout"]["shots"][0]["sourceEnd"], 600)
        self.assertTrue(capture.released)

    def test_four_source_faces_choose_only_two_visible_in_target_viewport(self):
        viewport = {"x": 0.341796875, "y": 0, "width": 0.31640625, "height": 1}
        pair = split_worker.split_faces([face(x, width=0.04, height=0.09) for x in (0.1, 0.42, 0.63, 0.9)],
                                  480, 270, viewport)
        self.assertIsNotNone(pair)
        self.assertAlmostEqual(pair[0]["cx"], 0.42)
        self.assertAlmostEqual(pair[1]["cx"], 0.63)

    def test_low_confidence_helmet_is_not_a_second_person(self):
        pair = split_worker.split_faces([face(0.5), face(0.9, confidence=0.657)], 480, 270)
        self.assertIsNone(pair)

    def test_camera_change_to_one_person_has_no_inherited_split_window(self):
        def composition(at):
            centers = (0.1, 0.42, 0.63, 0.9) if at < 10 else (0.5,)
            return [face(x, width=0.04, height=0.09, size=(960, 540)) for x in centers]
        cv2, capture = self.capture_fixture(composition=composition)
        response = self.analyze_fixture(cv2, "frame:0 pts:600 pts_time:10\nlavfi.scene_score=0.33\n",
                                        {"x": 0.341796875, "y": 0, "width": 0.31640625, "height": 1}, 20)
        self.assertEqual(response["suggestion"]["status"], "found")
        self.assertEqual(response["samples"], 6)
        self.assertEqual(capture.reads, 6)
        shots = response["suggestion"]["layout"]["shots"]
        self.assertEqual(len(shots), 1)
        self.assertEqual((shots[0]["sourceStart"], shots[0]["sourceEnd"]), (0, 10))

    def test_no_simultaneous_pair_returns_manual_without_layout(self):
        cv2, _ = self.capture_fixture(composition=lambda _: [face(0.5, size=(960, 540))])
        response = self.analyze_fixture(cv2)
        self.assertEqual(response["suggestion"]["status"], "manual")
        self.assertNotIn("layout", response["suggestion"])

    def test_invalid_viewport_and_nonfinite_window_are_rejected(self):
        base = {"version": 2, "mode": "split", "start": 10, "end": 20}
        for viewport in ({"x": math.nan, "y": 0, "width": 1, "height": 1},
                         {"x": 0.9, "y": 0, "width": 0.2, "height": 1},
                         {"x": 0, "y": 0, "width": 0, "height": 1},
                         {"x": 0, "y": False, "width": 1, "height": 1}):
            with self.subTest(viewport=viewport), self.assertRaises(ValueError):
                worker.validate_request({**base, "viewport": viewport})

    def test_scene_boundaries_are_absolute_and_never_merge_across_camera_cuts(self):
        cv2, capture = self.capture_fixture()
        cuts = "frame:0 pts:0 pts_time:90\nlavfi.scene_score=0.4\nframe:1 pts:0 pts_time:110\nlavfi.scene_score=0.4\nframe:2 pts:0 pts_time:130\nlavfi.scene_score=0.4\n"
        response = self.analyze_fixture(cv2, cuts, start=100, end=120)
        shots = response["suggestion"]["layout"]["shots"]
        self.assertEqual([(s["sourceStart"], s["sourceEnd"]) for s in shots], [(100, 110), (110, 120)])
        self.assertEqual(response["samples"], 6)
        self.assertEqual(capture.reads, 6)

    def test_more_than_sixty_four_scenes_returns_clear_manual_without_sampling(self):
        cv2, capture = self.capture_fixture()
        cuts = "".join(f"frame:{i} pts:0 pts_time:{i + 1}\nlavfi.scene_score=0.4\n" for i in range(64))
        response = self.analyze_fixture(cv2, cuts)
        self.assertEqual(response["suggestion"]["status"], "manual")
        self.assertIn("64", response["suggestion"]["message"])
        self.assertEqual(response["samples"], 0)
        self.assertEqual(capture.reads, 0)

    def test_total_deadline_returns_clear_manual_without_partial_split(self):
        cv2, capture = self.capture_fixture()
        with patch("time.monotonic", side_effect=[0] + [61] * 20):
            response = self.analyze_fixture(cv2)
        self.assertEqual(response["suggestion"]["status"], "manual")
        self.assertIn("60", response["suggestion"]["message"])
        self.assertNotIn("layout", response["suggestion"])
        self.assertEqual(capture.reads, 0)

    def test_seek_failure_does_not_use_frames_outside_the_requested_window(self):
        cv2, capture = self.capture_fixture(seek=False)
        result = self.analyze_fixture(cv2)
        self.assertEqual(result["suggestion"]["status"], "manual")
        self.assertNotIn("layout", result["suggestion"])
        self.assertEqual(capture.reads, 0)
        self.assertTrue(capture.released)

    def test_detector_failure_releases_capture(self):
        cv2, capture = self.capture_fixture()
        def fail(*_):
            raise RuntimeError("Falha controlada no detector")
        cv2.FaceDetectorYN.create = fail
        with self.assertRaises(RuntimeError):
            self.analyze_fixture(cv2)
        self.assertTrue(capture.released)


if __name__ == "__main__":
    unittest.main()
