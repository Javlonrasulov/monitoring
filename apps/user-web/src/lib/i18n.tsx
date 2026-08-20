"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "ru";

const dict = {
  en: {
    appName: "Monitoring Telegram",
    brandTagline: "Chat + device monitoring",
    langEn: "English",
    langRu: "Русский",
    changeTheme: "Change theme",
    changeLanguage: "Change language",
    chats: "Chats",
    settings: "Settings",
    profile: "Profile",
    login: "Sign in",
    logout: "Log out",
    phone: "Phone number",
    phonePlaceholder: "Phone number",
    phoneHelper: "Required",
    password: "Password",
    passwordPlaceholder: "Password",
    passwordHelper: "At least 4 digits",
    passwordReturningHelper: "Required when signing in on this or another phone",
    passwordShow: "Show password",
    passwordHide: "Hide password",
    name: "Name",
    namePlaceholder: "Name",
    nameHelper: "Required for the first sign-in. Shown in chat.",
    inviteCode: "Code",
    codePlaceholder: "Code",
    codeHelper: "Only for first link to another account",
    continue: "Continue",
    pairSubtitle:
      "Enter your phone number and a 4-digit password. New users also enter a name.",
    pairFooter:
      "Sign in with phone and password. On another phone, use the same password.",
    pairErrorTitle: "Something went wrong",
    pairFailed:
      "Could not connect. Check the name, phone number, password, or code.",
    pairInvalidCode: "This code is invalid or already used.",
    pairNameRequired: "Enter your name for the first sign-in.",
    pairPasswordInvalid: "Password must be at least 4 digits",
    pairPasswordWrong: "Wrong password for this phone number",
    pairPhoneRequired: "Phone number is required",
    pairTrialEnded:
      "Free trial ended on this phone. Buy Pro or Pro+ to continue.",
    pairTrialUsed:
      "Free trial already used on this phone. Sign in with your existing account.",
    returningAccountHint:
      "This number is already registered — only password is needed.",
    downloadApp: "Download app",
    search: "Search",
    emptyChats: "No chats yet",
    emptyChatsHint: "Link a device or wait for messages",
    typeMessage: "Message",
    send: "Send",
    linkedDevices: "Linked devices",
    generateCode: "Generate link code",
    enterCode: "Enter link code",
    watchLive: "Watch live",
    unlink: "Unlink",
    subscription: "Subscription",
    pro: "Pro",
    proPlus: "Pro+",
    payCard: "Pay with card",
    payCrypto: "Pay with crypto",
    callCenter: "Call Center",
    editName: "Edit name",
    editPhone: "Edit phone",
    changePin: "Change PIN",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    loading: "Loading…",
    offline: "Offline",
    online: "Online",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
    sessionReplaced: "Signed in on another device",
    newUserHint: "Create your account",
    returningHint: "Welcome back",
    copy: "Copy",
    copied: "Copied",
    noDevices: "No linked devices",
    trialHint: "24h trial live video on first link",
    switchCamera: "Switch camera",
    back: "Back",
    attach: "Attach",
    delete: "Delete",
    edit: "Edit",
    reply: "Reply",
    supportUnread: "Support",
    typing: "typing…",
    lastSeen: "last seen",
    forwarded: "Forwarded",
    deleted: "Deleted",
    edited: "edited",
    deleteEveryone: "Delete for everyone",
    forward: "Forward",
    videoNote: "Video note",
    emptyMedia: "No media yet",
    chatLoadFailed: "Failed to load chat",
    sendFailed: "Send failed",
    uploadFailed: "Upload failed",
    searchFailed: "Search failed",
    liveUnavailable: "Live unavailable",
    cameraSwitchFailed: "Camera switch failed",
    mute: "Mute",
    unmute: "Unmute",
    fullscreen: "Fullscreen",
    frontCamera: "Front",
    backCamera: "Back",
    videoRequired: "video required",
    recordings: "Recordings",
    noRecordings: "No recordings",
    playbackFailed: "Playback failed",
    featVideo: "Live video",
    featAudio: "Live audio",
    featRecordings: "Recordings (3 days)",
    featLinkApps: "Link two apps",
    proBody: "Live video. One linked pair of apps.",
    proPlusBody: "Video + audio + recordings. Link two apps.",
    proPlusLocked: "Pay for Pro first. Then Pro+ unlocks.",
    trialMessage: "Free trial: 24 hours of live video. Then Pro or Pro+ is required.",
    planStatus: "Status: %1 · expires: %2",
    shareHint: "Share a code to link another phone, or enter a code you received.",
    active: "Active",
    inactive: "Inactive",
    subscriptionInactive:
      "A subscription is required for live monitoring and new devices. Chat history is kept.",
    history: "History",
    historyHint: "Last 3 days of recordings (Pro+)",
    historyEmpty: "No recordings yet",
    historyLoadFailed: "Could not load history",
    watchUpgrade: "The 24-hour trial ended. Buy Pro or Pro+ to keep watching.",
    audioProPlusOnly: "Audio is available on Pro+.",
    payGuideTitle: "Read this before paying",
    payGuideBody:
      "Guardarian opens in the browser. The USDT address is copied automatically.\n\nWhat to do:\n1. Tap EUR → choose USD\n2. Change 300 to 25\n3. Check USDT TRX\n4. Tap Buy\n5. If asked for an address — paste it\n\nWhen ready, tap «I understand» — then payment opens.",
    payGuideOk: "I understand — open payment",
    paySuccess: "Payment confirmed",
    settingsLoadFailed: "Failed to load settings",
    codeCreateFailed: "Could not create code",
    linkSuccess: "Linked",
    linkFailed: "Link failed",
    unlinkSuccess: "Unlinked",
    unlinkFailed: "Unlink failed",
    invoiceFailed: "Invoice failed",
  },
  ru: {
    appName: "Monitoring Telegram",
    brandTagline: "Чат + мониторинг устройства",
    langEn: "English",
    langRu: "Русский",
    changeTheme: "Сменить тему",
    changeLanguage: "Сменить язык",
    chats: "Чаты",
    settings: "Настройки",
    profile: "Профиль",
    login: "Войти",
    logout: "Выйти",
    phone: "Телефон",
    phonePlaceholder: "Номер телефона",
    phoneHelper: "Обязательно",
    password: "Пароль",
    passwordPlaceholder: "Пароль",
    passwordHelper: "Не меньше 4 цифр",
    passwordReturningHelper:
      "Нужен при входе на этом или другом телефоне",
    passwordShow: "Показать пароль",
    passwordHide: "Скрыть пароль",
    name: "Имя",
    namePlaceholder: "Имя",
    nameHelper: "Нужно при первом входе. Это имя видно в чате.",
    inviteCode: "Код",
    codePlaceholder: "Код",
    codeHelper: "Только при первой привязке к другому аккаунту",
    continue: "Войти",
    pairSubtitle:
      "Введите номер телефона и пароль из 4 цифр. При первом входе укажите также имя.",
    pairFooter:
      "Вход по телефону и паролю. На другом телефоне — тот же пароль.",
    pairErrorTitle: "Произошла ошибка",
    pairFailed:
      "Не удалось подключить. Проверьте имя, телефон, пароль или код.",
    pairInvalidCode: "Код недействителен или уже использован.",
    pairNameRequired: "Для первого входа укажите имя.",
    pairPasswordInvalid: "Пароль должен содержать минимум 4 цифры",
    pairPasswordWrong: "Неверный пароль для этого номера",
    pairPhoneRequired: "Укажите номер телефона",
    pairTrialEnded:
      "На этом телефоне бесплатный период закончился. Купите Pro или Pro+, чтобы продолжить.",
    pairTrialUsed:
      "На этом телефоне бесплатный период уже использован. Войдите в существующий аккаунт.",
    returningAccountHint:
      "Этот номер уже зарегистрирован — нужен только пароль.",
    downloadApp: "Скачать приложение",
    search: "Поиск",
    emptyChats: "Пока нет чатов",
    emptyChatsHint: "Привяжите устройство или дождитесь сообщений",
    typeMessage: "Сообщение",
    send: "Отправить",
    linkedDevices: "Связанные устройства",
    generateCode: "Создать код",
    enterCode: "Ввести код",
    watchLive: "Смотреть эфир",
    unlink: "Отвязать",
    subscription: "Подписка",
    pro: "Pro",
    proPlus: "Pro+",
    payCard: "Оплатить картой",
    payCrypto: "Крипто",
    callCenter: "Колл-центр",
    editName: "Изменить имя",
    editPhone: "Изменить телефон",
    changePin: "Сменить PIN",
    save: "Сохранить",
    cancel: "Отмена",
    confirm: "Подтвердить",
    loading: "Загрузка…",
    offline: "Не в сети",
    online: "В сети",
    theme: "Тема",
    language: "Язык",
    light: "Светлая",
    dark: "Тёмная",
    system: "Система",
    sessionReplaced: "Вход с другого устройства",
    newUserHint: "Создайте аккаунт",
    returningHint: "С возвращением",
    copy: "Копировать",
    copied: "Скопировано",
    noDevices: "Нет связанных устройств",
    trialHint: "24ч пробного видео при первой привязке",
    switchCamera: "Камера",
    back: "Назад",
    attach: "Файл",
    delete: "Удалить",
    edit: "Изменить",
    reply: "Ответить",
    supportUnread: "Поддержка",
    typing: "печатает…",
    lastSeen: "был(а)",
    forwarded: "Переслано",
    deleted: "Удалено",
    edited: "изм.",
    deleteEveryone: "Удалить у всех",
    forward: "Переслать",
    videoNote: "Видеосообщение",
    emptyMedia: "Пока нет медиа",
    chatLoadFailed: "Не удалось загрузить чат",
    sendFailed: "Не удалось отправить",
    uploadFailed: "Не удалось загрузить",
    searchFailed: "Поиск не удался",
    liveUnavailable: "Эфир недоступен",
    cameraSwitchFailed: "Не удалось сменить камеру",
    mute: "Без звука",
    unmute: "Со звуком",
    fullscreen: "На весь экран",
    frontCamera: "Передняя",
    backCamera: "Задняя",
    videoRequired: "нужно видео",
    recordings: "Записи",
    noRecordings: "Нет записей",
    playbackFailed: "Не удалось открыть запись",
    featVideo: "Видеоэфир",
    featAudio: "Звук эфира",
    featRecordings: "Записи (3 дня)",
    featLinkApps: "Связать два приложения",
    proBody: "Видеоэфир. Одна пара приложений.",
    proPlusBody: "Видео + звук + записи. Можно связать два приложения.",
    proPlusLocked: "Сначала оплатите Pro — затем откроется Pro+.",
    trialMessage:
      "Пробный период: 24 часа видео. Затем нужен Pro или Pro+.",
    planStatus: "Статус: %1 · до: %2",
    shareHint:
      "Поделитесь кодом, чтобы связать другой телефон, или введите полученный код.",
    active: "Активна",
    inactive: "Неактивна",
    subscriptionInactive:
      "Для эфира и новых устройств нужна подписка. История чата сохраняется.",
    history: "История",
    historyHint: "Записи за последние 3 дня (Pro+)",
    historyEmpty: "Записей пока нет",
    historyLoadFailed: "Не удалось загрузить историю",
    watchUpgrade:
      "24-часовой пробный период закончился. Купите Pro или Pro+, чтобы смотреть дальше.",
    audioProPlusOnly: "Звук доступен на Pro+.",
    payGuideTitle: "Прочитайте перед оплатой",
    payGuideBody:
      "Guardarian откроется в браузере. Адрес USDT скопируется автоматически.\n\nЧто делать:\n1. Нажмите EUR → выберите USD\n2. Замените 300 на 25\n3. Проверьте USDT TRX\n4. Нажмите Buy\n5. Если спросят адрес — вставьте\n\nКогда будете готовы, нажмите «Понятно» — затем откроется оплата.",
    payGuideOk: "Понятно — открыть оплату",
    paySuccess: "Оплата подтверждена",
    settingsLoadFailed: "Не удалось загрузить настройки",
    codeCreateFailed: "Не удалось создать код",
    linkSuccess: "Связано",
    linkFailed: "Не удалось связать",
    unlinkSuccess: "Отвязано",
    unlinkFailed: "Не удалось отвязать",
    invoiceFailed: "Не удалось создать счёт",
  },
} as const;

export type MsgKey = keyof typeof dict.en;

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MsgKey) => string;
};

const I18nContext = createContext<I18nCtx | null>(null);
const LOCALE_KEY = "levelapp.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored === "ru" ? "ru" : "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_KEY, l);
  }, []);

  const t = useCallback(
    (key: MsgKey) => dict[locale][key] ?? dict.en[key],
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
