export const META_MAX_ALBUM_IMAGES = 10;

export const collectImageUrls = (
  imageUrl: string | null,
  additionalImageUrls: string[],
  max: number = META_MAX_ALBUM_IMAGES,
): string[] => {
  const urls = [imageUrl, ...additionalImageUrls]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));
  return [...new Set(urls)].slice(0, max);
};

export const attachedMediaFields = (mediaIds: string[]): Record<string, string> =>
  Object.fromEntries(
    mediaIds.map((id, index) => [`attached_media[${index}]`, JSON.stringify({ media_fbid: id })]),
  );
