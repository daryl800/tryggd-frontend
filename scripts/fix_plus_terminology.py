#!/usr/bin/env python3
"""
Replace Plus/subscription terminology in locale files for Apple review compliance.
Run from the project root: python3 scripts/fix_plus_terminology.py
"""

import json
import os

LOCALE_DIR = 'i18n/locales'

LOCALES = [
    'en', 'de', 'da', 'no', 'sv', 'fr', 'es', 'it',
    'ja', 'ko', 'fi', 'zh-Hans', 'zh-Hant', 'th',
]

# Delete these nested keys in all locales
KEYS_TO_DELETE = [
    ('pilotPreview', 'dialogPricingTitle'),
    ('pilotPreview', 'dialogPricingNote'),
    ('pilotPreview', 'subscriptionNote'),
]

# Applied recursively to every string value in every locale (order matters)
GLOBAL_REPLACEMENTS = [
    ("Plus Preview", "Preview"),
    ("Tryggd Plus", "Tryggd Preview"),
    ("Plus plan", "Preview features"),
    ("Plus features", "advanced features"),
    ("Plus feature", "Advanced feature"),
    ("Try Plus for free", "Try advanced features"),
    ("Upgrade to Plus for unlimited.", "Available in the full version."),
    ("Upgrade to Plus to share how you feel with your check-in.", "Available in the full version: share how you feel with your check-in."),
    ("Upgrade to Plus to control contact check-in notifications.", "Available in the full version: contact check-in notifications."),
    ("Upgrade to Plus to enable location sharing for a contact.", "Available in the full version: location sharing for contacts."),
]

