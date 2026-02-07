// utils/dateFormatter.ts
export interface GreetingInfo {
    greeting: string;
    iconName: string;
}

export const getGreetingInfo = (date: Date, t: any): GreetingInfo => {
    const hour = date.getHours();

    if (hour >= 5 && hour < 12) return {
        greeting: t('home.greetings.morning'),
        iconName: 'sunny',
    };

    if (hour >= 12 && hour < 18) return {
        greeting: t('home.greetings.afternoon'),
        iconName: 'partly-sunny',
    };

    if (hour >= 18 && hour < 22) return {
        greeting: t('home.greetings.evening'),
        iconName: 'moon',
    };

    return {
        greeting: t('home.greetings.night'),
        iconName: 'moon',
    };
};

export const formatTimeLeft = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export const isNearMidnight = (date: Date): boolean => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return (hours === 0 && minutes === 0) || (hours === 23 && minutes === 59);
};

// Helper function to convert numbers to Chinese numerals
const numberToChinese = (num: number): string => {
    const chineseNumbers = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    if (num <= 10) {
        return chineseNumbers[num];
    } else if (num <= 19) {
        return '十' + (num === 10 ? '' : chineseNumbers[num % 10]);
    } else if (num <= 29) {
        return '二十' + (num === 20 ? '' : chineseNumbers[num % 10]);
    } else if (num === 30) {
        return '三十';
    } else if (num === 31) {
        return '三十一';
    } else {
        return num.toString(); // fallback
    }
};

export const formatDateWithTranslation = (date: Date, t: any, language?: string) => {
    const weekdayIndex = date.getDay();
    const monthIndex = date.getMonth();
    const day = date.getDate();

    const lang = language || 'en';

    try {
        const weekdayKey = `home.dateFormats.weekdays.${weekdayIndex}`;
        const monthKey = `home.dateFormats.months.${monthIndex}`;

        const weekday = t(weekdayKey, { lng: lang });
        const month = t(monthKey, { lng: lang });

        const gotWeekday = weekday && typeof weekday === 'string' && !weekday.includes('home.dateFormats');
        const gotMonth = month && typeof month === 'string' && !month.includes('home.dateFormats');

        if (gotWeekday && gotMonth) {
            const isChinese = lang.startsWith('zh') || lang.includes('Chinese');

            if (isChinese) {
                const chineseDay = numberToChinese(day);
                const cleanMonth = month.replace('月', '');
                return `${weekday}, ${cleanMonth}月${chineseDay}号`;
            } else {
                return `${weekday}, ${day} ${month}`;
            }
        }
    } catch (error) {
        console.log('Translation attempt failed:', error);
    }

    // Fallback to English
    const englishWeekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const weekday = englishWeekdays[weekdayIndex];
    const month = englishMonths[monthIndex];

    const isChinese = lang.startsWith('zh') || lang.includes('Chinese');
    if (isChinese) {
        const chineseDay = numberToChinese(day);
        return `${weekday}, ${month}月${chineseDay}号`;
    } else {
        return `${weekday}, ${day} ${month}`;
    }
};

export const formatTime24h = (date: Date, language: string) => {
    const localeMap: Record<string, string> = {
        en: 'en-US',
        sv: 'sv-SE',
        no: 'nb-NO',
        da: 'da-DK',
        fi: 'fi-FI',
        'zh-Hans': 'zh_Hans',
        'zh-Hant': 'zh-Hant',
        zh: 'zh-CN',
    };

    const locale = localeMap[language] || 'en-US';

    try {
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    } catch (error) {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }
};