"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "uz" | "ru" | "en";

const STORAGE_KEY = "monitor.locale";

const uz = {
  langUz: "Oʻz",
  langRu: "Ру",
  langEn: "En",
  langSwitch: "Tilni o‘zgartirish",
  loading: "Yuklanmoqda…",

  navDevices: "Qurilmalar",
  navArchive: "Video arxiv",
  navLogout: "Chiqish",
  navMenu: "Menyu",
  navClose: "Yopish",

  loginSubtitle: "Admin paneliga kirish",
  loginEmail: "Email",
  loginPassword: "Parol",
  loginSubmit: "Kirish",
  loginSubmitting: "Kirilmoqda…",
  loginFailed: "Kirish amalga oshmadi",

  devicesTitle: "Kuzatuv qurilmalari",
  devicesSubtitle: "Qurilmalar holati real vaqtda yangilanadi",
  devicesPairing: "Juftlash kodi",
  devicesLoadError: "Qurilmalar yuklanmadi",
  devicesEmpty:
    "Hali qurilma yo‘q. Juftlash kodi yaratib, Android qurilmani ulang.",

  pairingTitle: "Juftlash kodi",
  pairingClose: "Yopish",
  pairingEnterCode: "Qurilmada ushbu kodni kiriting:",
  pairingHint: "Bu kod muddatsiz — bir marta ulangach doimiy amal qiladi.",
  pairingReady: "Tayyor",
  pairingBranch: "Filial",
  pairingSelectBranch: "Filial tanlang",
  pairingCreate: "Kod yaratish",
  pairingCreating: "Yaratilmoqda…",
  pairingBranchesError: "Filiallar yuklanmadi",
  pairingCreateError: "Kod yaratilmadi",

  deviceBack: "← Qurilmalarga qaytish",
  deviceNotFound: "Qurilma topilmadi",
  deviceBattery: "Batareya",
  deviceNetwork: "Tarmoq",
  deviceLastSeen: "Oxirgi",
  deviceStopWatching: "Tomoshani to‘xtatish",
  deviceWatchLive: "Jonli efirni ko‘rish",
  deviceUnmute: "Ovozni yoqish",
  deviceMute: "Ovozni o‘chirish",
  deviceFullscreen: "To‘liq ekran",
  deviceSnapshot: "Snapshot",
  deviceSnapshotBusy: "Snapshot…",
  deviceQuality: "Sifat",
  deviceVideoNotReady: "Video hali tayyor emas",
  deviceCanvasUnavailable: "Canvas mavjud emas",
  deviceSnapshotSaved: "Snapshot saqlandi",
  deviceSnapshotError: "Snapshot xatosi",
  deviceCameraFront: "Oldi",
  deviceCameraBack: "Orqa",
  deviceCameraBusy: "Kamera…",
  deviceCameraError: "Kamera almashtirilmadi",
  deviceCameraHint: "Telefon 2–5 soniyada kamerani almashtiradi",

  videoConnecting: "Stream ulanmoqda…",
  videoIdle: "Tomosha qilinmayapti",
  videoWhepError: "WHEP xatosi",
  videoStreamFailed: "Stream ulanmadi",
  videoWaitingPublisher: "Telefon efirga qayta ulanmoqda…",

  cardBranchRoom: "Filial / xona",
  cardCharging: "zaryadlanmoqda",
  cardLastSeen: "Oxirgi ko‘rinish",
  cardWatchLive: "Jonli ko‘rish",
  deviceDelete: "O‘chirish",
  deviceConfirmDelete:
    "Bu qurilma ro‘yxatdan o‘chirilsinmi? Qayta ulash uchun yangi juftlash kodi kerak bo‘ladi.",
  deviceDeleteError: "Qurilma o‘chirilmadi",
  deviceDeleting: "O‘chirilmoqda…",

  statusONLINE: "ONLAYN",
  statusOFFLINE: "OFLAYN",
  statusCONNECTING: "ULANMOQDA",
  statusSTREAMING: "EFIRDA",
  statusERROR: "XATO",

  archiveTitle: "Video arxiv",
  archiveSubtitle: "Yozuvlar, timeline va playback",
  archiveAllDevices: "Barcha qurilmalar",
  archiveAllCameras: "Barcha kameralar",
  archiveToday: "Bugun",
  archiveYesterday: "Kecha",
  archiveLast7: "Oxirgi 7 kun",
  archiveLast30: "Oxirgi 30 kun",
  archiveCustom: "Custom",
  archiveFrom: "Dan",
  archiveTo: "Gacha",
  archiveSearch: "Qidirish",
  archiveEmpty: "Shu filtrda yozuv yo‘q",
  archivePlay: "Play",
  archivePause: "Pause",
  archiveSpeed: "Tezlik",
  archiveDownload: "Yuklab olish",
  archiveDownloadRange: "Oralig‘ni ZIP qilish",
  archiveDelete: "O‘chirish",
  archiveDeleteSelected: "Tanlanganlarni o‘chirish",
  archiveDeleteRange: "Oralig‘ni o‘chirish",
  archiveDeleteAll: "Hammasini o‘chirish",
  archiveConfirmDelete: "Yozuv(lar) o‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.",
  archiveCancel: "Bekor qilish",
  archiveStorage: "Storage",
  archiveRecordingSize: "Yozuvlar",
  archiveFree: "Bo‘sh",
  archiveRetention: "Saqlash muddati",
  archiveDays: "kun",
  archiveAutoCleanup: "Avto tozalash",
  archiveOn: "Yoqilgan",
  archiveOff: "O‘chiq",
  archiveStatusRECORDING: "YOZILMOQDA",
  archiveStatusPROCESSING: "TAYYORLANMOQDA",
  archiveStatusREADY: "TAYYOR",
  archiveStatusFAILED: "XATO",
  archiveStatusDELETED: "O‘CHIRILGAN",
  archiveGap: "Bo‘sh",
  archiveSelect: "Tanlash",
  archiveNoPlayer: "Playback uchun yozuvni tanlang",
  archiveLoadError: "Arxiv yuklanmadi",

  brandName: "Monitoring Telegram",
  navUsers: "Userlar",
  navSubscriptions: "Obunalar",
  navChats: "Chatlar",
  navLive: "Live",
  navAudit: "Audit",
  pairingQr: "QR kod",
  pairingExpires: "Kod 10 daqiqa amal qiladi, bir marta ishlatiladi.",
  usersTitle: "Userlar",
  usersSubtitle: "OWNER, USER va admin hisoblar",
  usersEmpty: "Userlar yo‘q",
  usersBlock: "Bloklash",
  usersActivate: "Aktivlashtirish",
  usersRole: "Rol",
  usersDevice: "Qurilma",
  usersLastSeen: "Oxirgi ko‘rinish",
  subsTitle: "Obunalar",
  subsSubtitle: "1 obuna = 2 ta qurilma",
  subsActivate: "Demo obunani yoqish",
  subsDevices: "Qurilmalar",
  subsExpires: "Tugash",
  subsStatus: "Holat",
  chatsTitle: "Chatlar",
  chatsSubtitle: "Faqat ko‘rish — admin yozolmaydi",
  chatsEmpty: "Chat yo‘q",
  chatsOpen: "Ochish",
  chatMessages: "Xabarlar",
  chatEmpty: "Xabar yo‘q",
  liveTitle: "Live sessiyalar",
  liveSubtitle: "Mavjud stream sessiyalari",
  liveEmpty: "Sessiya yo‘q",
  liveOpenDevice: "Qurilmani ochish",
  auditTitle: "Audit log",
  auditEmpty: "Yozuv yo‘q",
} as const;

