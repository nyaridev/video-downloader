import { apiCall } from "../../../scripts/api.js";

export async function fetchRandomImageUrl() {
  const result = await apiCall("get_anime_background");
  if (!result?.ok || !result?.url) {
    throw new Error(result?.error || "Failed to fetch anime background");
  }
  return result.url;
}