# Per-locale overrides at specific dot-notation key paths.
# Applied AFTER global replacements, so these set the final value exactly.
PER_LOCALE = {
    'en': {
        'plus.badge': 'Preview',
        'plus.comingSoon.title': 'Preview',
        'settings.homeStyle.plusBadge': 'Preview',
        'pilotPreview.activatedMessage': 'Preview is now active. Home has been set to Enhanced so you can try more sharing options. You can switch back to Simple anytime in Settings.',
    },
    'de': {
        'plus.badge': 'Vorschau',
        'plus.heading': 'Erweiterte Funktionen testen',
        'plus.comingSoon.title': 'Vorschau',
        'plus.comingSoon.button': 'Erweiterte Funktionen testen',
        'settings.homeStyle.plusBadge': 'Vorschau',
        'pilotPreview.dialogTitle': '✨ Erweiterte Funktionen testen',
        'pilotPreview.activate': 'Erweiterte Funktionen testen',
        'pilotPreview.expiredTitle': 'Vorschau beendet',
        'pilotPreview.settingsRowTitle': 'Vorschau',
        'pilotPreview.settingsRowSubtitle': 'Teste aktuelle erweiterte Funktionen kostenlos während des Piloten.',
        'pilotPreview.activeRowTitle': 'Vorschau aktiv',
        'pilotPreview.activeRowSubtitle': 'Aktuelle erweiterte Funktionen sind während des Piloten verfügbar.',
        'pilotPreview.activatedMessage': 'Vorschau ist jetzt aktiv. Der Startbereich wurde auf Erweitert gesetzt. Du kannst jederzeit in den Einstellungen zu Einfach wechseln.',
        'onboarding.slides.free.body': 'Tryggd Free hält alles einfach. Während des Pilotprojekts kannst du erweiterte Funktionen vorab testen:',
        'watchOver.limitReached': 'Im kostenlosen Plan kannst du {{max}} Person beobachten. In der Vollversion unbegrenzt verfügbar.',
    },
    'da': {
        'plus.badge': 'Forhåndsvisning',
        'plus.heading': 'Prøv avancerede funktioner',
        'plus.comingSoon.title': 'Forhåndsvisning',
        'plus.comingSoon.button': 'Prøv avancerede funktioner',
        'settings.homeStyle.plusBadge': 'Forhåndsvisning',
        'pilotPreview.dialogTitle': '✨ Prøv avancerede funktioner',
        'pilotPreview.activate': 'Prøv avancerede funktioner',
        'pilotPreview.expiredTitle': 'Forhåndsvisning er slut',
        'pilotPreview.settingsRowTitle': 'Forhåndsvisning',
        'pilotPreview.settingsRowSubtitle': 'Prøv nuværende avancerede funktioner gratis i forhåndsvisningsperioden.',
        'pilotPreview.activeRowTitle': 'Forhåndsvisning aktiv',
        'pilotPreview.activeRowSubtitle': 'Nuværende avancerede funktioner er tilgængelige i forhåndsvisningsperioden.',
        'pilotPreview.activatedMessage': 'Forhåndsvisning er nu aktiv. Startskærmen er skiftet til Udvidet, så du kan prøve flere delingsmuligheder. Du kan skifte tilbage til Simpel når som helst i Indstillinger.',
        'onboarding.slides.free.body': 'Tryggd Free holder det enkelt. Under pilotprojektet kan du forhåndsvise avancerede funktioner:',
        'watchOver.limitReached': 'Du kan holde øje med {{max}} person på gratisplanen. Tilgængeligt i fuld version.',
    },
    'no': {
        'plus.badge': 'Forhåndsvisning',
        'plus.heading': 'Prøv avanserte funksjoner',
        'plus.comingSoon.title': 'Forhåndsvisning',
        'plus.comingSoon.button': 'Prøv avanserte funksjoner',
        'settings.homeStyle.plusBadge': 'Forhåndsvisning',
        'pilotPreview.dialogTitle': '✨ Prøv avanserte funksjoner',
        'pilotPreview.activate': 'Prøv avanserte funksjoner',
        'pilotPreview.expiredTitle': 'Forhåndsvisning er avsluttet',
        'pilotPreview.settingsRowTitle': 'Forhåndsvisning',
        'pilotPreview.settingsRowSubtitle': 'Prøv nåværende avanserte funksjoner gratis i pilotperioden.',
        'pilotPreview.activeRowTitle': 'Forhåndsvisning aktiv',
        'pilotPreview.activeRowSubtitle': 'Nåværende avanserte funksjoner er tilgjengelige i pilotperioden.',
        'pilotPreview.activatedMessage': 'Forhåndsvisning er nå aktiv. Hjem er satt til Utvidet. Du kan når som helst bytte tilbake til Enkel i Innstillinger.',
        'onboarding.slides.free.body': 'Tryggd Free holder det enkelt. Under pilotprosjektet kan du forhåndsvise avanserte funksjoner:',
        'watchOver.limitReached': 'Du kan holde øye med {{max}} person på gratisplanen. Tilgjengelig i fullversjonen.',
    },
    'sv': {
        'plus.badge': 'Förhandsgranskning',
        'plus.heading': 'Prova avancerade funktioner',
        'plus.comingSoon.title': 'Förhandsgranskning',
        'plus.comingSoon.button': 'Prova avancerade funktioner',
        'settings.homeStyle.plusBadge': 'Förhandsgranskning',
        'pilotPreview.dialogTitle': '✨ Prova avancerade funktioner',
        'pilotPreview.activate': 'Prova avancerade funktioner',
        'pilotPreview.expiredTitle': 'Förhandsgranskning har avslutats',
        'pilotPreview.settingsRowTitle': 'Förhandsgranskning',
        'pilotPreview.settingsRowSubtitle': 'Prova aktuella avancerade funktioner gratis under piloten.',
        'pilotPreview.activeRowTitle': 'Förhandsgranskning aktiv',
        'pilotPreview.activeRowSubtitle': 'Aktuella avancerade funktioner är tillgängliga under piloten.',
        'pilotPreview.activatedMessage': 'Förhandsgranskning är nu aktiv. Hem har ställts in på Utökad. Du kan byta tillbaka till Enkel när som helst i Inställningar.',
        'onboarding.slides.free.body': 'Tryggd Free håller grunderna enkla. Under piloten kan du förhandsgranska avancerade funktioner:',
        'watchOver.limitReached': 'Du kan bevaka {{max}} person på gratisplanen. Tillgängligt i fullversionen.',
    },
    'fr': {
        'plus.badge': 'Aperçu',
        'plus.heading': 'Essayer les fonctionnalités avancées',
        'plus.comingSoon.title': 'Aperçu',
        'plus.comingSoon.button': 'Essayer les fonctionnalités avancées',
        'settings.homeStyle.plusBadge': 'Aperçu',
        'pilotPreview.dialogTitle': '✨ Essayer les fonctionnalités avancées',
        'pilotPreview.activate': 'Essayer les fonctionnalités avancées',
        'pilotPreview.expiredTitle': "L'aperçu est terminé",
        'pilotPreview.settingsRowTitle': 'Aperçu',
        'pilotPreview.settingsRowSubtitle': 'Essayez les fonctionnalités avancées actuelles gratuitement pendant le pilote.',
        'pilotPreview.activeRowTitle': 'Aperçu actif',
        'pilotPreview.activeRowSubtitle': 'Les fonctionnalités avancées actuelles sont disponibles pendant le pilote.',
        'pilotPreview.activatedMessage': "L'aperçu est maintenant actif. L'accueil a été réglé sur Amélioré. Vous pouvez revenir à Simple à tout moment dans les Paramètres.",
        'onboarding.slides.free.body': 'Tryggd Free garde les bases simples. Pendant le pilote, vous pouvez prévisualiser les fonctionnalités avancées :',
        'watchOver.limitReached': 'Vous pouvez surveiller {{max}} personne avec le forfait gratuit. Disponible dans la version complète.',
    },
    'es': {
        'plus.badge': 'Vista previa',
        'plus.heading': 'Prueba las funciones avanzadas',
        'plus.comingSoon.title': 'Vista previa',
        'plus.comingSoon.button': 'Prueba las funciones avanzadas',
        'settings.homeStyle.plusBadge': 'Vista previa',
        'pilotPreview.dialogTitle': '✨ Prueba las funciones avanzadas',
        'pilotPreview.activate': 'Prueba las funciones avanzadas',
        'pilotPreview.expiredTitle': 'Vista previa finalizada',
        'pilotPreview.settingsRowTitle': 'Vista previa',
        'pilotPreview.settingsRowSubtitle': 'Prueba las funciones avanzadas actuales gratis durante el piloto.',
        'pilotPreview.activeRowTitle': 'Vista previa activa',
        'pilotPreview.activeRowSubtitle': 'Las funciones avanzadas actuales están disponibles durante el piloto.',
        'pilotPreview.activatedMessage': 'La vista previa está activa. El inicio se ha configurado en Mejorado. Puedes volver a Simple en cualquier momento desde Ajustes.',
        'onboarding.slides.free.body': 'Tryggd Free mantiene lo básico simple. Durante el piloto, puedes previsualizar las funciones avanzadas:',
        'watchOver.limitReached': 'Puedes vigilar a {{max}} persona con el plan gratuito. Disponible en la versión completa.',
    },
    'it': {
        'plus.badge': 'Anteprima',
        'plus.heading': 'Prova le funzionalità avanzate',
        'plus.comingSoon.title': 'Anteprima',
        'plus.comingSoon.button': 'Prova le funzionalità avanzate',
        'settings.homeStyle.plusBadge': 'Anteprima',
        'pilotPreview.dialogTitle': '✨ Prova le funzionalità avanzate',
        'pilotPreview.activate': 'Prova le funzionalità avanzate',
        'pilotPreview.expiredTitle': "L'anteprima è terminata",
        'pilotPreview.settingsRowTitle': 'Anteprima',
        'pilotPreview.settingsRowSubtitle': 'Prova le funzionalità avanzate attuali gratuitamente durante il pilota.',
        'pilotPreview.activeRowTitle': 'Anteprima attiva',
        'pilotPreview.activeRowSubtitle': 'Le funzionalità avanzate attuali sono disponibili durante il pilota.',
        'pilotPreview.activatedMessage': "L'anteprima è ora attiva. La schermata Home è stata impostata su Avanzata. Puoi tornare a Semplice in qualsiasi momento dalle Impostazioni.",
        'onboarding.slides.free.body': 'Tryggd Free mantiene le basi semplici. Durante il progetto pilota, puoi visualizzare in anteprima le funzionalità avanzate:',
        'watchOver.limitReached': 'Puoi sorvegliare {{max}} persona con il piano gratuito. Disponibile nella versione completa.',
    },
    'ja': {
        'plus.badge': 'プレビュー',
        'plus.heading': '高度な機能を試す',
        'plus.comingSoon.title': 'プレビュー',
        'plus.comingSoon.button': '高度な機能を試す',
        'settings.homeStyle.plusBadge': 'プレビュー',
        'pilotPreview.dialogTitle': '✨ 高度な機能を試す',
        'pilotPreview.activate': '高度な機能を試す',
        'pilotPreview.expiredTitle': 'プレビューが終了しました',
        'pilotPreview.settingsRowTitle': 'プレビュー',
        'pilotPreview.settingsRowSubtitle': 'パイロット期間中、現在の高度な機能を無料でお試しください。',
        'pilotPreview.activeRowTitle': 'プレビュー進行中',
        'pilotPreview.activeRowSubtitle': 'パイロット期間中、現在の高度な機能が利用可能です。',
        'pilotPreview.activatedMessage': 'プレビューが有効になりました。ホームが拡張に切り替わりました。いつでも設定からシンプルに戻せます。',
        'onboarding.slides.free.title': 'プレビュー',
        'onboarding.slides.free.body': 'Tryggd Free は基本をシンプルに保ちます。パイロット期間中は、高度な機能をプレビューできます：',
        'onboarding.slides.free.footer': 'プレビューはオプションです。',
        'watchOver.limitReached': '無料プランでは{{max}}人を見守ることができます。フルバージョンで無制限に利用可能。',
    },
    'ko': {
        'plus.badge': '프리뷰',
        'plus.heading': '고급 기능 체험하기',
        'plus.comingSoon.title': '프리뷰',
        'plus.comingSoon.button': '고급 기능 체험하기',
        'settings.homeStyle.plusBadge': '프리뷰',
        'pilotPreview.dialogTitle': '✨ 고급 기능 체험하기',
        'pilotPreview.activate': '고급 기능 체험하기',
        'pilotPreview.expiredTitle': '프리뷰가 종료되었습니다',
        'pilotPreview.settingsRowTitle': '프리뷰',
        'pilotPreview.settingsRowSubtitle': '파일럿 기간 동안 현재 고급 기능을 무료로 체험하세요.',
        'pilotPreview.activeRowTitle': '프리뷰 진행 중',
        'pilotPreview.activeRowSubtitle': '파일럿 기간 동안 현재 고급 기능을 사용할 수 있습니다.',
        'pilotPreview.activatedMessage': '프리뷰가 활성화되었습니다. 홈이 강화됨으로 전환되었습니다. 설정에서 언제든지 간단으로 전환할 수 있습니다.',
        'onboarding.slides.free.body': 'Tryggd Free는 기본을 단순하게 유지합니다. 파일럿 기간 동안 고급 기능을 미리 볼 수 있습니다:',
        'watchOver.limitReached': '무료 플랜에서 {{max}}명을 지켜볼 수 있습니다. 전체 버전에서 무제한 이용 가능.',
    },
    'fi': {
        'plus.badge': 'Esikatselu',
        'plus.heading': 'Kokeile lisäominaisuuksia',
        'plus.comingSoon.title': 'Esikatselu',
        'plus.comingSoon.button': 'Kokeile lisäominaisuuksia',
        'settings.homeStyle.plusBadge': 'Esikatselu',
        'pilotPreview.dialogTitle': '✨ Kokeile lisäominaisuuksia',
        'pilotPreview.activate': 'Kokeile lisäominaisuuksia',
        'pilotPreview.expiredTitle': 'Esikatselu on päättynyt',
        'pilotPreview.settingsRowTitle': 'Esikatselu',
        'pilotPreview.settingsRowSubtitle': 'Kokeile nykyisiä lisäominaisuuksia ilmaiseksi esikatselujakson aikana.',
        'pilotPreview.activeRowTitle': 'Esikatselu aktiivinen',
        'pilotPreview.activeRowSubtitle': 'Nykyiset lisäominaisuudet ovat saatavilla esikatselujakson aikana.',
        'pilotPreview.activatedMessage': 'Esikatselu on nyt aktiivinen. Koti on asetettu Laajennetuksi. Voit vaihtaa takaisin Yksinkertaiseksi milloin tahansa Asetuksista.',
        'onboarding.slides.free.body': 'Tryggd Free pitää perusasiat yksinkertaisina. Pilottijakson aikana voit esikatsella lisäominaisuuksia:',
        'watchOver.limitReached': 'Voit seurata {{max}} henkilöä ilmaisella suunnitelmalla. Täysversiossa rajoittamattomasti.',
    },
    'zh-Hans': {
        'plus.badge': '预览',
        'plus.heading': '免费体验高级功能',
        'plus.comingSoon.title': '预览',
        'plus.comingSoon.button': '免费体验高级功能',
        'settings.homeStyle.plusBadge': '预览',
        'home.plusWellness.title': '高级功能',
        'contacts.plusFeature.title': '高级功能',
        'pilotPreview.dialogTitle': '✨ 免费体验高级功能',
        'pilotPreview.activate': '免费体验高级功能',
        'pilotPreview.expiredTitle': '预览已结束',
        'pilotPreview.settingsRowTitle': '预览',
        'pilotPreview.settingsRowSubtitle': '试用期间可免费体验目前的高级功能。',
        'pilotPreview.activeRowTitle': '预览进行中',
        'pilotPreview.activeRowSubtitle': '试用期间可使用目前的高级功能。',
        'pilotPreview.activatedMessage': '预览已开启。主页已切换到增强显示，你可以在设置中随时切换回简易显示。',
        'pilotPreview.dialogPreviewNote': '预览开放至 {{deadline}}。\n预览结束后，账户会自动回到基础版本。',
        'onboarding.slides.free.title': '预览',
        'onboarding.slides.free.body': 'Tryggd Free 保留简单基本功能。试用期间，你可以预览高级功能：',
        'onboarding.slides.free.footer': '预览可自由选择。',
        'home.plusWellness.message': '完整版功能：在打卡时分享今天的感受。',
        'contacts.plusFeature.notifications': '完整版功能：控制联系人打卡通知。',
        'contacts.plusFeature.location': '完整版功能：为联系人启用位置分享。',
        'watchOver.limitReached': '免费方案可关注 {{max}} 位联系人。完整版可无限关注。',
    },
    'zh-Hant': {
        'plus.badge': '預覽',
        'plus.heading': '免費體驗進階功能',
        'plus.comingSoon.title': '預覽',
        'plus.comingSoon.button': '免費體驗進階功能',
        'settings.homeStyle.plusBadge': '預覽',
        'home.plusWellness.title': '高級功能',
        'contacts.plusFeature.title': '高級功能',
        'pilotPreview.dialogTitle': '✨ 免費體驗進階功能',
        'pilotPreview.activate': '免費體驗進階功能',
        'pilotPreview.expiredTitle': '預覽已結束',
        'pilotPreview.settingsRowTitle': '預覽',
        'pilotPreview.settingsRowSubtitle': '試用期間可免費體驗目前的高級功能。',
        'pilotPreview.activeRowTitle': '預覽進行中',
        'pilotPreview.activeRowSubtitle': '試用期間可使用目前的高級功能。',
        'pilotPreview.activatedMessage': '預覽已開啟。主頁已切換到加強顯示，你可以在設定中隨時改回簡易顯示。',
        'pilotPreview.dialogPreviewNote': '預覽開放至 {{deadline}}。\n預覽結束後，帳戶會自動回到基礎版本。',
        'onboarding.slides.free.title': '預覽',
        'onboarding.slides.free.body': 'Tryggd Free 保留簡單基本功能。試用期間，你可以預覽高級功能：',
        'onboarding.slides.free.footer': '預覽可自由選擇。',
        'home.plusWellness.message': '完整版功能：在打卡時分享今天的感受。',
        'contacts.plusFeature.notifications': '完整版功能：控制聯絡人打卡通知。',
        'contacts.plusFeature.location': '完整版功能：為聯絡人啟用位置分享。',
        'watchOver.limitReached': '免費方案可關注 {{max}} 位聯絡人。完整版可無限關注。',
    },
    'th': {
        'plus.badge': 'ตัวอย่าง',
        'plus.heading': 'ลองใช้คุณสมบัติขั้นสูงฟรี',
        'plus.comingSoon.title': 'ตัวอย่าง',
        'plus.comingSoon.button': 'ลองใช้คุณสมบัติขั้นสูงฟรี',
        'settings.homeStyle.plusBadge': 'ตัวอย่าง',
        'home.plusWellness.title': 'ฟีเจอร์ขั้นสูง',
        'contacts.plusFeature.title': 'ฟีเจอร์ขั้นสูง',
        'pilotPreview.dialogTitle': '✨ ลองใช้คุณสมบัติขั้นสูงฟรี',
        'pilotPreview.activate': 'ลองใช้คุณสมบัติขั้นสูงฟรี',
        'pilotPreview.expiredTitle': 'การดูตัวอย่างสิ้นสุดแล้ว',
        'pilotPreview.settingsRowTitle': 'ดูตัวอย่าง',
        'pilotPreview.settingsRowSubtitle': 'ทดลองใช้ฟีเจอร์ขั้นสูงปัจจุบันฟรีในช่วงนำร่อง',
        'pilotPreview.activeRowTitle': 'กำลังดูตัวอย่าง',
        'pilotPreview.activeRowSubtitle': 'ฟีเจอร์ขั้นสูงปัจจุบันพร้อมใช้งานในช่วงนำร่อง',
        'pilotPreview.activatedMessage': 'ตัวอย่างเปิดใช้งานแล้ว หน้าหลักได้เปลี่ยนเป็นแบบเพิ่มเติม คุณสามารถเปลี่ยนกลับเป็นแบบง่ายได้ทุกเมื่อในการตั้งค่า',
        'onboarding.slides.free.body': 'Tryggd Free รักษาความเรียบง่ายของพื้นฐาน ในช่วงการทดลอง คุณสามารถดูตัวอย่างคุณสมบัติขั้นสูง:',
        'home.plusWellness.message': 'ฟีเจอร์เวอร์ชันเต็ม: แชร์ความรู้สึกพร้อมการเช็กอิน',
        'contacts.plusFeature.notifications': 'ฟีเจอร์เวอร์ชันเต็ม: ควบคุมการแจ้งเตือนเช็กอิน',
        'contacts.plusFeature.location': 'ฟีเจอร์เวอร์ชันเต็ม: เปิดการแชร์ตำแหน่ง',
        'watchOver.limitReached': 'คุณสามารถดูแลได้ {{max}} คนในแผนฟรี เวอร์ชันเต็มไม่จำกัด',
    },
}


