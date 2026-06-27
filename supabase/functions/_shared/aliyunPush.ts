// Aliyun Mobile Push REST API helper (HMAC-SHA1 signed, Deno compatible)
// Docs: https://help.aliyun.com/document_detail/30082.html

const ALIYUN_API_ENDPOINT = 'https://cloudpush.aliyuncs.com/'
const API_VERSION = '2016-08-01'

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function randomNonce(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

async function signRequest(
  params: Record<string, string>,
  accessKeySecret: string
): Promise<string> {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(sorted)}`
  return hmacSha1(accessKeySecret + '&', stringToSign)
}

export type AliyunPushPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Send a push notification to a single device via Aliyun Mobile Push.
 * Uses Target=DEVICE so the AppKey must match the device's platform (Android).
 */
export async function sendAliyunPushByDevice(
  aliyunDeviceId: string,
  notification: AliyunPushPayload
): Promise<{ success: boolean; error?: string }> {
  const accessKeyId = Deno.env.get('ALIYUN_ACCESS_KEY_ID')
  const accessKeySecret = Deno.env.get('ALIYUN_ACCESS_KEY_SECRET')
  const appKey = Deno.env.get('ALIYUN_ANDROID_APP_KEY')

  if (!accessKeyId || !accessKeySecret || !appKey) {
    console.warn('⚠️ Aliyun credentials not configured, skipping push')
    return { success: false, error: 'Aliyun credentials not configured' }
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const params: Record<string, string> = {
    Format: 'JSON',
    Version: API_VERSION,
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: randomNonce(),
    Timestamp: timestamp,
    Action: 'Push',
    AppKey: appKey,
    Target: 'DEVICE',
    TargetValue: aliyunDeviceId,
    Title: notification.title,
    Body: notification.body,
    AndroidNotifyType: 'BOTH',
    AndroidNotificationBarType: '1',
    AndroidNotificationBarPriority: '1',
    StoreOffline: 'true',
    ExpireTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }

  if (notification.data) {
    params.AndroidExtParameters = JSON.stringify(notification.data)
    params.IOSExtParameters = JSON.stringify(notification.data)
  }

  const signature = await signRequest(params, accessKeySecret)
  params.Signature = signature

  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  try {
    const response = await fetch(ALIYUN_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const result = await response.json()

    if (!response.ok || result.Code !== 'OK') {
      console.error('❌ Aliyun push failed:', result)
      return { success: false, error: result.Message ?? 'Aliyun push failed' }
    }

    console.log('✅ Aliyun push sent, MessageId:', result.MessageId)
    return { success: true }
  } catch (err: any) {
    console.error('❌ Aliyun push exception:', err)
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
