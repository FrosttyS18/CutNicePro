export const nativeMediaFixture = {
  "kind": "native-serialization-fixture",
  "managedLegacy": {
    "mediaId": "daab40ec-3ca6-4f7a-bd83-b1d0f55c4438",
    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "sizeBytes": 3,
    "ext": "mp4",
    "originalName": "legacy.mp4",
    "createdAtMs": 1793033287181,
    "projectIds": [
      "p2"
    ],
    "analysis": null,
    "unavailable": false,
    "storageKind": "managed",
    "availability": "available"
  },
  "referenceAvailable": {
    "mediaId": "b40a4844-ad6f-45de-8cf7-ca41f95d89ee",
    "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sizeBytes": 3,
    "ext": "mp4",
    "originalName": "vídeo original.mp4",
    "createdAtMs": 1793033287171,
    "projectIds": [
      "p1"
    ],
    "analysis": {
      "durationMs": 1000,
      "width": 160,
      "height": 90,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "hasAudio": true,
      "fps": 30.0
    },
    "unavailable": false,
    "storageKind": "reference",
    "availability": "available"
  },
  "referenceChanged": {
    "mediaId": "b40a4844-ad6f-45de-8cf7-ca41f95d89ee",
    "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sizeBytes": 3,
    "ext": "mp4",
    "originalName": "vídeo original.mp4",
    "createdAtMs": 1793033287171,
    "projectIds": [
      "p1"
    ],
    "analysis": {
      "durationMs": 1000,
      "width": 160,
      "height": 90,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "hasAudio": true,
      "fps": 30.0
    },
    "unavailable": true,
    "storageKind": "reference",
    "availability": "changed"
  },
  "referenceMissing": {
    "mediaId": "b40a4844-ad6f-45de-8cf7-ca41f95d89ee",
    "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sizeBytes": 3,
    "ext": "mp4",
    "originalName": "vídeo original.mp4",
    "createdAtMs": 1793033287171,
    "projectIds": [
      "p1"
    ],
    "analysis": {
      "durationMs": 1000,
      "width": 160,
      "height": 90,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "hasAudio": true,
      "fps": 30.0
    },
    "unavailable": true,
    "storageKind": "reference",
    "availability": "missing"
  }
} as const;