def apply_global_replacements(value):
    if isinstance(value, str):
        for old, new in GLOBAL_REPLACEMENTS:
            value = value.replace(old, new)
        return value
    if isinstance(value, dict):
        return {k: apply_global_replacements(v) for k, v in value.items()}
    if isinstance(value, list):
        return [apply_global_replacements(v) for v in value]
    return value


def delete_key(data, path):
    section, key = path
    if section in data and isinstance(data[section], dict):
        data[section].pop(key, None)


def set_nested(data, dot_path, value):
    keys = dot_path.split('.')
    obj = data
    for k in keys[:-1]:
        if k not in obj or not isinstance(obj[k], dict):
            return False
        obj = obj[k]
    if keys[-1] in obj:
        obj[keys[-1]] = value
        return True
    return False


def process_locale(locale):
    path = os.path.join(LOCALE_DIR, f'{locale}.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    # Step 1: delete keys
    for key_path in KEYS_TO_DELETE:
        delete_key(data, key_path)

    # Step 2: global text replacements across all string values
    data = apply_global_replacements(data)

    # Step 3: per-locale overrides at specific key paths (sets final value exactly)
    for dot_path, new_value in PER_LOCALE.get(locale, {}).items():
        set_nested(data, dot_path, new_value)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'  ✓ {locale}.json')


if __name__ == '__main__':
    print('Applying terminology changes to locale files...')
    for locale in LOCALES:
        process_locale(locale)
    print('Done.')
