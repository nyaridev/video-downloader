export const MAIN_VIEW_ID = "main";

export const state = {
  mode: "video",
  outputDir: "",
  frameless: true,
  allJobs: [],
  views: [],
  activeViewId: MAIN_VIEW_ID,
  queueRevision: 0,
};

export const ITEM_ORDER = ["metadata", "thumbnail", "audio", "video"];

export const DOWNLOAD_SETTING_IDS = [
  "chkVideo",
  "chkAudio",
  "chkMeta",
  "chkThumb",
  "videoQuality",
  "audioQuality",
  "chkBundle",
  "chkGroupPlaylistChannel",
  "chkCombine",
  "layoutRaw",
  "layoutOrg",
  "layoutIntelligent",
];