const ru: { [K in keyof typeof uz]: string } = {
  langUz: "Oʻz",
  langRu: "Ру",
  langEn: "En",
  langSwitch: "Сменить язык",
  loading: "Загрузка…",

  navDevices: "Устройства",
  navArchive: "Видеоархив",
  navLogout: "Выйти",
  navMenu: "Меню",
  navClose: "Закрыть",

  loginSubtitle: "Вход в админ-панель",
  loginEmail: "Email",
  loginPassword: "Пароль",
  loginSubmit: "Войти",
  loginSubmitting: "Вход…",
  loginFailed: "Не удалось войти",

  devicesTitle: "Устройства наблюдения",
  devicesSubtitle: "Статус устройств обновляется в реальном времени",
  devicesPairing: "Код привязки",
  devicesLoadError: "Не удалось загрузить устройства",
  devicesEmpty:
    "Пока нет устройств. Создайте код привязки и подключите Android-устройство.",

  pairingTitle: "Код привязки",
  pairingClose: "Закрыть",
  pairingEnterCode: "Введите этот код на устройстве:",
  pairingHint: "Код бессрочный — после одного подключения действует постоянно.",
  pairingReady: "Готово",
  pairingBranch: "Филиал",
  pairingSelectBranch: "Выберите филиал",
  pairingCreate: "Создать код",
  pairingCreating: "Создание…",
  pairingBranchesError: "Не удалось загрузить филиалы",
  pairingCreateError: "Не удалось создать код",

  deviceBack: "← Назад к устройствам",
  deviceNotFound: "Устройство не найдено",
  deviceBattery: "Батарея",
  deviceNetwork: "Сеть",
  deviceLastSeen: "Последний раз",
  deviceStopWatching: "Остановить просмотр",
  deviceWatchLive: "Смотреть эфир",
  deviceUnmute: "Включить звук",
  deviceMute: "Выключить звук",
  deviceFullscreen: "На весь экран",
  deviceSnapshot: "Снимок",
  deviceSnapshotBusy: "Снимок…",
  deviceQuality: "Качество",
  deviceVideoNotReady: "Видео ещё не готово",
  deviceCanvasUnavailable: "Canvas недоступен",
  deviceSnapshotSaved: "Снимок сохранён",
  deviceSnapshotError: "Ошибка снимка",
  deviceCameraFront: "Передняя",
  deviceCameraBack: "Задняя",
  deviceCameraBusy: "Камера…",
  deviceCameraError: "Не удалось сменить камеру",
  deviceCameraHint: "Телефон сменит камеру за 2–5 секунд",

  videoConnecting: "Подключение к эфиру…",
  videoIdle: "Просмотр не начат",
  videoWhepError: "Ошибка WHEP",
  videoStreamFailed: "Не удалось подключить эфир",
  videoWaitingPublisher: "Телефон снова выходит в эфир…",

  cardBranchRoom: "Филиал / комната",
  cardCharging: "заряжается",
  cardLastSeen: "Последняя активность",
  cardWatchLive: "Смотреть эфир",
  deviceDelete: "Удалить",
  deviceConfirmDelete:
    "Удалить это устройство из списка? Для повторной привязки понадобится новый код.",
  deviceDeleteError: "Не удалось удалить устройство",
  deviceDeleting: "Удаление…",

  statusONLINE: "ОНЛАЙН",
  statusOFFLINE: "ОФЛАЙН",
  statusCONNECTING: "ПОДКЛЮЧЕНИЕ",
  statusSTREAMING: "ЭФИР",
  statusERROR: "ОШИБКА",

  archiveTitle: "Видеоархив",
  archiveSubtitle: "Записи, таймлайн и воспроизведение",
  archiveAllDevices: "Все устройства",
  archiveAllCameras: "Все камеры",
  archiveToday: "Сегодня",
  archiveYesterday: "Вчера",
  archiveLast7: "Последние 7 дней",
  archiveLast30: "Последние 30 дней",
  archiveCustom: "Свой период",
  archiveFrom: "С",
  archiveTo: "До",
  archiveSearch: "Поиск",
  archiveEmpty: "По этому фильтру записей нет",
  archivePlay: "Play",
  archivePause: "Pause",
  archiveSpeed: "Скорость",
  archiveDownload: "Скачать",
  archiveDownloadRange: "Скачать ZIP за период",
  archiveDelete: "Удалить",
  archiveDeleteSelected: "Удалить выбранные",
  archiveDeleteRange: "Удалить период",
  archiveDeleteAll: "Удалить все",
  archiveConfirmDelete: "Удалить запись(и)? Это действие нельзя отменить.",
  archiveCancel: "Отмена",
  archiveStorage: "Storage",
  archiveRecordingSize: "Записи",
  archiveFree: "Свободно",
  archiveRetention: "Срок хранения",
  archiveDays: "дн.",
  archiveAutoCleanup: "Автоочистка",
  archiveOn: "Вкл",
  archiveOff: "Выкл",
  archiveStatusRECORDING: "ЗАПИСЬ",
  archiveStatusPROCESSING: "ОБРАБОТКА",
  archiveStatusREADY: "ГОТОВО",
  archiveStatusFAILED: "ОШИБКА",
  archiveStatusDELETED: "УДАЛЕНО",
  archiveGap: "Пауза",
  archiveSelect: "Выбрать",
  archiveNoPlayer: "Выберите запись для воспроизведения",
  archiveLoadError: "Не удалось загрузить архив",

  brandName: "Monitoring Telegram",
  navUsers: "Пользователи",
  navSubscriptions: "Подписки",
  navChats: "Чаты",
  navLive: "Live",
  navAudit: "Аудит",
  pairingQr: "QR-код",
  pairingExpires: "Код действует 10 минут и используется один раз.",
  usersTitle: "Пользователи",
  usersSubtitle: "OWNER, USER и админ-аккаунты",
  usersEmpty: "Нет пользователей",
  usersBlock: "Заблокировать",
  usersActivate: "Активировать",
  usersRole: "Роль",
  usersDevice: "Устройство",
  usersLastSeen: "Был в сети",
  subsTitle: "Подписки",
  subsSubtitle: "1 подписка = 2 устройства",
  subsActivate: "Включить демо-подписку",
  subsDevices: "Устройства",
  subsExpires: "Истекает",
  subsStatus: "Статус",
  chatsTitle: "Чаты",
  chatsSubtitle: "Только просмотр — админ не пишет",
  chatsEmpty: "Чатов нет",
  chatsOpen: "Открыть",
  chatMessages: "Сообщения",
  chatEmpty: "Нет сообщений",
  liveTitle: "Live-сессии",
  liveSubtitle: "Существующие сессии трансляции",
  liveEmpty: "Сессий нет",
  liveOpenDevice: "Открыть устройство",
  auditTitle: "Журнал аудита",
  auditEmpty: "Записей нет",
};

