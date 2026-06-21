// Aliyun Mobile Push REST API helper (account-based targeting, Android).
// Docs: https://help.aliyun.com/document_detail/30082.html

const ENDPOINT = 'https://cloudpush.aliyuncs.com';

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function pct(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

export interface AliyunPushOptions {
  accessKeyId: string;
  accessKeySecret: string;
  appKey: string;
  targetUserId: string;   // Supabase user ID — must match bindAccount() call on client
  title: string;
  body: string;
  extraData?: Record<string, unknown>;
}

export async function sendAliyunPush(
  opts: AliyunPushOptions
): Promise<{ success: boolean; error?: string }> {
  const { accessKeyId, accessKeySecret, appKey, targetUserId, title, body, extraData } = opts;

  if (!accessKeyId || !accessKeySecret || !appKey) {
    return { success: false, error: 'Aliyun credentials not configured' };
  }

  const extStr = extraData ? JSON.stringify(extraData) : undefined;

  const params: Record<string, string> = {
    Action: 'Push',
    Format: 'JSON',
    Version: '2016-08-01',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    AppKey: appKey,
    PushType: 'NOTICE',
    DeviceType: '1',          // Android only
    Target: 'account',
    TargetValue: targetUserId,
    Title: title,
    Body: body,
    AndroidNotificationChannel: 'default',
    AndroidNotificationBarType: '1',
  };

  if (extStr) {
    params.AndroidExtParameters = extStr;
  }

  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys.map(k => `${pct(k)}=${pct(params[k])}`).join('&');
  const stringToSign = `GET&${pct('/')}&${pct(canonicalQuery)}`;
  const signature = await hmacSha1Base64(`${accessKeySecret}&`, stringToSign);

  const url = `${ENDPOINT}/?${canonicalQuery}&Signature=${pct(signature)}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (result.Code) {
      return { success: false, error: `${result.Code}: ${result.Message}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Aliyun fetch error' };
  }
}
