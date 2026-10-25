import unittest
from worker import crop_position, offsets, summarize, validate_request


class FramingTests(unittest.TestCase):
    def test_sixteen_clips_are_accepted_but_seventeen_are_rejected(self):
        validate_request({"version": 1, "clips": [{}] * 16})
        with self.assertRaises(ValueError):
            validate_request({"version": 1, "clips": [{}] * 17})

    def test_sampling_is_bounded_and_inside_clip(self):
        values = offsets(10, 190)
        self.assertEqual(len(values), 12)
        self.assertGreater(values[0], 10)
        self.assertLess(values[-1], 190)

    def test_face_center_is_converted_to_crop_anchor(self):
        self.assertAlmostEqual(crop_position(0.7, 0.3164), 0.79257, places=4)
        self.assertEqual(crop_position(0.5, 1), 0.5)

    def test_stationary_face_is_safe_but_speaker_changes_keep_full_frame(self):
        face = {"cx": 0.3, "width": 0.1, "confidence": 0.9}
        self.assertEqual(summarize([face] * 4, 0.3164)["status"], "stable")
        other = {**face, "cx": 0.8}
        self.assertEqual(summarize([face, other, face, other], 0.3164)["status"], "ambiguous")

    def test_absent_or_ambiguous_faces_never_invent_a_focal_point(self):
        self.assertEqual(summarize([None] * 3, 0.3)["status"], "noFaces")
        self.assertEqual(summarize([{"ambiguous": True}] * 3, 0.3)["status"], "ambiguous")


if __name__ == "__main__":
    unittest.main()
