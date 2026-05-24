import { apiCall } from "../../../scripts/api.js";

function readColorScheme() {
  return document.documentElement.dataset.colorScheme === "light" ? "light" : "dark";
}

export async function fetchRandomImageUrl(colorScheme = readColorScheme()) {
  const result = await apiCall("get_anime_background", colorScheme);
  if (!result?.ok || !result?.url) {
    throw new Error(result?.error || "Failed to fetch anime background");
  }
  return result.url;
}
