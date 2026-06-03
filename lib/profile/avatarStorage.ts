import { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BUCKET = "avatars";

function inferFileExtension(uri: string, mimeType?: string | null) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic" || mimeType === "image/heif") return "heic";
  if (mimeType === "image/jpg" || mimeType === "image/jpeg") return "jpg";

  const match = uri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match?.[1] || "jpg";
}

export function isLocalAvatarUri(uri?: string | null) {
  if (!uri) return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("content://") ||
    uri.startsWith("assets-library://")
  );
}

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}

export async function uploadAvatarToStorage(
  supabase: SupabaseClient,
  userId: string,
  localUri: string,
  mimeType?: string | null,
  base64Data?: string | null
) {
  const extension = inferFileExtension(localUri, mimeType);
  const path = `${userId}/avatar.${extension}`;
  const contentType = mimeType || `image/${extension}`;
  const fileBody = base64Data ? base64ToUint8Array(base64Data) : await (async () => {
    const response = await fetch(localUri);
    const blob = await response.blob();
    return blob;
  })();

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, fileBody, {
      upsert: true,
      contentType,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