const en: { [K in keyof typeof uz]: string } = {
  ...uz,
  langSwitch: "Change language",
  loading: "Loading…",
  navDevices: "Devices",
  navArchive: "Archive",
  navLogout: "Log out",
  navMenu: "Menu",
  navClose: "Close",
  loginSubtitle: "Admin sign in",
  loginEmail: "Email",
  loginPassword: "Password",
  loginSubmit: "Sign in",
  loginSubmitting: "Signing in…",
  loginFailed: "Sign-in failed",
  devicesTitle: "Monitoring devices",
  devicesSubtitle: "Device status updates in real time",
  devicesPairing: "Pairing code",
  navUsers: "Users",
  navSubscriptions: "Subscriptions",
  navChats: "Chats",
  navLive: "Live",
  navAudit: "Audit",
  pairingQr: "QR code",
  pairingExpires: "The code is valid for 10 minutes and can be used once.",
  usersTitle: "Users",
  usersSubtitle: "OWNER, USER and admin accounts",
  usersEmpty: "No users",
  usersBlock: "Block",
  usersActivate: "Activate",
  usersRole: "Role",
  usersDevice: "Device",
  usersLastSeen: "Last seen",
  subsTitle: "Subscriptions",
  subsSubtitle: "1 subscription = 2 devices",
  subsActivate: "Enable demo subscription",
  subsDevices: "Devices",
  subsExpires: "Expires",
  subsStatus: "Status",
  chatsTitle: "Chats",
  chatsSubtitle: "View only — admin cannot send",
  chatsEmpty: "No chats",
  chatsOpen: "Open",
  chatMessages: "Messages",
  chatEmpty: "No messages",
  liveTitle: "Live sessions",
  liveSubtitle: "Existing stream sessions",
  liveEmpty: "No sessions",
  liveOpenDevice: "Open device",
  auditTitle: "Audit log",
  auditEmpty: "No entries",
};

const dictionaries = { uz, ru, en } as const;

export type MessageKey = keyof typeof uz;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "uz";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "ru" || stored === "uz" || stored === "en" ? stored : "uz";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("uz");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionaries[locale][key],
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}

export function localeTag(locale: Locale) {
  return locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uz-UZ";
}
