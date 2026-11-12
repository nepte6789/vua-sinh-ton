// Accept current nested TikTok events and older flattened payloads.
export function resolveLiveUser(data, aliases = new Map()) {
  const user = data?.user || data?.userInfo || data?.common?.user || data || {};
  const values = [
    user.uniqueId,
    user.unique_id,
    user.userId,
    user.user_id,
    user.id,
    data?.uniqueId,
    data?.unique_id,
    data?.userId,
    data?.user_id,
    user.secUid,
    user.sec_uid,
  ]
    .filter(
      (v) =>
        v !== undefined && v !== null && String(v).trim() && String(v) !== "0",
    )
    .map((v) => String(v).trim());
  if (!values.length) return null;
  const id = values.map((v) => aliases.get(v)).find(Boolean) || values[0];
  for (const value of values) aliases.set(value, id);
  const name = String(
    user.nickname || user.nickName || data?.nickname || user.uniqueId || id,
  ).trim();
  const image = user.profilePicture || user.avatarThumb || user.avatar || {};
  const url = image.url || image.urlList || image.url_list || image;
  const avatar = Array.isArray(url)
    ? url[0] || ""
    : typeof url === "string"
      ? url
      : "";
  return { id, name, avatar };
}
